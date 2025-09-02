/**
 * Session store factory for creating different store implementations
 * Allows switching between in-memory and persistent stores
 */

import { SessionStore } from '../../domain/types/session-store.js'
import { InMemorySessionStore } from './memory-store.js'
import type { Logger } from '../../domain/types/index.js'

export type StoreType = 'memory'

export interface StoreConfig {
  type: StoreType
  // Common options
  cleanupInterval?: number; // Seconds between cleanup runs
}

export class SessionStoreFactory {
  /**
   * Create a session store based on configuration
   */
  static async create(
    config: StoreConfig,
    logger: Logger
  ): Promise<SessionStore> {
    logger.info({ storeType: config.type }); // Fixed logger call

    if (config.type === 'memory') {
      return new InMemorySessionStore(logger)
    }

    // TypeScript ensures this won't happen with our current type definition
    throw new Error(`Unknown store type: ${config.type}`)
  }

  /**
   * Migrate data from one store to another
   */
  static async migrate(
    from: SessionStore,
    to: SessionStore,
    logger: Logger
  ): Promise<{ total: number; migrated?: number; failed?: number }> {
    logger.info('Starting session store migration')

    const sessions = await from.list()
    let migrated = 0
    let failed = 0

    for (const session of sessions) {
      try {
        await to.create(session)
        migrated++
      } catch (error) {
        logger.error({ sessionId: session.id, error }); // Fixed logger call
        failed++
      }
    }

    logger.info({
      total: sessions.length,
      migrated,
      failed
    }, 'Session store migration completed')

    return {
      total: sessions.length,
      migrated,
      failed,
    }
  }

  /**
   * Get the default store configuration based on environment
   */
  static getDefaultConfig(): StoreConfig {
    return {
      type: 'memory',
      cleanupInterval: 300, // 5 minutes
    }
  }
}


