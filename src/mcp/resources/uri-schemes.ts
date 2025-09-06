import { Result, Success, Failure } from '../../domain/types/result.js';
import type { ParsedUri, UriScheme } from './types.js';

export class UriParser {
  /**
   * Parse a URI into its components
   */
  static parse(uri: string): Result<ParsedUri> {
    try {
      const url = new URL(uri);

      if (!this.isValidScheme(url.protocol.slice(0, -1))) {
        return Failure(`Invalid URI scheme: ${url.protocol}`);
      }

      const query: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        query[key] = value;
      });

      return Success({
        scheme: url.protocol.slice(0, -1) as UriScheme,
        path: url.pathname,
        query: Object.keys(query).length > 0 ? query : undefined,
        fragment: url.hash ? url.hash.slice(1) : undefined,
      });
    } catch (error) {
      return Failure(`Failed to parse URI: ${error.message}`);
    }
  }

  /**
   * Build a URI from components
   */
  static build(
    scheme: UriScheme,
    path: string,
    query?: Record<string, string>,
    fragment?: string,
  ): string {
    let uri = `${scheme}://${path}`;

    if (query && Object.keys(query).length > 0) {
      const searchParams = new URLSearchParams(query);
      uri += `?${searchParams.toString()}`;
    }

    if (fragment) {
      uri += `#${fragment}`;
    }

    return uri;
  }

  /**
   * Generate a unique URI for a given scheme and base path
   */
  static generateUnique(scheme: UriScheme, basePath: string = ''): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const path = basePath ? `${basePath}/${timestamp}-${random}` : `${timestamp}-${random}`;
    return this.build(scheme, path);
  }

  /**
   * Check if a string matches a URI pattern (supports wildcards)
   */
  static matches(uri: string, pattern: string): boolean {
    if (pattern === '*') return true;

    // Convert glob-style pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/[.+^${}()|[\]\\]/g, '\\$&');

    return new RegExp(`^${regexPattern}$`).test(uri);
  }

  private static isValidScheme(scheme: string): scheme is UriScheme {
    return Object.values({
      MCP: 'mcp',
      CACHE: 'cache',
      SESSION: 'session',
      TEMP: 'temp',
    }).includes(scheme as UriScheme);
  }
}
