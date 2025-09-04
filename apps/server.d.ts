import type { ToolRegistry } from '../src/application/tools/ops/registry.js';
import type { Services } from '../src/services/index.js';
import { type ApplicationConfig } from '../src/config/index.js';
export declare class ContainerKitMCPServer {
    private server;
    private services;
    private toolRegistry;
    private resourceManager;
    private logger;
    private shutdownHandlers;
    private appConfig;
    constructor(config?: ApplicationConfig);
    private createMCPSampler;
    private createServices;
    private initializeLogging;
    initialize(): Promise<void>;
    start(): Promise<void>;
    private getHealthStatus;
    private setupGracefulShutdown;
    addShutdownHandler(handler: () => Promise<void>): void;
    getServices(): Services;
    getToolRegistry(): ToolRegistry;
    getHealth(): Promise<any>;
    listTools(): Promise<any>;
    shutdown(): void;
}
//# sourceMappingURL=server.d.ts.map