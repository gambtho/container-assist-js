import type { ToolRegistry } from '../src/application/tools/ops/registry.js';
import type { Services } from '../src/services/index.js';
import { type ApplicationConfig } from '../src/config/index.js';

export interface HealthStatus {
  healthy: boolean;
  services: {
    docker: boolean;
    kubernetes: boolean;
    ai: boolean;
    session: boolean;
  };
  version: string;
  timestamp: string;
}

export interface Tool {
  name: string;
  description: string;
  category: string;
  inputSchema: any;
  chainHint?: any;
}

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
  getHealth(): Promise<HealthStatus>;
  listTools(): Promise<{ success: boolean; tools: Tool[]; count: number }>;
  shutdown(): void;
}
//# sourceMappingURL=server.d.ts.map
