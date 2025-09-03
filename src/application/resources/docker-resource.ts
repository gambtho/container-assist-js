/**
 * Docker Resource Provider for MCP SDK
 * Provides access to Docker context, images, containers, and system information
 */

// import type { Server } from '@modelcontextprotocol/sdk/server/index';
import type { Logger } from 'pino';
import type { DockerService } from '../../services/docker.js';

export class DockerResourceProvider {
  constructor(
    private dockerService: DockerService,
    private logger: Logger
  ) {
    this.logger = logger.child({ component: 'DockerResourceProvider' });
  }

  /**
   * Register Docker-related MCP resources
   */
  getResources(): Array<any> {
    return [
      // Docker system info resource
      {
        uri: 'docker://system',
        name: 'Docker System Information',
        description: 'Docker daemon status and system information',
        mimeType: 'application/json',
        handler: async () => {
          try {
            const health = await this.dockerService.health();

            let systemInfo = null;
            if (health.available && health.client) {
              try {
                // Get system info if Docker is available
                systemInfo = await this.dockerService.getSystemInfo();
              } catch (error) {
                this.logger.debug({ error }, 'Could not get Docker system info');
              }
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      available: health.available,
                      client: health.client,
                      version: health.version ?? null,
                      systemInfo: systemInfo
                        ? {
                            containers: systemInfo.containers ?? 0,
                            images: systemInfo.images ?? 0,
                            serverVersion: systemInfo.serverVersion,
                            architecture: systemInfo.architecture,
                            os: systemInfo.os,
                            kernelVersion: systemInfo.kernelVersion,
                            memTotal: systemInfo.memTotal,
                            cpus: systemInfo.ncpu
                          }
                        : null,
                      timestamp: new Date().toISOString()
                    },
                    null,
                    2
                  )
                }
              ]
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to get Docker system info');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'error',
                      available: false,
                      message: error instanceof Error ? error.message : 'Unknown error',
                      timestamp: new Date().toISOString()
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }
        }
      },
      // Docker images resource
      {
        uri: 'docker://images',
        name: 'Docker Images',
        description: 'List of available Docker images',
        mimeType: 'application/json',
        handler: async () => {
          try {
            const health = await this.dockerService.health();

            if (!health.available) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        status: 'unavailable',
                        message: 'Docker is not available',
                        timestamp: new Date().toISOString()
                      },
                      null,
                      2
                    )
                  }
                ]
              };
            }

            const images = await this.dockerService.listImages();

            const imageList = images.map((image: unknown) => ({
              id: image.Id ?? image.id,
              tags: image.RepoTags ?? (image.tags || []),
              size: image.Size ?? (image.size || 0),
              created: image.Created ?? image.created,
              parentId: image.ParentId ?? image.parentId ?? null
            }));

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      count: imageList.length,
                      images: imageList,
                      timestamp: new Date().toISOString()
                    },
                    null,
                    2
                  )
                }
              ]
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to list Docker images');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'error',
                      message: error instanceof Error ? error.message : 'Unknown error',
                      timestamp: new Date().toISOString()
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }
        }
      },
      // Docker containers resource
      {
        uri: 'docker://containers',
        name: 'Docker Containers',
        description: 'List of Docker containers (running and stopped)',
        mimeType: 'application/json',
        handler: async () => {
          try {
            const health = await this.dockerService.health();

            if (!health.available) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        status: 'unavailable',
                        message: 'Docker is not available',
                        timestamp: new Date().toISOString()
                      },
                      null,
                      2
                    )
                  }
                ]
              };
            }

            const containers = await this.dockerService.listContainers({ all: true });

            const containerList = containers.map((container: unknown) => ({
              id: container.Id ?? container.id,
              names: container.Names ?? (container.names || []),
              image: container.Image ?? container.image,
              state: container.State ?? container.state,
              status: container.Status ?? container.status,
              created: container.Created ?? container.created,
              ports: container.Ports ?? (container.ports || [])
            }));

            const stats = {
              total: containerList.length,
              running: containerList.filter((c) => c.state === 'running').length,
              stopped: containerList.filter((c) => c.state === 'exited').length,
              other: containerList.filter((c) => !['running', 'exited'].includes(c.state)).length
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      stats,
                      containers: containerList,
                      timestamp: new Date().toISOString()
                    },
                    null,
                    2
                  )
                }
              ]
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to list Docker containers');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'error',
                      message: error instanceof Error ? error.message : 'Unknown error',
                      timestamp: new Date().toISOString()
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }
        }
      },
      // Docker build context resource
      {
        uri: 'docker://build-context',
        name: 'Docker Build Context',
        description: 'Information about Docker build contexts and capabilities',
        mimeType: 'application/json',
        handler: async () => {
          try {
            const health = await this.dockerService.health();

            const context = {
              dockerAvailable: health.available,
              client: health.client,
              version: health.version,
              buildCapabilities: {
                dockerfile: true,
                buildx: false, // Would need to check if buildx is available
                multiPlatform: false,
                secrets: false,
                ssh: false
              },
              recommendedBuildArgs: ['NODE_ENV', 'BUILD_DATE', 'VCS_REF', 'VERSION'],
              commonBaseImages: [
                'node:18-alpine',
                'node:18-slim',
                'python:3.11-alpine',
                'python:3.11-slim',
                'openjdk:17-alpine',
                'nginx:alpine',
                'ubuntu:22.04',
                'debian:bullseye-slim'
              ],
              timestamp: new Date().toISOString()
            };

            if (health.available) {
              try {
                // Try to get additional build capabilities
                const systemInfo = await this.dockerService.getSystemInfo();
                if (systemInfo) {
                  context.buildCapabilities.multiPlatform =
                    systemInfo.platforms?.length > 1 ?? false;
                }
              } catch (error) {
                this.logger.debug({ error }, 'Could not get extended build capabilities');
              }
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(context, null, 2)
                }
              ]
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to get Docker build context');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'error',
                      dockerAvailable: false,
                      message: error instanceof Error ? error.message : 'Unknown error',
                      timestamp: new Date().toISOString()
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }
        }
      }
    ];
  }
}
