// MCP intelligent templates - simplified

export const PROMPT_TEMPLATES = {
  DOCKERFILE: 'Generate Dockerfile for {language} application',
  KUBERNETES: 'Generate Kubernetes manifests for {service}',
} as const;

export type PromptTemplate = string;
export type TemplateArgument = Record<string, unknown>;
export type AIContext = Record<string, unknown>;
