/**
 * Content Validator for AI-generated outputs
 * Validates and sanitizes AI-generated content for security and correctness
 */

import type { Logger } from 'pino';

/**
 * Security issue types
 */
export interface SecurityIssue {
  type: 'credential' | 'vulnerability' | 'exposure' | 'injection' | 'misconfiguration';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: string;
  line?: number;
  column?: number;
  recommendation?: string;
  cwe?: string; // Common Weakness Enumeration ID
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  securityIssues?: SecurityIssue[];
  suggestions?: string[];
  metadata?: {
    validationTime: number;
    rulesApplied: number;
    issuesFound: number;
  };
}

/**
 * Content validation options
 */
export interface ValidationOptions {
  checkSecurity?: boolean;
  checkSyntax?: boolean;
  checkBestPractices?: boolean;
  contentType?: 'dockerfile' | 'yaml' | 'json' | 'shell' | 'text';
  strict?: boolean;
  customRules?: ValidationRule[];
}

/**
 * Custom validation rule
 */
export interface ValidationRule {
  name: string;
  pattern?: RegExp;
  validator?: (content: string) => boolean;
  message: string;
  severity?: 'error' | 'warning' | 'info';
}

/**
 * Content Validator implementation
 */
export class ContentValidator {
  private securityPatterns: Map<string, ValidationRule>;
  private syntaxValidators: Map<string, (content: string) => ValidationResult>;

  constructor(_logger: Logger) {
    this.securityPatterns = this.initializeSecurityPatterns();
    this.syntaxValidators = this.initializeSyntaxValidators();
  }

  /**
   * Validate content based on options
   */
  validate(content: string, options: ValidationOptions = {}): ValidationResult {
    const startTime = Date.now();
    const {
      checkSecurity = true,
      checkSyntax = true,
      checkBestPractices = true,
      contentType = 'text',
      strict = false,
      customRules = []
    } = options;

    const errors: string[] = [];
    const warnings: string[] = [];
    const securityIssues: SecurityIssue[] = [];
    const suggestions: string[] = [];
    let rulesApplied = 0;

    // Security validation
    if (checkSecurity) {
      const securityResult = this.validateSecurity(content, contentType);
      if (securityResult.securityIssues && securityResult.securityIssues.length > 0) {
        securityIssues.push(...securityResult.securityIssues);
      }
      if (securityResult.errors && securityResult.errors.length > 0) {
        errors.push(...securityResult.errors);
      }
      rulesApplied += this.securityPatterns.size;
    }

    // Syntax validation
    if (checkSyntax && this.syntaxValidators.has(contentType)) {
      const validator = this.syntaxValidators.get(contentType)!;
      const syntaxResult = validator(content);
      if (syntaxResult.errors && syntaxResult.errors.length > 0) {
        errors.push(...syntaxResult.errors);
      }
      if (syntaxResult.warnings && syntaxResult.warnings.length > 0) {
        warnings.push(...syntaxResult.warnings);
      }
      rulesApplied++;
    }

    // Best practices validation
    if (checkBestPractices) {
      const practicesResult = this.validateBestPractices(content, contentType);
      if (practicesResult.warnings && practicesResult.warnings.length > 0) {
        warnings.push(...practicesResult.warnings);
      }
      if (practicesResult.suggestions && practicesResult.suggestions.length > 0) {
        suggestions.push(...practicesResult.suggestions);
      }
      rulesApplied += 5; // Approximate number of best practice rules
    }

    // Custom rules validation
    for (const rule of customRules) {
      rulesApplied++;
      const matches = rule.pattern
        ? rule.pattern.test(content)
        : (rule.validator?.(content) ?? false);

      if (matches) {
        const severity = rule.severity ?? 'error';
        if (severity === 'error') {
          errors.push(rule.message);
        } else if (severity === 'warning') {
          warnings.push(rule.message);
        }
      }
    }

    // Determine overall validity
    const valid = strict
      ? errors.length === 0
      : securityIssues.filter((i) => i.severity === 'critical' || i.severity === 'high').length ===
        0;

    const result: ValidationResult = {
      valid,
      metadata: {
        validationTime: Date.now() - startTime,
        rulesApplied,
        issuesFound: errors.length + warnings.length + securityIssues.length
      }
    };

    if (errors.length > 0) {
      result.errors = errors;
    }
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    if (securityIssues.length > 0) {
      result.securityIssues = securityIssues;
    }
    if (suggestions.length > 0) {
      result.suggestions = suggestions;
    }

    return result;
  }

