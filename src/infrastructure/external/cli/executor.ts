/**
 * Base CLI Executor for running command-line tools
 * Provides comprehensive error handling, timeouts, and process management
 */

import { execa } from 'execa'
import { ok, fail, type Result } from '../../domain/types/result.js'
import type { Logger } from '../../domain/types/index.js'
import type { z } from 'zod'

// Timeout constants for different operation types
const TIMEOUTS = {
  DEFAULT: 30000,           // 30 seconds
  COMMAND_CHECK: 5000,      // 5 seconds for 'which'/'where' commands
  PROCESS_LIST: 10000,      // 10 seconds for process listing
  LONG_RUNNING: 60000       // 60 seconds for retry operations
} as const

export interface ExecuteOptions {
  cwd?: string
  env?: Record<string, string>
  timeout?: number
  stdin?: string
  shell?: boolean
  signal?: AbortSignal
  encoding?: string
  stripFinalNewline?: boolean
  preferLocal?: boolean
}

export interface StreamOptions extends ExecuteOptions {
  onStdout?: (data: string) => void
  onStderr?: (data: string) => void
  onClose?: (exitCode: number, error?: Error) => void
}

export interface ExecuteResult {
  stdout: string
  stderr: string
  exitCode: number
  duration: number
  command: string
}

export interface CommandConfig {
  command: string
  args?: string[]
  options?: ExecuteOptions
}

export interface ParallelOptions {
  maxConcurrency?: number
}

export interface RetryOptions extends ExecuteOptions {
  maxRetries?: number
  retryDelay?: number
  backoffMultiplier?: number
  retryCondition?: (error: Error, attempt: number) => boolean
}

export class CLIExecutor {
  private readonly logger: Logger

  constructor(logger: Logger) {
    this.logger = (logger as any).child({ component: 'CLIExecutor' })
  }

  /**
   * Execute a command with comprehensive error handling
   */
  async execute(command: string, args: string[] = [], options: ExecuteOptions = {}): Promise<Result<ExecuteResult>> {
    const {
      cwd,
      env,
      timeout = TIMEOUTS.DEFAULT,
      stdin,
      shell = false,
      signal,
      encoding = 'utf8',
      stripFinalNewline = true,
      preferLocal = true
    } = options

    const startTime = Date.now()
    const commandStr = `${command} ${args.join(' ')}`

    this.logger.debug({
      command,
      args,
      cwd,
      timeout,
      shell
    }, 'Executing CLI command')

    try {
      const result = await execa(command, args, {
        ...(cwd && { cwd }),
        env: { ...process.env, ...env },
        timeout,
        ...(stdin !== undefined && { input: stdin }),
        shell,
        ...(signal && { cancelSignal: signal }),
        encoding: encoding as any,
        stripFinalNewline,
        preferLocal,
        reject: false // Don't throw on non-zero exit codes
      })

      const duration = Date.now() - startTime

      // Log execution details
      const logData = {
        command: commandStr,
        exitCode: result.exitCode,
        duration,
        stdout: result.stdout ? result.stdout.length : 0,
        stderr: result.stderr ? result.stderr.length : 0
      }

      if (result.exitCode === 0) {
        this.logger.debug(logData, 'Command executed successfully')

        return ok({
          stdout: String(result.stdout || ''),
          stderr: String(result.stderr || ''),
          exitCode: result.exitCode || 0,
          duration,
          command: commandStr
        })
      } else {
        this.logger.warn({
          ...logData,
          stderr: result.stderr ? String(result.stderr).substring(0, 500) : undefined // First 500 chars of stderr
        }, 'Command failed with non-zero exit code')

        return fail(`Command "${commandStr}" exited with code ${result.exitCode}`)
      }

    } catch (error: any) {
      const duration = Date.now() - startTime

      this.logger.error({
        command: commandStr,
        error: error.message,
        duration
      }, 'Command execution failed')

      // Classify the error
      if (error.timedOut) {
        return fail(`Command "${commandStr}" timed out after ${timeout}ms`)
      }

      if (error.isCanceled) {
        return fail(`Command "${commandStr}" was cancelled`)
      }

      if (error.code === 'ENOENT') {
        return fail(`Command "${command}" not found`)
      }

      if (error.code === 'EACCES') {
        return fail(`Permission denied executing "${command}"`)
      }

      return fail(`Failed to execute "${commandStr}": ${error.message}`)
    }
  }

