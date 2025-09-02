/**
 * Docker Client - Direct Dockerode Integration
 * Provides low-level Docker operations using the official Docker daemon API
 */

import Docker from 'dockerode'
import { EventEmitter } from 'events'
import { Result, ok, fail, DockerBuildOptions, DockerBuildResult } from '../../domain/types/index.js'
import type { Logger } from '../../domain/types/index.js'

/**
 * Configuration for Docker client connection
 */
export interface DockerConfig {
  dockerSocket?: string
}


export class DockerClient extends EventEmitter {
  private readonly docker: Docker
  private readonly config: DockerConfig
  private readonly logger: Logger

  constructor(config: DockerConfig, logger: Logger) {
    super()
    this.config = config
    this.logger = logger.child({ component: 'DockerClient' })

    this.docker = new Docker({
      socketPath: config.dockerSocket || '/var/run/docker.sock'
    })
  }

  async buildImage(
    context: string,
    options: DockerBuildOptions = { context }
  ): Promise<Result<DockerBuildResult>> {
    const { dockerfilePath = 'Dockerfile', tag, buildArgs = {} } = options

    this.logger.info({
      context,
      tag,
      dockerfilePath
    }, 'Building Docker image')

    try {
      const stream = await this.docker.buildImage(
        {
          context,
          src: ['Dockerfile', '.']
        },
        {
          t: tag,
          buildargs: buildArgs,
          dockerfile: dockerfilePath
        }
      )

      return new Promise<Result<DockerBuildResult>>((resolve) => {
        const buildLog: string[] = []

        const onFinished = (err: Error | null, output: any[]) => {
          if (err) {
            this.logger.error({ error: err.message }); // Fixed logger call
            resolve(fail(`Docker build failed: ${err.message}`))
          } else {
            const lastOutput = output[output.length - 1]
            const imageId = lastOutput?.aux?.ID

            this.logger.info({imageId }); // Fixed logger call

            resolve(ok({
              success: true,
              imageId,
              buildLog
            }))
          }
        }

        const onProgress = (event: any) => {
          this.emit('build-progress', event)

          if (event.stream) {
            const logLine = event.stream.trim()
            buildLog.push(logLine)
            this.logger.debug({ stream: logLine }); // Fixed logger call
          }

          if (event.error) {
            buildLog.push(`ERROR: ${event.error}`)
          }
        }

        this.docker.modem.followProgress(stream, onFinished, onProgress)
      })

    } catch (error) {
      const message = `Failed to build image: ${(error as Error).message}`
      this.logger.error({ error: (error as Error).message }, 'Docker build failed')
      return fail(message)
    }
  }

  async pushImage(
    tag: string,
    registry?: string
  ): Promise<Result<DockerPushResult>> {
    const fullTag = registry ? `${registry}/${tag}` : tag

    this.logger.info({tag, registry, fullTag }); // Fixed logger call

    try {
      const image = this.docker.getImage(tag)

      // Tag for registry if needed
      if (registry) {
        await image.tag({ repo: fullTag })
      }

      const stream = await image.push()

      return new Promise<Result<DockerPushResult>>((resolve) => {
        this.docker.modem.followProgress(
          stream,
          (err: Error | null) => {
            if (err) {
              this.logger.error({ error: err.message }); // Fixed logger call
              resolve(fail(`Docker push failed: ${err.message}`))
            } else {
              this.logger.info({tag: fullTag }); // Fixed logger call
              resolve(ok({ success: true, tag: fullTag }))
            }
          },
          (event: any) => {
            this.emit('push-progress', event)
          }
        )
      })

    } catch (error) {
      const message = `Failed to push image: ${(error as Error).message}`
      this.logger.error({ error: (error as Error).message }, 'Docker push failed')
      return fail(message)
    }
  }

  async tagImage(
    sourceTag: string,
    targetTag: string
  ): Promise<Result<void>> {
    try {
      const image = this.docker.getImage(sourceTag)
      await image.tag({ repo: targetTag })

      this.logger.info({
        sourceTag,
        targetTag
      }, 'Image tagged successfully')

      return ok(undefined)

    } catch (error) {
      const message = `Failed to tag image: ${(error as Error).message}`
      this.logger.error({ sourceTag, targetTag }); // Fixed logger call
      return fail(message)
    }
  }

  async imageExists(tag: string): Promise<boolean> {
    try {
      const image = this.docker.getImage(tag)
      await image.inspect()
      return true
    } catch {
      return false
    }
  }

  async getImageInfo(tag: string): Promise<Result<any>> {
    try {
      const image = this.docker.getImage(tag)
      const info = await image.inspect()
      return ok(info)
    } catch (error) {
      const message = `Failed to get image info: ${(error as Error).message}`
      return fail(message)
    }
  }

  async close(): Promise<void> {
    // Dockerode doesn't need explicit closing
    this.logger.info('Docker client closed')
  }
}


