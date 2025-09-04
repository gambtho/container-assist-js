import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createToolRegistry, loadAllTools } from '../src/application/tools/registry-utils.js';
import { createPinoLogger } from '../src/infrastructure/logger.js';
import { config as applicationConfig } from '../src/config/index.js';
import process from 'node:process';
import { EventEmitter } from 'events';
import { DockerService } from '../src/services/docker.js';
import { KubernetesService } from '../src/services/kubernetes.js';
import { AIService } from '../src/services/ai.js';
import { SessionService } from '../src/services/session.js';
import { ResourceManager } from '../src/application/resources/index.js';
import { createSampler } from '../src/infrastructure/ai/sampling.js';
export class ContainerKitMCPServer {
    server;
    services;
    toolRegistry;
    resourceManager;
    logger;
    shutdownHandlers = [];
    appConfig;
    constructor(config) {
        this.appConfig = config || applicationConfig;
        this.logger = createPinoLogger({
            level: this.appConfig.server.logLevel,
            environment: this.appConfig.server.nodeEnv,
        });
        this.services = this.createServices();
        this.toolRegistry = createToolRegistry(this.services, this.logger);
        this.server = new McpServer({
            name: 'container-kit-mcp',
            version: '2.0.0',
        });
        this.initializeLogging();
    }
    createMCPSampler() {
        return createSampler({
            type: 'mcp',
            server: this.server,
        }, this.logger);
    }
    createServices() {
        const dockerConfig = {
            socketPath: this.appConfig.infrastructure?.docker?.socketPath || '/var/run/docker.sock',
        };
        if (this.appConfig.infrastructure?.docker?.host !== undefined) {
            dockerConfig.host = this.appConfig.infrastructure.docker.host;
        }
        if (this.appConfig.infrastructure?.docker?.port !== undefined) {
            dockerConfig.port = this.appConfig.infrastructure.docker.port;
        }
        const dockerService = new DockerService(dockerConfig, this.logger.child({ service: 'docker' }));
        const kubernetesConfig = {
            kubeconfig: this.appConfig.infrastructure?.kubernetes?.kubeconfig || '',
            namespace: this.appConfig.infrastructure?.kubernetes?.namespace || 'default',
        };
        if (this.appConfig.infrastructure?.kubernetes?.context !== undefined) {
            kubernetesConfig.context = this.appConfig.infrastructure.kubernetes.context;
        }
        const kubernetesService = new KubernetesService(kubernetesConfig, this.logger.child({ service: 'kubernetes' }));
        const aiService = null;
        const sessionService = new SessionService({
            storeType: 'memory',
            ttl: this.appConfig.session?.ttl || 3600,
        }, this.logger.child({ service: 'session' }));
        return {
            docker: dockerService,
            kubernetes: kubernetesService,
            ai: aiService,
            session: sessionService,
            events: new EventEmitter(),
        };
    }
    initializeLogging() {
    }
    async initialize() {
        this.logger.info('Initializing services with direct injection...');
        await Promise.all([
            this.services.docker.initialize(),
            this.services.kubernetes.initialize(),
            this.services.ai.initialize(),
            this.services.session.initialize(),
        ]);
        this.logger.info('All services initialized successfully');
    }
    async start() {
        try {
            await this.initialize();
            const mcpSampler = this.createMCPSampler();
            this.services.ai = new AIService({}, mcpSampler, this.logger.child({ service: 'ai' }));
            this.toolRegistry.setServer(this.server);
            await loadAllTools(this.toolRegistry);
            this.resourceManager = new ResourceManager(this.appConfig, this.services.session, this.services.docker, this.toolRegistry, this.logger);
            this.resourceManager.registerWithServer(this.server);
            this.setupGracefulShutdown();
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            this.logger.info({
                pid: process.pid,
                version: '2.0.0',
                services: {
                    docker: 'initialized',
                    kubernetes: 'initialized',
                    ai: 'initialized',
                    session: 'initialized',
                },
                resources: {
                    providers: this.resourceManager.getProviderNames(),
                    registered: this.resourceManager.isResourcesRegistered(),
                },
            }, 'MCP server started with constructor injection and resources');
        }
        catch (error) {
            this.logger.error({ error }, 'Failed to start server');
            throw error;
        }
    }
    async getHealthStatus() {
        const services = {
            docker: false,
            kubernetes: false,
            ai: false,
            session: false,
        };
        try {
            const dockerHealth = await this.services.docker.health();
            services.docker = dockerHealth.available ?? false;
        }
        catch (error) {
            this.logger.warn({ error }, 'Docker health check failed');
        }
        try {
            const k8sHealth = await this.services.kubernetes.checkClusterAccess();
            services.kubernetes = k8sHealth;
        }
        catch (error) {
            this.logger.warn({ error }, 'Kubernetes health check failed');
        }
        services.ai = this.services.ai.isAvailable();
        services.session = true;
        return {
            healthy: Object.values(services).every(status => status),
            services,
            version: '2.0.0',
            timestamp: new Date().toISOString(),
        };
    }
    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            this.logger.info({ signal }, 'Received shutdown signal');
            for (const handler of this.shutdownHandlers) {
                try {
                    await handler();
                }
                catch (error) {
                    this.logger.error({ error }, 'Shutdown handler failed');
                }
            }
            try {
                if (this.services.docker && 'cleanup' in this.services.docker) {
                    await this.services.docker.cleanup();
                }
                if (this.services.session && 'cleanup' in this.services.session) {
                    await this.services.session.cleanup();
                }
            }
            catch (error) {
                this.logger.error({ error }, 'Service cleanup failed');
            }
            this.logger.info('Server shutdown complete');
            process.exit(0);
        };
        process.on('SIGTERM', () => void shutdown('SIGTERM'));
        process.on('SIGINT', () => void shutdown('SIGINT'));
    }
    addShutdownHandler(handler) {
        this.shutdownHandlers.push(handler);
    }
    getServices() {
        return this.services;
    }
    getToolRegistry() {
        return this.toolRegistry;
    }
    async getHealth() {
        return this.getHealthStatus();
    }
    async listTools() {
        try {
            const { AVAILABLE_TOOLS } = await import('../src/application/tools/registry-utils.js');
            const { getToolConfig } = await import('../src/application/tools/tool-config.js');
            const toolList = AVAILABLE_TOOLS.map(toolName => {
                const config = getToolConfig(toolName);
                const tool = this.toolRegistry.getTool(toolName);
                if (!tool) {
                    throw new Error(`Tool ${toolName} not found`);
                }
                return {
                    name: config.name,
                    description: config.description,
                    category: config.category || 'utility',
                    inputSchema: tool.inputSchema,
                    chainHint: tool.chainHint,
                };
            });
            return {
                success: true,
                tools: toolList,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                tools: [],
            };
        }
    }
    shutdown() {
        this.setupGracefulShutdown();
    }
}
//# sourceMappingURL=server.js.map