  /**
   * Execute command and parse JSON output
   */
  async executeJSON<T>(
    command: string,
    args: string[] = [],
    schema?: z.ZodSchema<T> | null,
    options: ExecuteOptions = {}
  ): Promise<Result<ExecuteResult & { data?: T; parsed?: any }>> {
    const result = await this.execute(command, args, options)

    if (!result.success || !result.data) {
      return result as any
    }

    try {
      const parsed = JSON.parse(result.data.stdout)

      // Optional schema validation
      if (schema && typeof schema.parse === 'function') {
        try {
          const validated = schema.parse(parsed)
          return ok({
            ...result.data,
            data: validated,
            parsed
          })
        } catch (validationError: any) {
          return fail(`JSON validation failed: ${validationError.message}`)
        }
      }

      return ok({
        ...result.data,
        data: parsed,
        parsed
      })

    } catch (parseError: any) {
      this.logger.error({
        command: `${command} ${args.join(' ')}`,
        stdout: result.data.stdout.substring(0, 200),
        error: parseError.message
      }, 'Failed to parse JSON output')

      return fail(`Failed to parse JSON output: ${parseError.message}`)
    }
  }

  /**
   * Check if a command is available
   */
  async which(command: string): Promise<Result<boolean>> {
    try {
      const result = await this.execute('which', [command], { timeout: TIMEOUTS.COMMAND_CHECK })
      return ok(result.success && result.data?.exitCode === 0)
    } catch (error) {
      // On Windows, 'which' might not be available
      if (process.platform === 'win32') {
        try {
          const result = await this.execute('where', [command], { timeout: TIMEOUTS.COMMAND_CHECK })
          return ok(result.success && result.data?.exitCode === 0)
        } catch (windowsError) {
          return ok(false)
        }
      }
      return ok(false)
    }
  }

  /**
   * Stream command output with real-time processing
   */
  async executeStream(command: string, args: string[] = [], options: StreamOptions = {}): Promise<Result<any>> {
    const {
      cwd,
      env,
      timeout = TIMEOUTS.LONG_RUNNING,
      signal,
      shell = false,
      onStdout,
      onStderr,
      onClose
    } = options

    this.logger.debug({
      command,
      args,
      timeout
    }, 'Executing streaming command')

    try {
      const child = execa(command, args, {
        ...(cwd && { cwd }),
        env: { ...process.env, ...env },
        timeout,
        ...(signal && { cancelSignal: signal }),
        shell,
        stdio: ['pipe', 'pipe', 'pipe'] as const,
        buffer: false // Don't buffer output for streaming
      } as any)

      // Handle stdout
      if (onStdout && child.stdout) {
        child.stdout.on('data', (chunk: Buffer) => {
          try {
            onStdout(chunk.toString())
          } catch (error) {
            this.logger.error({ error: (error as Error).message }, 'Error in stdout handler')
          }
        })
      }

      // Handle stderr
      if (onStderr && child.stderr) {
        child.stderr.on('data', (chunk: Buffer) => {
          try {
            onStderr(chunk.toString())
          } catch (error) {
            this.logger.error({ error: (error as Error).message }, 'Error in stderr handler')
          }
        })
      }

      // Wait for completion
      const result = await child

      if (onClose) {
        onClose(result.exitCode || 0, undefined)
      }

      return ok({
        exitCode: result.exitCode,
        command: `${command} ${args.join(' ')}`
      })

    } catch (error: any) {
      this.logger.error({
        command: `${command} ${args.join(' ')}`,
        error: error.message
      }, 'Streaming command failed')

      if (onClose) {
        onClose(error.exitCode || -1, error)
      }

      return fail(`Streaming command failed: ${error.message}`)
    }
  }

  /**
   * Execute multiple commands in parallel
   */
  async executeParallel(commands: CommandConfig[], options: ParallelOptions = {}): Promise<Result<Result<ExecuteResult>[]>> {
    const { maxConcurrency = 5 } = options

    this.logger.debug({
      count: commands.length,
      maxConcurrency
    }, 'Executing commands in parallel')

    const semaphore = new Semaphore(maxConcurrency)

    const executeCommand = async (cmdConfig: CommandConfig, index: number) => {
      await semaphore.acquire()
      try {
        const { command, args = [], options: cmdOptions = {} } = cmdConfig
        const result = await this.execute(command, args, cmdOptions)

        return {
          index,
          command: `${command} ${args.join(' ')}`,
          result
        }
      } finally {
        semaphore.release()
      }
    }

    try {
      const promises = commands.map((cmd, index) => executeCommand(cmd, index))
      const parallelResults = await Promise.all(promises)

      // Sort results back to original order
      parallelResults.sort((a, b) => a.index - b.index)

      return ok(parallelResults.map(r => r.result))

    } catch (error: any) {
      this.logger.error({ error: error.message }); // Fixed logger call
      return fail(`Parallel execution failed: ${error.message}`)
    }
  }

