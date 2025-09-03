import { TokenEstimator } from '../context/context-manager';

export interface PromptValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    systemTokens: number;
    userTokens: number;
    totalTokens: number;
  };
  optimizationSuggestions: OptimizationSuggestion[];
  efficiency: {
    score: number; // 0-100
    issues: string[];
  };
}

export interface OptimizationSuggestion {
  type: 'token_reduction' | 'clarity' | 'redundancy' | 'structure';
  description: string;
  impact: 'low' | 'medium' | 'high';
  example?: string;

export interface PromptPair {
  system: string;
  user: string;

export class PromptValidator {
  private maxSystemPromptTokens = 600;
  private maxUserPromptTokens = 2500;
  private maxTotalTokens = 3000;
  private tokenEstimator: TokenEstimator;

  // Common inefficient patterns
  private inefficientPatterns = new Map([
    ['redundant_please', { pattern: /\b(please|kindly)\b/gi, severity: 'low' }],
    ['redundant_thanks', { pattern: /\b(thank you|thanks)\b/gi, severity: 'low' }],
    [
      'verbose_phrases',
      {
        pattern: /(in order to|due to the fact that|at this point in time|in the event that)/gi,
        severity: 'medium'
      }
    ],
    [
      'repetitive_instructions',
      {
        pattern: /(make sure|ensure that|be sure to).*\1/gi,
        severity: 'medium'
      }
    ],
    [
      'excessive_examples',
      {
        pattern: /(for example|such as|like)[\s\S]{200,}/gi,
        severity: 'medium'
      }
    ],
    [
      'filler_words',
      {
        pattern: /\b(basically|essentially|actually|simply|just|really|very)\b/gi,
        severity: 'low'
      }
    ]
  ]);

