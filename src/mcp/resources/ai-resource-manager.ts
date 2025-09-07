// MCP AI resource manager - simplified

export type AIResource = {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
};

export type AIContext = Record<string, unknown>;
