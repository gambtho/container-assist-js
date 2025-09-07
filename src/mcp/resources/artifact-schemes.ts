/**
 * Artifact URI Schemes for MCP Resources
 */

/**
 * Artifact scheme constants for different workflow stages
 */
export const ARTIFACT_SCHEMES = {
  ANALYSIS: 'analysis',
  DOCKERFILE: 'dockerfile',
  BUILD: 'build',
  SCAN: 'scan',
  K8S: 'k8s',
  DEPLOY: 'deploy',
  VERIFY: 'verify',
} as const;

export type ArtifactScheme = (typeof ARTIFACT_SCHEMES)[keyof typeof ARTIFACT_SCHEMES];

/**
 * Build an artifact URI for a specific stage and session
 */
export function buildArtifactUri(
  scheme: string,
  sessionId: string,
  type: string,
  id?: string | number,
): string {
  const parts = [scheme, sessionId, type];
  if (id !== undefined) parts.push(String(id));
  return parts.join('://');
}

/**
 * Parse an artifact URI to extract its components
 */
export function parseArtifactUri(uri: string): {
  scheme: string;
  sessionId: string;
  type: string;
  id?: string;
} | null {
  const match = uri.match(/^([^:]+):\/\/([^/]+)\/([^/]+)(?:\/(.+))?$/);
  if (!match) return null;

  const result: {
    scheme: string;
    sessionId: string;
    type: string;
    id?: string;
  } = {
    scheme: match[1]!,
    sessionId: match[2]!,
    type: match[3]!,
  };

  if (match[4] !== undefined) {
    result.id = match[4];
  }

  return result;
}

/**
 * Check if a URI is an artifact URI
 */
export function isArtifactUri(uri: string): boolean {
  const schemes = Object.values(ARTIFACT_SCHEMES);
  return schemes.some((scheme) => uri.startsWith(`${scheme}://`));
}