  // Clarity anti-patterns
  private clarityIssues = new Map([
    ['vague_instructions', { pattern: /\b(somehow|something|anything|various|multiple)\b/gi }],
    ['double_negatives', { pattern: /\b(not\s+(?:un|in|non|dis)\w+|don't\s+(?:not|avoid))/gi }],
    ['passive_voice', { pattern: /\b(is\s+\w+ed|are\s+\w+ed|was\s+\w+ed|were\s+\w+ed)\b/gi }],
    ['complex_sentences', { pattern: /[.!?][^.!?]{200,}[.!?]/g }]
  ]);

  constructor() {
    this.tokenEstimator = new TokenEstimator();
  }

  validate(prompt: PromptPair): PromptValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: OptimizationSuggestion[] = [];

    // Validate basic requirements
    if (!prompt.system?.trim()) {
      errors.push('System prompt cannot be empty');
    }

    if (!prompt.user?.trim()) {
      errors.push('User prompt cannot be empty');
    }

    if (errors.length > 0) {
      return {
        valid: false,
        errors,
        warnings,
        metrics: { systemTokens: 0, userTokens: 0, totalTokens: 0 },
        optimizationSuggestions: [],
        efficiency: { score: 0, issues: ['Missing required prompts'] }
      };
    }

    // Calculate token metrics
    const systemTokens = this.tokenEstimator.estimate(prompt.system);
    const userTokens = this.tokenEstimator.estimate(prompt.user);
    const totalTokens = systemTokens + userTokens;

    // Token limit validation
    if (systemTokens > this.maxSystemPromptTokens) {
      errors.push(
        `System prompt too long: ${systemTokens} tokens (max: ${this.maxSystemPromptTokens})`
      );
      suggestions.push({
        type: 'token_reduction',
        description: 'System prompt exceeds recommended length',
        impact: 'high',
        example: 'Consider moving detailed instructions to user prompt'
      });
    }

    if (userTokens > this.maxUserPromptTokens) {
      errors.push(`User prompt too long: ${userTokens} tokens (max: ${this.maxUserPromptTokens})`);`
      suggestions.push({
        type: 'token_reduction',
        description: 'User prompt exceeds recommended length',
        impact: 'high',
        example: 'Split into multiple requests or use context optimization'
      });
    }

    if (totalTokens > this.maxTotalTokens) {
      warnings.push(
        `Total prompt tokens (${totalTokens}) exceed recommended limit (${this.maxTotalTokens})`
      );
    }

    // Efficiency analysis
    const efficiencyAnalysis = this.analyzeEfficiency(prompt);
    warnings.push(...efficiencyAnalysis.warnings);
    suggestions.push(...efficiencyAnalysis.suggestions);

    // Clarity analysis
    const clarityAnalysis = this.analyzeClarityIssues(prompt);
    warnings.push(...clarityAnalysis.warnings);
    suggestions.push(...clarityAnalysis.suggestions);

    // Redundancy analysis
    const redundancyAnalysis = this.analyzeRedundancy(prompt);
    warnings.push(...redundancyAnalysis.warnings);
    suggestions.push(...redundancyAnalysis.suggestions);

    // Structure analysis
    const structureAnalysis = this.analyzeStructure(prompt);
    warnings.push(...structureAnalysis.warnings);
    suggestions.push(...structureAnalysis.suggestions);

    // Calculate efficiency score
    const efficiency = this.calculateEfficiencyScore(prompt, suggestions);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics: { systemTokens, userTokens, totalTokens },
      optimizationSuggestions: suggestions,
      efficiency
    };
  }

  private analyzeEfficiency(prompt: PromptPair): {
    warnings: string[];
    suggestions: OptimizationSuggestion[];
  } {
    const warnings: string[] = [];
    const suggestions: OptimizationSuggestion[] = [];
    const combined = `${prompt.system} ${prompt.user};

    // Check for inefficient patterns
    for (const [name, config] of this.inefficientPatterns) {
      const matches = combined.match(config.pattern);
      if (matches && matches.length > 0) {
        const severity = config.severity as 'low' | 'medium' | 'high';

        if (matches.length > 5 && severity === 'low') {
          warnings.push(`Excessive use of ${name}: ${matches.length} instances`);`
        } else if (matches.length > 2 && severity === 'medium') {
          warnings.push(`Multiple instances of ${name}: ${matches.length} found`);`
        }

        suggestions.push({
          type: 'token_reduction',
          description: this.getOptimizationMessage(name),
          impact: severity,
          example: this.getOptimizationExample(name)
        });
      }
    }

    // Check word repetition
    const repetitionAnalysis = this.analyzeWordRepetition(combined);
    if (repetitionAnalysis.score < 0.7) {
      warnings.push(
        `High word repetition detected (score: ${Math.round(repetitionAnalysis.score * 100)}%)`
      );
      suggestions.push({
        type: 'redundancy',
        description: 'Reduce repeated words and phrases',
        impact: 'medium',
        example: `Most repeated: ${repetitionAnalysis.topRepeated.slice(0, 3).join(', ')}`
      });
    }

    return { warnings, suggestions };
  }

  private analyzeClarityIssues(prompt: PromptPair): {
    warnings: string[];
    suggestions: OptimizationSuggestion[];
  } {
    const warnings: string[] = [];
    const suggestions: OptimizationSuggestion[] = [];
    const combined = `${prompt.system} ${prompt.user};

    for (const [issue, config] of this.clarityIssues) {
      const matches = combined.match(config.pattern);
      if (matches && matches.length > 0) {
        warnings.push(`${issue.replace('_', ' ')} detected: ${matches.length} instances`);`
        suggestions.push({
          type: 'clarity',
          description: this.getClarityMessage(issue),
          impact: 'medium',
          example: this.getClarityExample(issue)
        });
      }
    }

    // Check sentence complexity
    const avgSentenceLength = this.calculateAverageSentenceLength(combined);
    if (avgSentenceLength > 25) {
      warnings.push(`Average sentence length is high (${Math.round(avgSentenceLength)} words)`);`
      suggestions.push({
        type: 'clarity',
        description: 'Break down long sentences for better clarity',
        impact: 'medium',
        example: 'Use shorter, more direct sentences'
      });
    }

    return { warnings, suggestions };
  }

  private analyzeRedundancy(prompt: PromptPair): {
    warnings: string[];
    suggestions: OptimizationSuggestion[];
  } {
    const warnings: string[] = [];
    const suggestions: OptimizationSuggestion[] = [];

    // Check for duplicate instructions between system and user prompts
    const systemWords = new Set(prompt.system.toLowerCase().split(/\s+/));
    const userWords = new Set(prompt.user.toLowerCase().split(/\s+/));
    const intersection = new Set([...systemWords].filter((word) => userWords.has(word)));

    // Remove common words
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'is',
      'are',
      'was',
      'were',
      'be',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should'
    ]);
    const significantOverlap = new Set(
      [...intersection].filter((word) => !commonWords.has(word) && word.length > 3)
    );

    if (significantOverlap.size > 5) {
      warnings.push(
        `High overlap between system and user prompts: ${significantOverlap.size} significant words`
      );
      suggestions.push({
        type: 'redundancy',
        description: 'Consolidate overlapping instructions',
        impact: 'medium',
        example: 'Move repeated instructions to system prompt only'
      });
    }

    // Check for phrase repetition
    const phraseRepetition = this.findRepeatedPhrases(`${prompt.system} ${prompt.user}`);`
    if (phraseRepetition.length > 0) {
      warnings.push(`Repeated phrases detected: ${phraseRepetition.length}`);`
      suggestions.push({
        type: 'redundancy',
        description: 'Remove or consolidate repeated phrases',
        impact: 'low',
        example: `E.g., "${phraseRepetition[0]}" appears multiple times`
      });
    }

    return { warnings, suggestions };
  }

  private analyzeStructure(prompt: PromptPair): {
    warnings: string[];
    suggestions: OptimizationSuggestion[];
  } {
    const warnings: string[] = [];
    const suggestions: OptimizationSuggestion[] = [];

    // Check system prompt structure
    if (!this.hasGoodSystemStructure(prompt.system)) {
      suggestions.push({
        type: 'structure',
        description: 'Improve system prompt structure',
        impact: 'medium',
        example: 'Start with role/context, then specific instructions'
      });
    }

    // Check for proper instruction format
    if (!this.hasGoodInstructionFormat(prompt.user)) {
      suggestions.push({
        type: 'structure',
        description: 'Improve instruction formatting',
        impact: 'low',
        example: 'Use clear sections or bullet points for complex instructions'
      });
    }

    // Check for context placement
    if (this.hasContextMisplacement(prompt)) {
      warnings.push('Context information might be better placed differently');
      suggestions.push({
        type: 'structure',
        description: 'Optimize context placement',
        impact: 'medium',
        example: 'Place background context early, specific tasks at the end'
      });
    }

    return { warnings, suggestions };
  }

  private calculateEfficiencyScore(
    prompt: PromptPair,
    suggestions: OptimizationSuggestion[]
  ): { score: number; issues: string[] } {
    let score = 100;
    const issues: string[] = [];
    const combined = `${prompt.system} ${prompt.user};

    // Token efficiency (30% of score)
    const totalTokens = this.tokenEstimator.estimate(combined);
    if (totalTokens > this.maxTotalTokens) {
      const penalty = Math.min(
        30,
        ((totalTokens - this.maxTotalTokens) / this.maxTotalTokens) * 30
      );
      score -= penalty;
      issues.push(`Token count exceeds recommendations (${totalTokens} tokens)`);`
    }

    // Redundancy penalty (25% of score)
    const redundancySuggestions = suggestions.filter((s) => s.type === 'redundancy');
    if (redundancySuggestions.length > 0) {
      const penalty = Math.min(25, redundancySuggestions.length * 8);
      score -= penalty;
      issues.push(`Redundancy detected (${redundancySuggestions.length} issues)`);`
    }

    // Clarity penalty (25% of score)
    const claritySuggestions = suggestions.filter((s) => s.type === 'clarity');
    if (claritySuggestions.length > 0) {
      const penalty = Math.min(25, claritySuggestions.length * 6);
      score -= penalty;
      issues.push(`Clarity issues detected (${claritySuggestions.length} issues)`);`
    }

    // Structure penalty (20% of score)
    const structureSuggestions = suggestions.filter((s) => s.type === 'structure');
    if (structureSuggestions.length > 0) {
      const penalty = Math.min(20, structureSuggestions.length * 10);
      score -= penalty;
      issues.push(`Structure improvements needed (${structureSuggestions.length} issues)`);`
    }

    return {
      score: Math.max(0, Math.round(score)),
      issues
    };
  }

  private analyzeWordRepetition(text: string): { score: number; topRepeated: string[] } {
    const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const wordCounts = new Map<string, number>();

    words.forEach((word) => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });

    const totalWords = words.length;
    const uniqueWords = wordCounts.size;
    const repeatedWords = Array.from(wordCounts.entries())
      .filter(([_, count]) => count > 1)
      .sort(([_, a], [__, b]) => b - a);

    const score = uniqueWords / totalWords;
    const topRepeated = repeatedWords.slice(0, 5).map(([word, count]) => `${word}(${count})`);`

    return { score, topRepeated };
  }

  private findRepeatedPhrases(text: string): string[] {
    const phrases: string[] = [];
    const sentences = text.split(/[.!?]+/);

    for (let i = 0; i < sentences.length; i++) {
      for (let j = i + 1; j < sentences.length; j++) {
        const sentence1 = sentences[i]?.trim();
        const sentence2 = sentences[j]?.trim();
        if (sentence1 && sentence2) {
          const similarity = this.calculateSimilarity(sentence1, sentence2);
          if (similarity > 0.7 && sentence1.length > 20) {
            phrases.push(sentence1);
            break;
          }
        }
      }
    }

    return phrases;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.toLowerCase().split(/\s+/));
    const words2 = new Set(str2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter((word) => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private calculateAverageSentenceLength(text: string): number {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) return 0;

    const totalWords = sentences.reduce((sum, sentence) => {
      return sum + (sentence.match(/\b\w+\b/g) || []).length;
    }, 0);

    return totalWords / sentences.length;
  }

  private hasGoodSystemStructure(system: string): boolean {
    // Check if system prompt starts with role/context and has clear instructions
    const hasRole = /^(You are|As a|Your role|Act as)/i.test(system.trim());
    const hasInstructions = system.includes(':') || system.includes('.');
    return hasRole && hasInstructions;
  }

  private hasGoodInstructionFormat(user: string): boolean {
    // Check for structured instructions (bullets, numbers, or clear sections)
    const hasStructure =
      /^[\d\-\*]|\n[\d\-\*]/.test(user) || user.includes(':') || user.split('\n').length > 2;
    return hasStructure ?? user.length < 200; // Short prompts don't need structure
  }

  private hasContextMisplacement(prompt: PromptPair): boolean {
    // Very simple heuristic: if user prompt starts with context but system is short
    const userStartsWithContext = /^(Context:|Background:|Given:|Current:)/i.test(
      prompt.user.trim()
    );
    const systemIsShort = prompt.system.length < 100;
    return userStartsWithContext && systemIsShort;
  }

  private getOptimizationMessage(patternName: string): string {
    const messages: Record<string, string> = {
      redundant_please: 'Remove politeness markers like "please" and "kindly"',
      redundant_thanks: 'Remove gratitude expressions',
      verbose_phrases: 'Replace verbose phrases with concise alternatives',
      repetitive_instructions: 'Consolidate repetitive instruction patterns',
      excessive_examples: 'Limit examples or move them to context',
      filler_words: 'Remove filler words that add no value'
    };
    return messages[patternName] || 'Optimize this pattern';
  }

  private getOptimizationExample(patternName: string): string {
    const examples: Record<string, string> = {
      redundant_please: '"Please generate" → "Generate"',
      redundant_thanks: '"Thank you for helping" → omit',
      verbose_phrases: '"in order to" → "to", "due to the fact that" → "because"',
      repetitive_instructions: 'Combine similar instructions into one clear statement',
      excessive_examples: 'Limit to 1-2 concise examples',
      filler_words: '"basically just generate" → "generate"'
    };
    return examples[patternName] || ';'
  }

  private getClarityMessage(issue: string): string {
    const messages: Record<string, string> = {
      vague_instructions: 'Replace vague terms with specific instructions',
      double_negatives: 'Use positive phrasing instead of double negatives',
      passive_voice: 'Use active voice for clearer instructions',
      complex_sentences: 'Break complex sentences into simpler ones'
    };
    return messages[issue] || 'Improve clarity';
  }

  private getClarityExample(issue: string): string {
    const examples: Record<string, string> = {
      vague_instructions: '"something like" → "specifically", "various ways" → "using X, Y, Z"',
      double_negatives: '"don\'t not include" → "include"','
      passive_voice: '"should be generated" → "generate"',
      complex_sentences: 'Split sentences at conjunctions'
    };
    return examples[issue] || ';'
  }

  // Quick validation for simple cases
  isValid(prompt: PromptPair): boolean {
    return (
      prompt.system?.trim().length > 0 &&
      prompt.user?.trim().length > 0 &&
      this.tokenEstimator.estimate(prompt.system + prompt.user) <= this.maxTotalTokens
    );
  }

  // Get configuration for external use
  getConfig() {
    return {
      maxSystemPromptTokens: this.maxSystemPromptTokens,
      maxUserPromptTokens: this.maxUserPromptTokens,
      maxTotalTokens: this.maxTotalTokens
    };
  }

  // Update configuration
  updateConfig(
    config: Partial<{
      maxSystemPromptTokens: number;
      maxUserPromptTokens: number;
      maxTotalTokens: number;
    }>
  ) {
    if (config.maxSystemPromptTokens != null) this.maxSystemPromptTokens = config.maxSystemPromptTokens;
    if (config.maxUserPromptTokens != null) this.maxUserPromptTokens = config.maxUserPromptTokens;
    if (config.maxTotalTokens != null) this.maxTotalTokens = config.maxTotalTokens;
  }
