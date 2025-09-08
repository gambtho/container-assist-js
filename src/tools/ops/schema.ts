import { z } from 'zod';

export const opsToolSchema = z.object({
  sessionId: z.string().optional().describe('Session identifier for tracking operations'),
  action: z.enum(['status', 'logs', 'restart', 'scale']).describe('Operation to perform'),
  target: z.string().optional().describe('Target resource'),
});

export type OpsToolParams = z.infer<typeof opsToolSchema>;
