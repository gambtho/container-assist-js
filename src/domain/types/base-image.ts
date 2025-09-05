/**
 * Base Image Resolution Types
 * AI-powered base image recommendation types
 */

import { z } from 'zod';

export const BaseImageRecommendationSchema = z.object({
  primary_recommendation: z.object({
    image: z.string(),
    reasoning: z.string(),
    security_notes: z.string(),
    performance_notes: z.string(),
    tradeoffs: z.string(),
  }),
  alternatives: z.array(
    z.object({
      image: z.string(),
      use_case: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
    }),
  ),
  security_considerations: z.object({
    vulnerability_status: z.string(),
    update_frequency: z.string(),
    compliance: z.string(),
  }),
  optimization_tips: z.array(z.string()),
  health_check_recommendation: z.object({
    endpoint: z.string(),
    command: z.string(),
  }),
});

export type BaseImageRecommendation = z.infer<typeof BaseImageRecommendationSchema>;

export const BaseImageResolutionInputSchema = z.object({
  session_id: z.string(),
  security_level: z.enum(['minimal', 'standard', 'hardened']).optional().default('standard'),
  performance_priority: z.enum(['size', 'speed', 'memory']).optional().default('size'),
  target_environment: z.enum(['cloud', 'on-prem', 'edge']).optional().default('cloud'),
  architectures: z.array(z.string()).optional().default(['amd64']),
  compliance_requirements: z.string().optional(),
});

export type BaseImageResolutionInput = z.infer<typeof BaseImageResolutionInputSchema>;

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  suggestions?: string[];
}

export interface SuggestedImage {
  category: string;
  image: string;
  notes: string;
}
