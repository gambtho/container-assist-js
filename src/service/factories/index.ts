/**
 * Service Factory Index - Orchestrates creation of all service factories
 */

export { AIServiceFactory, type AIServices } from './ai-service-factory.js'
export { InfrastructureServiceFactory, type InfrastructureServices } from './infrastructure-service-factory.js'
export { SessionServiceFactory, type SessionServices } from './session-service-factory.js'

// Combined services type for the new simplified Dependencies class
export interface AllServices extends AIServices, InfrastructureServices, SessionServices {
  // This interface combines all service types
}