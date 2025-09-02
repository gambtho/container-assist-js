/**
 * Tools Resource Provider for MCP SDK
 * Provides access to tool registry, tool metadata, and tool usage analytics
 */

// import type { Server } from '@modelcontextprotocol/sdk/server/index';
import type { Logger } from 'pino';
import type { ToolRegistry } from '../tools/ops/registry';

export class ToolsResourceProvider {
  private toolUsageStats = new Map<
    string,
    {
      count: number;
      lastUsed: string;
      averageDuration: number;
      successRate: number;
      errors: number;
    }
  >();

  constructor(
    private toolRegistry: ToolRegistry,
    private logger: Logger
  ) {
    this.logger = logger.child({ component: 'ToolsResourceProvider' });
  }

  /**
   * Register tool-related MCP resources
   */
  getResources(): Array<any> {
    // Tool registry resource
    return [
      {
        uri: 'tools://registry',
        name: 'Tool Registry',
        description: 'Complete tool registry with metadata and capabilities',
        mimeType: 'application/json',
        handler: async () => {
          try {
            const toolList = await this.toolRegistry.listTools();
            const toolCount = this.toolRegistry.getToolCount();

            const registry = {
              total: toolCount,
              categories: {} as Record<string, number>,
              tools:
                toolList.tools?.map((tool: unknown) => ({
                  name: tool.name,
                  description: tool.description,
                  category: this.getToolCategory(tool.name),
                  inputSchema: tool.inputSchema,
                  capabilities: this.getToolCapabilities(tool.name),
                  usage: this.toolUsageStats.get(tool.name) || {
                    count: 0,
                    lastUsed: 'never',
                    averageDuration: 0,
                    successRate: 0,
                    errors: 0
                  }
                })) || [],
              timestamp: new Date().toISOString()
            };

            // Count tools by category
            for (const tool of registry.tools) {
              registry.categories[tool.category] = (registry.categories[tool.category] || 0) + 1;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(registry, null, 2)
                }
              ]
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to get tool registry');
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
      // Tool usage analytics resource
      {
        uri: 'tools://analytics',
        name: 'Tool Usage Analytics',
        description: 'Tool usage statistics and performance metrics',
        mimeType: 'application/json',
        handler: async () => {
          try {
            const analytics = {
              overview: {
                totalTools: this.toolRegistry.getToolCount(),
                totalUsage: Array.from(this.toolUsageStats.values()).reduce(
                  (sum, stats) => sum + stats.count,
                  0
                ),
                averageSuccessRate: this.calculateAverageSuccessRate(),
                lastAnalysisUpdate: new Date().toISOString()
              },
              topTools: this.getTopTools(5),
              categoryUsage: this.getCategoryUsage(),
              performanceMetrics: this.getPerformanceMetrics(),
              errorAnalysis: this.getErrorAnalysis(),
              recommendations: this.generateRecommendations(),
              timestamp: new Date().toISOString()
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(analytics, null, 2)
                }
              ]
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to get tool analytics');
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
      // Tool dependencies resource
      {
        uri: 'tools://dependencies',
        name: 'Tool Dependencies',
        description: 'Tool dependency graph and service requirements',
        mimeType: 'application/json',
        handler: async () => {
          try {
            const dependencies = {
              serviceDependencies: {
                docker: await this.getToolsByService('docker'),
                kubernetes: await this.getToolsByService('kubernetes'),
                ai: await this.getToolsByService('ai'),
                session: await this.getToolsByService('session')
              },
              toolChains: this.getToolChains(),
              criticalPaths: this.getCriticalPaths(),
              serviceHealth: {
                docker: 'unknown', // Would be determined by actual service health
                kubernetes: 'unknown',
                ai: 'unknown',
                session: 'healthy'
              },
              timestamp: new Date().toISOString()
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(dependencies, null, 2)
                }
              ]
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to get tool dependencies');
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
      // Tool documentation resource
      {
        uri: 'tools://documentation',
        name: 'Tool Documentation',
        description: 'Comprehensive tool documentation and usage examples',
        mimeType: 'application/json',
        handler: async () => {
          try {
            const toolList = await this.toolRegistry.listTools();

            const documentation = {
              tools:
                toolList.tools?.map((tool: unknown) => ({
                  name: tool.name,
                  description: tool.description,
                  category: this.getToolCategory(tool.name),
                  usage: {
                    parameters: this.getToolParameters(tool),
                    examples: this.getToolExamples(tool.name),
                    commonPatterns: this.getCommonPatterns(tool.name)
                  },
                  chainWith: this.getToolChainSuggestions(tool.name),
                  troubleshooting: this.getTroubleshootingTips(tool.name)
                })) || [],
              workflows: {
                fullContainerization: [
                  'analyze_repository',
                  'generate_dockerfile',
                  'build_image',
                  'generate_k8s_manifests',
                  'deploy_application'
                ],
                quickStart: ['analyze_repository', 'generate_dockerfile', 'build_image'],
                production: [
                  'analyze_repository',
                  'resolve_base_images',
                  'generate_dockerfile',
                  'build_image',
                  'scan_image',
                  'tag_image',
                  'push_image',
                  'generate_k8s_manifests',
                  'prepare_cluster',
                  'deploy_application',
                  'verify_deployment'
                ]
              },
              timestamp: new Date().toISOString()
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(documentation, null, 2)
                }
              ]
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to get tool documentation');
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
      }
    ];
  }

  /**
   * Update tool usage statistics
   */
  updateToolUsage(toolName: string, duration: number, success: boolean): void {
    const existing = this.toolUsageStats.get(toolName) || {
      count: 0,
      lastUsed: 'never',
      averageDuration: 0,
      successRate: 0,
      errors: 0
    };

    const newCount = existing.count + 1;
    const newErrors = success ? existing.errors : existing.errors + 1;

    this.toolUsageStats.set(toolName, {
      count: newCount,
      lastUsed: new Date().toISOString(),
      averageDuration: (existing.averageDuration * existing.count + duration) / newCount,
      successRate: ((newCount - newErrors) / newCount) * 100,
      errors: newErrors
    });
  }

  // Helper methods
  private getToolCategory(toolName: string): string {
    if (toolName.includes('analyze') || toolName.includes('resolve')) return 'analysis';
    if (toolName.includes('generate') || toolName.includes('create')) return 'generation';
    if (
      toolName.includes('build') ||
      toolName.includes('tag') ||
      toolName.includes('push') ||
      toolName.includes('scan')
    )
      return 'docker';
    if (toolName.includes('k8s') || toolName.includes('deploy') || toolName.includes('cluster'))
      return 'kubernetes';
    if (toolName.includes('workflow') || toolName.includes('start')) return 'orchestration';
    return 'utility';
  }

  private getToolCapabilities(toolName: string): string[] {
    const capabilities = [];
    if (toolName.includes('analyze')) capabilities.push('analysis', 'file-system');
    if (toolName.includes('generate')) capabilities.push('generation', 'templating');
    if (toolName.includes('build')) capabilities.push('docker', 'container-build');
    if (toolName.includes('k8s') || toolName.includes('deploy'))
      capabilities.push('kubernetes', 'orchestration');
    if (toolName.includes('workflow')) capabilities.push('workflow-management', 'state-tracking');
    return capabilities;
  }

  private calculateAverageSuccessRate(): number {
    const stats = Array.from(this.toolUsageStats.values());
    if (stats.length === 0) return 0;
    return stats.reduce((sum, stat) => sum + stat.successRate, 0) / stats.length;
  }

  private getTopTools(limit: number) {
    return Array.from(this.toolUsageStats.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, limit)
      .map(([name, stats]) => ({ name, ...stats }));
  }

  private getCategoryUsage() {
    const categoryStats: Record<string, { count: number; errors: number }> = {};

    for (const [toolName, stats] of Array.from(this.toolUsageStats.entries())) {
      const category = this.getToolCategory(toolName);
      if (!categoryStats[category]) {
        categoryStats[category] = { count: 0, errors: 0 };
      }
      categoryStats[category]!.count += stats?.count ?? 0;
      categoryStats[category]!.errors += stats?.errors ?? 0;
    }

    return categoryStats;
  }

  private getPerformanceMetrics() {
    const stats = Array.from(this.toolUsageStats.values());
    return {
      averageDuration:
        stats.reduce((sum, stat) => sum + stat.averageDuration, 0) / (stats.length || 1),
      slowestTools: Array.from(this.toolUsageStats.entries())
        .sort(([, a], [, b]) => b.averageDuration - a.averageDuration)
        .slice(0, 3)
        .map(([name, stats]) => ({ name, averageDuration: stats.averageDuration }))
    };
  }

  private getErrorAnalysis() {
    const errorStats = Array.from(this.toolUsageStats.entries())
      .filter(([, stats]) => stats.errors > 0)
      .sort(([, a], [, b]) => b.errors - a.errors);

    return {
      toolsWithErrors: errorStats.length,
      mostProblematic: errorStats.slice(0, 5).map(([name, stats]) => ({
        name,
        errors: stats.errors,
        errorRate: (stats.errors / stats.count) * 100
      }))
    };
  }

  private generateRecommendations(): string[] {
    const recommendations = [];
    const stats = Array.from(this.toolUsageStats.values());

    if (stats.some((stat) => stat.successRate < 80)) {
      recommendations.push(
        'Some tools have low success rates - consider debugging or improving error handling'
      );
    }

    if (stats.some((stat) => stat.averageDuration > 30000)) {
      recommendations.push('Some tools are slow - consider optimization or caching improvements');
    }

    const totalUsage = stats.reduce((sum, stat) => sum + stat.count, 0);
    if (totalUsage === 0) {
      recommendations.push('No tool usage recorded - consider implementing usage tracking');
    }

    return recommendations;
  }

  private async getToolsByService(service: string): Promise<string[]> {
    const toolList = await this.toolRegistry.listTools();
    return (toolList.tools ?? [])
      .filter((tool: unknown) => this.getToolCapabilities(tool.name).includes(service))
      .map((tool: unknown) => tool.name);
  }

  private getToolChains() {
    return {
      containerization: ['analyze_repository', 'generate_dockerfile', 'build_image'],
      deployment: ['build_image', 'tag_image', 'push_image', 'deploy_application'],
      fullWorkflow: [
        'start_workflow',
        'analyze_repository',
        'generate_dockerfile',
        'build_image',
        'generate_k8s_manifests',
        'deploy_application'
      ]
    };
  }

  private getCriticalPaths() {
    return [
      {
        path: 'Docker Build Pipeline',
        tools: ['generate_dockerfile', 'build_image'],
        criticality: 'high'
      },
      {
        path: 'Kubernetes Deployment',
        tools: ['generate_k8s_manifests', 'deploy_application'],
        criticality: 'high'
      },
      { path: 'Repository Analysis', tools: ['analyze_repository'], criticality: 'medium' }
    ];
  }

  private getToolParameters(tool: unknown) {
    // Extract parameter information from input schema
    const schema = tool.inputSchema;
    if (!schema?.properties) return {};

    return Object.keys(schema.properties).reduce((params: unknown, key) => {
      params[key] = {
        type: schema.properties[key].type ?? 'unknown',
        required: schema.required?.includes(key) || false,
        description: schema.properties[key].description ?? ''
      };
      return params;
    }, {});
  }

  private getToolExamples(toolName: string): any[] {
    // Return common usage examples for each tool
    const examples: Record<string, any[]> = {
      analyze_repository: [
        { repoPath: '/path/to/repo', depth: 'shallow' },
        { repoPath: '.', depth: 'deep', includeTests: true }
      ],
      generate_dockerfile: [
        { language: 'node', framework: 'express' },
        { language: 'python', framework: 'fastapi', target: 'production' }
      ],
      build_image: [
        { context: '.', tag: 'my-app:latest' },
        { context: '.', dockerfile: 'Dockerfile.prod', tags: ['my-app:v1.0', 'my-app:latest'] }
      ]
    };

    return examples[toolName] || [];
  }

  private getCommonPatterns(toolName: string): string[] {
    const patterns: Record<string, string[]> = {
      analyze_repository: [
        'Run before Dockerfile generation',
        'Use shallow analysis for quick insights'
      ],
      generate_dockerfile: [
        'Multi-stage builds for production',
        'Use Alpine images for smaller size'
      ],
      build_image: ['Tag with version and latest', 'Use build args for configuration']
    };

    return patterns[toolName] || [];
  }

  private getToolChainSuggestions(toolName: string): string[] {
    const chains: Record<string, string[]> = {
      analyze_repository: ['generate_dockerfile', 'resolve_base_images'],
      generate_dockerfile: ['build_image', 'scan_image'],
      build_image: ['scan_image', 'tag_image', 'push_image'],
      generate_k8s_manifests: ['prepare_cluster', 'deploy_application']
    };

    return chains[toolName] || [];
  }

  private getTroubleshootingTips(toolName: string): string[] {
    const tips: Record<string, string[]> = {
      build_image: [
        'Check Docker daemon is running',
        'Verify Dockerfile syntax',
        'Ensure build context is correct'
      ],
      deploy_application: [
        'Verify Kubernetes cluster connectivity',
        'Check namespace exists',
        'Validate manifest syntax'
      ]
    };

    return tips[toolName] || [];
  }
}
