/**
 * Shared State Management Utilities
 * Utilities for immutable state updates and deep cloning
 */

/**
 * Deep clone an object
 * Handles arrays, objects, dates, and primitives
 */
export function deepClone<T>(obj: T): T {
  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle primitives
  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle dates
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as T;
  }

  // Handle regular expressions
  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags) as T;
  }

  // Handle Maps
  if (obj instanceof Map) {
    const cloned = new Map();
    obj.forEach((value, key) => {
      cloned.set(deepClone(key), deepClone(value));
    });
    return cloned as T;
  }

  // Handle Sets
  if (obj instanceof Set) {
    const cloned = new Set();
    obj.forEach((value) => {
      cloned.add(deepClone(value));
    });
    return cloned as T;
  }

  // Handle objects
  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      (cloned as any)[key] = deepClone(obj[key]);
    }
  }

  return cloned;
}

/**
 * Immutably update a property in an object
 */
export function immutableUpdate<T, K extends keyof T>(obj: T, key: K, value: T[K]): T {
  return { ...obj, [key]: value };
}

/**
 * Immutably update multiple properties
 */
export function immutableUpdateMultiple<T>(obj: T, updates: Partial<T>): T {
  return { ...obj, ...updates };
}

/**
 * Immutably update a nested property
 */
export function immutableUpdateNested<T>(obj: T, path: string[], value: any): T {
  if (path.length === 0) {
    return value;
  }

  const [head, ...rest] = path;
  if (!head) {
    return value;
  }
  const currentValue = (obj as any)[head];

  if (rest.length === 0) {
    return immutableUpdate(obj, head as keyof T, value);
  }

  return immutableUpdate(obj, head as keyof T, immutableUpdateNested(currentValue, rest, value));
}

/**
 * Immutably remove a property from an object
 */
export function immutableRemove<T, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const { [key]: _, ...rest } = obj;
  return rest;
}

/**
 * Immutably append to an array
 */
export function immutableAppend<T>(arr: T[], item: T): T[] {
  return [...arr, item];
}

/**
 * Immutably prepend to an array
 */
export function immutablePrepend<T>(arr: T[], item: T): T[] {
  return [item, ...arr];
}

/**
 * Immutably remove item from array by index
 */
export function immutableRemoveAt<T>(arr: T[], index: number): T[] {
  return [...arr.slice(0, index), ...arr.slice(index + 1)];
}

/**
 * Immutably update item in array by index
 */
export function immutableUpdateAt<T>(arr: T[], index: number, value: T): T[] {
  const copy = [...arr];
  copy[index] = value;
  return copy;
}

/**
 * Immutably filter an array
 */
export function immutableFilter<T>(arr: T[], predicate: (item: T, index: number) => boolean): T[] {
  return arr.filter(predicate);
}

/**
 * Immutably reverse an array (useful for rollback scenarios)
 */
export function immutableReverse<T>(arr: T[]): T[] {
  return [...arr].reverse();
}

/**
 * Merge two objects deeply
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue !== undefined &&
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        targetValue !== null &&
        targetValue !== undefined &&
        typeof targetValue === 'object'
      ) {
        // Type guard to ensure they are objects for instanceof checks
        const srcObj = sourceValue as object;
        const tgtObj = targetValue as object;

        // Now we know both are objects, check for special types
        if (
          !Array.isArray(srcObj) &&
          !(srcObj instanceof Date) &&
          !(srcObj instanceof RegExp) &&
          !Array.isArray(tgtObj) &&
          !(tgtObj instanceof Date) &&
          !(tgtObj instanceof RegExp)
        ) {
          (result as any)[key] = deepMerge(
            tgtObj as Record<string, any>,
            srcObj as Partial<Record<string, any>>,
          );
        }
      } else if (sourceValue !== undefined) {
        (result as any)[key] = deepClone(sourceValue);
      }
    }
  }

  return result;
}

/**
 * Check if two objects are deeply equal
 */
export function deepEqual<T>(a: T, b: T): boolean {
  if (a === b) {
    return true;
  }

  if (a === null || b === null) {
    return false;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (typeof a !== 'object') {
    return a === b;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  if (Array.isArray(a)) {
    const arrB = b as unknown as any[];
    if (a.length !== arrB.length) {
      return false;
    }
    return a.every((item, index) => deepEqual(item, arrB[index]));
  }

  const keysA = Object.keys(a as any);
  const keysB = Object.keys(b as any);

  if (keysA.length !== keysB.length) {
    return false;
  }

  return keysA.every((key) => deepEqual((a as any)[key], (b as any)[key]));
}

/**
 * Freeze an object deeply (make it immutable)
 */
export function deepFreeze<T>(obj: T): T {
  Object.freeze(obj);

  if (obj !== null && typeof obj === 'object') {
    Object.getOwnPropertyNames(obj).forEach((prop) => {
      const value = (obj as any)[prop];
      if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        deepFreeze(value);
      }
    });
  }

  return obj;
}
