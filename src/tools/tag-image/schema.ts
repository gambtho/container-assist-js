import { z } from 'zod';

export const tagImageSchema = z.object({
  sessionId: z.string().optional().describe('Session identifier for tracking operations'),
  imageId: z.string().optional().describe('Docker image ID to tag'),
  tag: z.string().optional().describe('New tag to apply'),
});

export type TagImageParams = z.infer<typeof tagImageSchema>;
