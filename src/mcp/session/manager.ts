/**
 * Session management utilities - simplified
 */

export function getOrCreateSession(sessionId: string): {
  id: string;
  createdAt: Date;
  status: 'active';
} {
  // Simplified session management
  return {
    id: sessionId,
    createdAt: new Date(),
    status: 'active' as const,
  };
}
