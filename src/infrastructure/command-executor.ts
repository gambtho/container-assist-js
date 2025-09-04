/**
 * Command Executor - Utility for executing external commands
 * Provides safe command execution with timeout and error handling
 */

import { spawn, SpawnOptions } from 'node:child_process';
import type { Logger } from 'pino';

export interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  maxBuffer?: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
}

export class CommandExecutor {
  constructor(private readonly logger: Logger) {}

  /**
   * Execute a command with arguments
   */
  async execute(
    command: string,
    args: string[] = [],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    const {
      cwd = process.cwd(),
      env = process.env,
      timeout = 30000,
      maxBuffer = 10 * 1024 * 1024, // 10MB
    } = options;

    this.logger.debug({ command, args, cwd }, 'Executing command');

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let timeoutHandle: NodeJS.Timeout | undefined;

      const spawnOptions: SpawnOptions = {
        cwd,
        env,
        shell: false,
      };

      const child = spawn(command, args, spawnOptions);

      // Set up timeout
      if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 5000);
        }, timeout);
      }

      // Collect stdout
      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length <= maxBuffer) {
          stdout += chunk;
        } else {
          child.kill('SIGTERM');
          reject(new Error(`Command output exceeded maximum buffer size of ${maxBuffer} bytes`));
        }
      });

      // Collect stderr
      child.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stderr.length + chunk.length <= maxBuffer) {
          stderr += chunk;
        }
      });

      // Handle process exit
      child.on('close', (code: number | null) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const exitCode = code ?? -1;

        this.logger.debug({ command, exitCode, timedOut }, 'Command completed');

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode,
          timedOut,
        });
      });

      // Handle process error
      child.on('error', (error: Error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        this.logger.error({ command, error: error.message }, 'Command execution failed');

        reject(error);
      });
    });
  }

  /**
   * Check if a command is available
   */
  async isAvailable(command: string): Promise<boolean> {
    try {
      const result = await this.execute('which', [command], { timeout: 5000 });
      return result.exitCode === 0 && result.stdout.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get command version
   */
  async getVersion(command: string, versionFlag = '--version'): Promise<string | null> {
    try {
      const result = await this.execute(command, [versionFlag], { timeout: 5000 });
      if (result.exitCode === 0 && result.stdout) {
        return result.stdout.split('\n')[0]?.trim() ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }
}
