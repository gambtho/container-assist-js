// AI Request Builder for optimized prompt construction

export interface AIRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
  temperature: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}

export class AIRequestBuilder {
  private model: string = 'claude-3-haiku-20240307';
  private maxTokens: number = 4096;
  private temperature: number = 0.7;
  private topP: number = 0.9;
  private frequencyPenalty: number = 0;
  private presencePenalty: number = 0;
  private systemPrompt: string = ';';
  private userPrompt: string = ';';
  private contextWindow: Array<{ role: string; content: string }> = [];
  private samplingParams: Record<string, any> = {};

  withModel(model: string): this {
    this.model = model;
    return this;
  }

  withMaxTokens(tokens: number): this {
    this.maxTokens = Math.min(tokens, 8192); // Cap at reasonable limit
    return this;
  }

  withTemperature(temp: number): this {
    this.temperature = Math.max(0, Math.min(1, temp));
    return this;
  }

  withTopP(topP: number): this {
    this.topP = Math.max(0, Math.min(1, topP));
    return this;
  }

  withFrequencyPenalty(penalty: number): this {
    this.frequencyPenalty = Math.max(-2, Math.min(2, penalty));
    return this;
  }

  withPresencePenalty(penalty: number): this {
    this.presencePenalty = Math.max(-2, Math.min(2, penalty));
    return this;
  }

  withSystemPrompt(prompt: string): this {
    this.systemPrompt = this.optimizePrompt(prompt);
    return this;
  }

  withUserPrompt(prompt: string): this {
    this.userPrompt = this.optimizePrompt(prompt);
    return this;
  }

  withContext(messages: Array<{ role: string; content: string }>): this {
    // Keep only last N messages to control context size
    this.contextWindow = messages.slice(-5);
    return this;
  }

  withSamplingParams(params: Record<string, any>): this {
    this.samplingParams = { ...params };
    return this;
  }

  private optimizePrompt(prompt: string): string {
    // Remove redundant whitespace
    let optimized = prompt.replace(/\s+/g, ' ').trim();

    // Remove common filler words in technical contexts
    const fillers = ['basically', 'essentially', 'actually', 'simply'];
    fillers.forEach((word) => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      optimized = optimized.replace(regex, '');
    });

    // Compress repeated instructions
    optimized = optimized.replace(/please\s+/gi, '');

    // Remove excessive punctuation
    optimized = optimized.replace(/[.]{2,}/g, '.');
    optimized = optimized.replace(/[!]{2,}/g, '!');
    optimized = optimized.replace(/[?]{2,}/g, '?');

    // Normalize spacing after optimization
    optimized = optimized.replace(/\s+/g, ' ').trim();

    return optimized;
  }

  build(): AIRequest {
    const request: AIRequest = {
      model: this.model,
      messages: this.buildMessages(),
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      top_p: this.topP,
      frequency_penalty: this.frequencyPenalty,
      presence_penalty: this.presencePenalty,
    };

    // Add any additional sampling parameters
    Object.assign(request, this.samplingParams);

    return request;
  }

  private buildMessages(): Array<{ role: string; content: string }> {
    const messages = [];

    if (this.systemPrompt) {
      messages.push({ role: 'system', content: this.systemPrompt });
    }

    // Add context messages
    messages.push(...this.contextWindow);

    if (this.userPrompt) {
      messages.push({ role: 'user', content: this.userPrompt });
    }

    return messages;
  }

  // Helper method to estimate token count
  estimateTokens(): number {
    const allMessages = this.buildMessages();
    const totalContent = allMessages.map((m) => m.content).join(' ');

    // Rough estimation: ~4 characters per token
    return Math.ceil(totalContent.length / 4);
  }

  // Helper method to validate the request
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.userPrompt && !this.systemPrompt) {
      errors.push('At least one prompt (system or user) must be provided');
    }

    const estimatedTokens = this.estimateTokens();
    if (estimatedTokens > this.maxTokens * 0.8) {
      warnings.push(
        `Estimated input tokens (${estimatedTokens}) are close to max_tokens (${this.maxTokens})`,
      );
    }

    if (this.temperature === 0 && this.topP < 1) {
      warnings.push('Temperature 0 with top_p < 1 may produce unexpected results');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      estimatedInputTokens: estimatedTokens,
    };
  }

  // Create a copy of the builder with current state
  clone(): AIRequestBuilder {
    const clone = new AIRequestBuilder()
      .withModel(this.model)
      .withMaxTokens(this.maxTokens)
      .withTemperature(this.temperature)
      .withTopP(this.topP)
      .withFrequencyPenalty(this.frequencyPenalty)
      .withPresencePenalty(this.presencePenalty)
      .withSystemPrompt(this.systemPrompt)
      .withUserPrompt(this.userPrompt)
      .withContext(this.contextWindow)
      .withSamplingParams(this.samplingParams);

    return clone;
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  estimatedInputTokens: number;
}
