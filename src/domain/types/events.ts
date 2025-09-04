/**
 * Domain Events - Minimal Stub
 *
 * Minimal type definitions to maintain module structure.
 * Full event system functionality can be restored from git history if needed.
 */
export interface DomainEvent {
  id: string;
  type: string;
  timestamp: string;
}

export const EventType = {
  // Minimal event types (can be expanded when actually needed)
  SYSTEM_STARTED: 'system.started',
} as const;

export type EventTypeName = (typeof EventType)[keyof typeof EventType];
