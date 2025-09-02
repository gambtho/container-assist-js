/**
 * Initialization guards and safety utilities
 */

/**
 * Initialization guard to ensure single initialization
 */
export class InitializationGuard {
  private initialized = false;
  private initializing = false;

  async runOnce(fn: () => Promise<void>): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) {
      // Wait for initialization to complete
      while (this.initializing) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return;
    }

    this.initializing = true;
    try {
      await fn();
      this.initialized = true;
    } finally {
      this.initializing = false;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  reset(): void {
    this.initialized = false;
    this.initializing = false;
  }
}

/**
 * Create a singleton instance with lazy initialization
 */
export function createSingleton<T>(factory: () => T | Promise<T>): () => Promise<T> {
  let instance: T | undefined;
  let initializing = false;

  return async () => {
    if (instance) return instance;

    if (initializing) {
      // Wait for initialization
      while (initializing) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return instance!;
    }

    initializing = true;
    try {
      instance = await factory();
      return instance;
    } finally {
      initializing = false;
    }
  };
}
