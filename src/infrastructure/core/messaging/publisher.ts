/**
 * Event Publisher
 * Provides centralized event publishing with structured logging and subscriber management
 */

import { EventEmitter } from 'events'
import type { Logger } from '../../domain/types/index.js'
import type { IEventPublisher, EventHandler } from '../../../domain/types/index.js'

export class EventPublisher extends EventEmitter implements IEventPublisher {
  private readonly logger: Logger

  constructor(logger: Logger) {
    super()
    this.logger = logger.child({ component: 'EventPublisher' })
  }

  publish<T = any>(eventType: string, data: T): void {
    this.logger.debug({ eventType, data }); // Fixed logger call
    this.emit(eventType, data)
  }

  subscribe(eventType: string, handler: EventHandler): void {
    this.logger.debug({ eventType }); // Fixed logger call
    this.on(eventType, handler)
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    this.logger.debug({ eventType }); // Fixed logger call
    this.off(eventType, handler)
  }

  removeAllSubscribers(eventType?: string): void {
    if (eventType) {
      this.removeAllListeners(eventType)
      this.logger.debug({ eventType }); // Fixed logger call
    } else {
      this.removeAllListeners()
      this.logger.debug('Removed all subscribers')
    }
  }

  getSubscriberCount(eventType: string): number {
    return this.listenerCount(eventType)
  }
}


