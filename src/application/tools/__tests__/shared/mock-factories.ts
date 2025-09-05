/**
 * Reusable Mock Factory Patterns for Team Echo
 * Simple, focused mock utilities using existing types
 */

import type { Dirent, Stats } from 'node:fs';
import { jest } from '@jest/globals';

/**
 * Creates properly typed file system mocks
 */
export function createFileSystemMocks(): {
  access: jest.MockedFunction<() => Promise<void>>;
  readFile: jest.MockedFunction<(path: string, encoding?: string) => Promise<string>>;
  readdir: jest.MockedFunction<() => Promise<Dirent[]>>;
  stat: jest.MockedFunction<() => Promise<Stats>>;
} {
  return {
    access: jest.fn<() => Promise<void>>(),
    readFile: jest.fn<(path: string, encoding?: string) => Promise<string>>(),
    readdir: jest.fn<() => Promise<Dirent[]>>(),
    stat: jest.fn<() => Promise<Stats>>(),
  };
}

/**
 * Creates a mock Dirent entry
 */
export function createMockDirent(name: string, isDirectory = false): Partial<Dirent> {
  return {
    name,
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory,
  };
}

/**
 * Creates a mock Stats object
 */
export function createMockStats(
  isDirectory = false,
  size = isDirectory ? MOCK_DEFAULTS.DIRECTORY_SIZE : MOCK_DEFAULTS.FILE_SIZE,
): Partial<Stats> {
  return {
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory,
    size,
    mtime: new Date(),
  };
}

// Constants for mock defaults
const MOCK_DEFAULTS = {
  SESSION_ID: 'mock-session-123',
  FILE_SIZE: 1024,
  DIRECTORY_SIZE: 0,
} as const;

/**
 * Simple session service mock using existing patterns
 */
export function createMockSessionService(overrides?: { sessionId?: string }): {
  create: jest.MockedFunction<
    (params: { projectName: string; metadata: unknown }) => Promise<{ id: string }>
  >;
  updateAtomic: jest.MockedFunction<
    (id: string, updater: (session: unknown) => unknown) => Promise<void>
  >;
} {
  const sessionId = overrides?.sessionId ?? MOCK_DEFAULTS.SESSION_ID;

  return {
    create: jest
      .fn<(params: { projectName: string; metadata: unknown }) => Promise<{ id: string }>>()
      .mockResolvedValue({ id: sessionId }),
    updateAtomic: jest
      .fn<(id: string, updater: (session: unknown) => unknown) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
}

/**
 * Helper to create consistent file structure mocks
 */
export function mockFileStructure(
  files: Record<string, { isDirectory?: boolean; content?: string }>,
): {
  dirents: Dirent[];
  contentMap: Record<string, string>;
} {
  const dirents = Object.entries(files).map(([name, info]) =>
    createMockDirent(name, info.isDirectory ?? false),
  );

  return {
    dirents: dirents as Dirent[],
    contentMap: Object.fromEntries(
      Object.entries(files)
        .filter(([_, info]) => info.content !== undefined)
        .map(([name, info]) => [name, info.content!]),
    ),
  };
}