  /**
   * Initialize security patterns
   */
  private initializeSecurityPatterns(): Map<string, ValidationRule> {
    const patterns = new Map<string, ValidationRule>();

    // Credential patterns
    patterns.set('api-key', {
      name: 'API Key Detection',
      pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?([a-zA-Z0-9_-]{20,})["']?/gi,
      message: 'Potential API key exposed',
      severity: 'error'
    });

    patterns.set('password', {
      name: 'Password Detection',
      pattern: /(?:password|passwd|pwd)\s*[:=]\s*["']?([^"'\s]{8,})["']?/gi,
      message: 'Potential password exposed',
      severity: 'error'
    });

    patterns.set('token', {
      name: 'Token Detection',
      pattern: /(?:token|auth|bearer)\s*[:=]\s*["']?([a-zA-Z0-9._-]{20,})["']?/gi,
      message: 'Potential authentication token exposed',
      severity: 'error'
    });

    patterns.set('private-key', {
      name: 'Private Key Detection',
      pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
      message: 'Private key exposed',
      severity: 'error'
    });

    // Vulnerability patterns
    patterns.set('eval', {
      name: 'Eval Usage',
      pattern: /\beval\s*\(/,
      message: 'eval() usage detected - potential code injection risk',
      severity: 'warning'
    });

    patterns.set('exec', {
      name: 'Exec Usage',
      pattern: /\b(?:exec|system|shell_exec)\s*\(/,
      message: 'Command execution detected - potential injection risk',
      severity: 'warning'
    });

    return patterns;
  }

  /**
   * Initialize syntax validators
   */
  private initializeSyntaxValidators(): Map<string, (content: string) => ValidationResult> {
    const validators = new Map<string, (content: string) => ValidationResult>();

    // JSON validator
    validators.set('json', (content: string) => {
      try {
        JSON.parse(content);
        return { valid: true };
      } catch (error) {
        return {
          valid: false,
          errors: [`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`]
        };
      }
    });

    // Dockerfile validator
    validators.set('dockerfile', (content: string) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check for required instructions
      if (!content.match(/^FROM\s+/m)) {
        errors.push('Dockerfile must start with FROM instruction');
      }

      // Check for deprecated instructions
      if (content.match(/^MAINTAINER\s+/m)) {
        warnings.push('MAINTAINER is deprecated, use LABEL instead');
      }

      const result: ValidationResult = {
        valid: errors.length === 0
      };

      if (errors.length > 0) {
        result.errors = errors;
      }
      if (warnings.length > 0) {
        result.warnings = warnings;
      }

      return result;
    });

    // YAML validator (basic)
    validators.set('yaml', (content: string) => {
      const errors: string[] = [];

      // Basic YAML syntax checks
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.trim() === '') continue;

        const indent = line.search(/\S/);
        if (indent === -1) continue;

        // Check for tabs
        if (line.includes('\t')) {
          errors.push(`Line ${i + 1}: YAML should not contain tabs`);
        }

        // Check for odd indentation
        if (indent % 2 !== 0) {
          errors.push(`Line ${i + 1}: YAML indentation should be even`);
        }
      }

      const result: ValidationResult = {
        valid: errors.length === 0
      };

      if (errors.length > 0) {
        result.errors = errors;
      }

      return result;
    });

    return validators;
  }

  /**
   * Validate security aspects
   */
  private validateSecurity(content: string, contentType: string): ValidationResult {
    const securityIssues: SecurityIssue[] = [];
    const errors: string[] = [];

    // Apply security patterns
    for (const [key, rule] of this.securityPatterns) {
      if (rule.pattern && rule.pattern.test(content)) {
        // Find all matches with line numbers
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (rule.pattern && rule.pattern.test(line)) {
            securityIssues.push({
              type: this.categorizeSecurityIssue(key),
              severity: this.determineSeverity(key),
              description: rule.message,
              line: index + 1,
              recommendation: this.getRecommendation(key)
            });
          }
        });
      }
    }

    // Content-type specific security checks
    if (contentType === 'dockerfile') {
      this.validateDockerfileSecurity(content, securityIssues);
    } else if (contentType === 'shell') {
      this.validateShellSecurity(content, securityIssues);
    }

    const result: ValidationResult = {
      valid:
        securityIssues.filter((i) => i.severity === 'critical' || i.severity === 'high').length ===
        0
    };

    if (errors.length > 0) {
      result.errors = errors;
    }
    if (securityIssues.length > 0) {
      result.securityIssues = securityIssues;
    }