  /**
   * Execute with retry logic
   */
  async executeWithRetry(command: string, args: string[] = [], options: RetryOptions = {}): Promise<Result<ExecuteResult>> {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      backoffMultiplier = 2,
      retryCondition = () => true,
      ...execOptions
    } = options

    let lastError: string | null = null
    let delay = retryDelay

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      this.logger.debug({
        command: `${command} ${args.join(' ')}`,
        attempt,
        maxRetries: maxRetries + 1
      }, 'Command execution attempt')

      const result = await this.execute(command, args, execOptions)

      if (result.success) {
        if (attempt > 1) {
          this.logger.info({
            command: `${command} ${args.join(' ')}`,
            attempt
          }, 'Command succeeded after retry')
        }
        return result
      }

      lastError = result.error ? result.error.message : null

      // Check if we should retry
      if (attempt <= maxRetries && lastError && retryCondition(new Error(lastError), attempt)) {
        this.logger.warn({
          command: `${command} ${args.join(' ')}`,
          attempt,
          error: result.error,
          retryIn: delay
        }, 'Command failed, retrying')

        await new Promise(resolve => setTimeout(resolve, delay))
        delay *= backoffMultiplier
      } else {
        break
      }
    }

    return fail(lastError || 'Command failed after retries')
  }

  /**
   * Kill running processes by pattern
   */
  async killProcesses(pattern: string, signal: string = 'SIGTERM'): Promise<Result<any>> {
    const platform = process.platform

    try {
      if (platform === 'win32') {
        // Windows: Use tasklist and taskkill
        const listResult = await this.execute('tasklist', ['/fo', 'csv'], { timeout: TIMEOUTS.PROCESS_LIST })
        if (!listResult.success) {
          return fail('Failed to list processes on Windows')
        }

        // Parse CSV and find matching processes
        if (!listResult.data) {
          return fail('Failed to get process list')
        }
        const processes = this._parseWindowsProcessList(listResult.data.stdout)
        const matchingPids = processes
          .filter((proc: any) => proc.ImageName.includes(pattern))
          .map((proc: any) => proc.PID)

        if (matchingPids.length === 0) {
          return ok({ killedCount: 0, pids: [] })
        }

        // Kill matching processes
        for (const pid of matchingPids) {
          await this.execute('taskkill', ['/PID', pid, '/F'], { timeout: TIMEOUTS.COMMAND_CHECK })
        }

        return ok({ killedCount: matchingPids.length, pids: matchingPids })

      } else {
        // Unix-like: Use pkill
        const result = await this.execute('pkill', [`-${signal}`, '-f', pattern], { timeout: TIMEOUTS.PROCESS_LIST })

        // pkill returns 0 if processes were killed, 1 if no processes matched
        if (result.success || (result.error && result.error.message && result.error.message.includes('exited with code'))) {
          return ok({ signal, pattern })
        }

        return fail(`Failed to kill processes: ${result.error}`)
      }
    } catch (error: any) {
      this.logger.error({ error: error.message, pattern }); // Fixed logger call
      return fail(`Failed to kill processes: ${error.message}`)
    }
  }

  /**
   * Parse Windows process list CSV output
   */
  private _parseWindowsProcessList(csvOutput: string): any[] {
    const lines = csvOutput.split('\n').filter(line => line.trim())
    if (lines.length < 2) return []

    const headers = lines[0]?.split(',').map(h => h.replace(/"/g, '')) || []
    const processes: any[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]?.split(',').map(v => v.replace(/"/g, '')) || []
      const process: any = {}

      headers.forEach((header, index) => {
        process[header] = values[index] || ''
      })

      processes.push(process)
    }

    return processes
  }
}

/**
 * Simple semaphore for controlling concurrency
 */
class Semaphore {
  private readonly max: number
  private current: number = 0
  private readonly queue: Array<() => void> = []

  constructor(max: number) {
    this.max = max
  }

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++
      return
    }

    return new Promise(resolve => {
      this.queue.push(resolve)
    })
  }

  release(): void {
    this.current--
    if (this.queue.length > 0) {
      this.current++
      const resolve = this.queue.shift()
      if (resolve) {
        resolve()
      }
    }
  }
}


