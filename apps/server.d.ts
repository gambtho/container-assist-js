// Removed ToolRegistry - using native registration
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

export declare class ContainerizationAssistMCPServer {
  private server;
  private services;
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
  getRegisteredTools(): Array<{ name: string; description: string }>;
  getHealth(): Promise<HealthStatus>;
  listTools(): Promise<{ success: boolean; tools: Tool[]; count: number }>;
  shutdown(): void;
}
//# sourceMappingURL=server.d.ts.map