    return result;
  }

  /**
   * Validate best practices
   */
  private validateBestPractices(content: string, contentType: string): ValidationResult {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (contentType === 'dockerfile') {
      // Check for best practices
      if (!content.includes('USER ') || content.match(/USER\s+root/)) {
        warnings.push('Container runs as root - consider using a non-root user');
      }

      if (!content.includes('HEALTHCHECK')) {
        suggestions.push('Consider adding a HEALTHCHECK instruction');
      }

      if (content.match(/RUN.*apt-get install.*\n.*RUN.*apt-get install/)) {
        suggestions.push('Combine multiple RUN commands to reduce layers');
      }

      if (!content.includes('--no-cache') && content.includes('apt-get')) {
        suggestions.push('Consider using --no-cache flag with package managers');
      }
    }

    const result: ValidationResult = {
      valid: true
    };

    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    if (suggestions.length > 0) {
      result.suggestions = suggestions;
    }

    return result;
  }

  /**
   * Dockerfile-specific security validation
   */
  private validateDockerfileSecurity(content: string, issues: SecurityIssue[]): void {
    // Check for sudo usage
    if (content.includes('sudo ')) {
      issues.push({
        type: 'misconfiguration',
        severity: 'medium',
        description: 'sudo usage in Dockerfile',
        recommendation: 'Avoid sudo in Dockerfiles, use appropriate base image or USER instruction'
      });
    }

    // Check for curl | sh/bash pattern
    if (content.match(/curl.*\|\s*(sh|bash)/)) {
      issues.push({
        type: 'vulnerability',
        severity: 'high',
        description: 'Piping curl directly to shell',
        recommendation: 'Download and verify scripts before execution'
      });
    }

    // Check for wget | sh/bash pattern
    if (content.match(/wget.*\|\s*(sh|bash)/)) {
      issues.push({
        type: 'vulnerability',
        severity: 'high',
        description: 'Piping wget directly to shell',
        recommendation: 'Download and verify scripts before execution'
      });
    }

    // Check for latest tag
    if (content.match(/FROM.*:latest/)) {
      issues.push({
        type: 'misconfiguration',
        severity: 'low',
        description: 'Using :latest tag in FROM instruction',
        recommendation: 'Pin to specific version for reproducibility'
      });
    }
  }

  /**
   * Shell script security validation
   */
  private validateShellSecurity(content: string, issues: SecurityIssue[]): void {
    // Check for unquoted variables
    if (content.match(/\$[A-Z_][A-Z0-9_]*(?![A-Z0-9_"'])/)) {
      issues.push({
        type: 'vulnerability',
        severity: 'medium',
        description: 'Unquoted variable expansion',
        recommendation: 'Quote variable expansions to prevent word splitting'
      });
    }

    // Check for rm -rf /
    if (content.match(/rm\s+-rf\s+\/(?:\s|$)/)) {
      issues.push({
        type: 'vulnerability',
        severity: 'critical',
        description: 'Dangerous rm command detected',
        recommendation: 'Review and restrict rm commands'
      });
    }
  }

  /**
   * Categorize security issue type
   */
  private categorizeSecurityIssue(key: string): SecurityIssue['type'] {
    if (key.includes('key') || key.includes('password') || key.includes('token')) {
      return 'credential';
    }
    if (key.includes('eval') || key.includes('exec')) {
      return 'injection';
    }
    return 'vulnerability';
  }

  /**
   * Determine severity level
   */
  private determineSeverity(key: string): SecurityIssue['severity'] {
    if (key.includes('private-key') || key.includes('password')) {
      return 'critical';
    }
    if (key.includes('api-key') || key.includes('token')) {
      return 'high';
    }
    if (key.includes('eval') || key.includes('exec')) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Get recommendation for issue
   */
  private getRecommendation(key: string): string {
    const recommendations: Record<string, string> = {
      'api-key': 'Use environment variables or secrets management service',
      password: 'Never hardcode passwords, use secure secret storage',
      token: 'Store tokens in environment variables or secure vaults',
      'private-key': 'Private keys should be stored securely, not in code',
      eval: 'Avoid eval(), use safer alternatives',
      exec: 'Sanitize inputs before command execution'
    };

    return recommendations[key] || 'Review and fix security issue';
  }

  /**
   * Validate content and return result (alias for validate)
   */
  validateContent(content: string, options: ValidationOptions = {}): ValidationResult {
    return this.validate(content, options);
  }

  /**
   * Get validation summary
   */
  getValidationSummary(result: ValidationResult): string {
    const parts: string[] = [];

    parts.push(`Validation: ${result.valid ? 'PASSED' : 'FAILED'}`);

    if (result.errors && result.errors.length > 0) {
      parts.push(`${result.errors.length} error(s)`);
    }

    if (result.warnings && result.warnings.length > 0) {
      parts.push(`${result.warnings.length} warning(s)`);
    }

    if (result.securityIssues && result.securityIssues.length > 0) {
      const critical = result.securityIssues.filter((i) => i.severity === 'critical').length;
      const high = result.securityIssues.filter((i) => i.severity === 'high').length;
      parts.push(
        `${result.securityIssues.length} security issue(s) (${critical} critical, ${high} high)`
      );
    }

    if (result.metadata) {
      parts.push(`(${result.metadata.validationTime}ms, ${result.metadata.rulesApplied} rules)`);
    }

    return parts.join(', ');
  }
}
