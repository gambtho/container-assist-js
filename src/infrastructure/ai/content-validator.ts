/**
 * Security content validation for AI-generated content
 * Provides essential security checks for Dockerfiles, K8s manifests, and general content
 */

export interface SecurityIssue {
  severity: 'high' | 'medium' | 'low'
  message: string
  category: string
}

export interface ValidationResult {
  isValid: boolean
  issues: SecurityIssue[]
  summary: string
}

interface SecurityPattern {
  pattern: RegExp
  severity: 'high' | 'medium' | 'low'
  message: string
  category: 'dockerfile' | 'k8s' | 'general'
}

/**
 * Content validator for security analysis of AI-generated content
 */
export class ContentValidator {
  private readonly patterns: SecurityPattern[] = [
    // Critical Docker security patterns
    {
      pattern: /USER\s+root(\s|$)/,
      severity: 'medium',
      message: 'Running as root user is discouraged',
      category: 'dockerfile'
    },
    {
      pattern: /:latest(\s|$)/,
      severity: 'low',
      message: 'Using latest tag is discouraged in production',
      category: 'dockerfile'
    },
    {
      pattern: /--privileged|privileged:\s*true/,
      severity: 'high',
      message: 'privileged containers pose security risks',
      category: 'dockerfile'
    },
    {
      pattern: /ADD\s+http/i,
      severity: 'medium',
      message: 'ADD with HTTP URLs can be security risks - consider using COPY',
      category: 'dockerfile'
    },
    {
      pattern: /curl.*\|\s*(?:bash|sh)\b/,
      severity: 'high',
      message: 'Piping curl to shell is dangerous - download and verify files',
      category: 'dockerfile'
    },
    {
      pattern: /wget.*\|\s*(?:bash|sh)\b/,
      severity: 'high',
      message: 'Piping wget to shell is dangerous - download and verify files',
      category: 'dockerfile'
    },

    // Critical Kubernetes security patterns
    {
      pattern: /privileged:\s*true/,
      severity: 'high',
      message: 'privileged containers pose security risks',
      category: 'k8s'
    },
    {
      pattern: /hostNetwork:\s*true/,
      severity: 'high',
      message: 'hostNetwork: true can expose pod to host networking',
      category: 'k8s'
    },
    {
      pattern: /hostPID:\s*true/,
      severity: 'high',
      message: 'hostPID: true can expose host processes',
      category: 'k8s'
    },
    {
      pattern: /hostIPC:\s*true/,
      severity: 'high',
      message: 'hostIPC: true can expose host IPC namespace',
      category: 'k8s'
    },
    {
      pattern: /runAsUser:\s*0(\s|$)/,
      severity: 'medium',
      message: 'Running as user 0 (root) is discouraged',
      category: 'k8s'
    },
    {
      pattern: /allowPrivilegeEscalation:\s*true/,
      severity: 'high',
      message: 'allowPrivilegeEscalation: true poses security risks',
      category: 'k8s'
    },
    {
      pattern: /readOnlyRootFilesystem:\s*false/,
      severity: 'medium',
      message: 'readOnlyRootFilesystem: false reduces security',
      category: 'k8s'
    },

    // General credential exposure patterns
    {
      pattern: /(password|secret|key|token)\s*[:=]\s*["']?[a-zA-Z0-9+/=]{8}/i,
      severity: 'high',
      message: 'Potential credential exposure detected',
      category: 'general'
    },
    {
      pattern: /(?:api_key|apikey|access_key)\s*[:=]\s*["']?[a-zA-Z0-9+/=]{8}/i,
      severity: 'high',
      message: 'Potential API key exposure detected',
      category: 'general'
    },
    {
      pattern: /(?:private_key|privatekey)\s*[:=]\s*["']?[-\w+/=\s]+/i,
      severity: 'high',
      message: 'Potential private key exposure detected',
      category: 'general'
    },
    {
      pattern: /(?:database_url|db_url|connection_string)\s*[:=]\s*["']?[a-zA-Z0-9+:/@.-]+/i,
      severity: 'high',
      message: 'Potential database connection string exposure detected',
      category: 'general'
    },

    // Common patterns that should be detected in general validation
    {
      pattern: /:latest\b/,
      severity: 'low',
      message: 'Using latest tag is discouraged in production',
      category: 'general'
    },
    {
      pattern: /privileged:\s*true/,
      severity: 'high',
      message: 'privileged containers pose security risks',
      category: 'general'
    },

    // Insecure network practices
    {
      pattern: /http:\/\/(?!localhost|127\.0\.0\.1)/,
      severity: 'low',
      message: 'HTTP URLs are insecure - consider using HTTPS',
      category: 'general'
    },
    {
      pattern: /--insecure/,
      severity: 'medium',
      message: 'Insecure flags detected',
      category: 'general'
    },
    {
      pattern: /--disable-ssl|--no-ssl/,
      severity: 'medium',
      message: 'SSL disabled - security risk',
      category: 'general'
    }
  ]

  /**
   * Validate content for security issues
   * @param content - Content to validate
   * @param type - Type of content (dockerfile, k8s, general)
   */
  validateContent(content: string, type: 'dockerfile' | 'k8s' | 'general'): ValidationResult {
    const issues: SecurityIssue[] = []

    for (const pattern of this.patterns) {
      if (pattern.category === type || pattern.category === 'general') {
        if (pattern.pattern.test(content)) {
          issues.push({
            severity: pattern.severity,
            message: pattern.message,
            category: pattern.category
          })
        }
      }
    }

    const hasHighSeverity = issues.some(i => i.severity === 'high')

    return {
      isValid: !hasHighSeverity,
      issues,
      summary: this.createSummary(issues)
    }
  }

  /**
   * Validate multiple content pieces
   * @param contents - Array of content to validate
   * @param type - Type of content
   */
  validateMultiple(contents: Array<{content: string, name?: string}>, type: 'dockerfile' | 'k8s' | 'general'): ValidationResult {
    const allIssues: SecurityIssue[] = []

    for (const {content, name} of contents) {
      const result = this.validateContent(content, type)

      // Add context to issues if name is provided
      if (name != null && name.trim() !== '' && result.issues.length > 0) {
        const contextualizedIssues = result.issues.map(issue => ({
          ...issue,
          message: `${name}: ${issue.message}`
        }))
        allIssues.push(...contextualizedIssues)
      } else {
        allIssues.push(...result.issues)
      }
    }

    const hasHighSeverity = allIssues.some(i => i.severity === 'high')

    return {
      isValid: !hasHighSeverity,
      issues: allIssues,
      summary: this.createSummary(allIssues)
    }
  }

  /**
   * Get validation summary for specific content types
   * @param content - Content to validate
   * @param type - Content type
   */
  getValidationSummary(content: string, type: 'dockerfile' | 'k8s' | 'general'): string {
    const result = this.validateContent(content, type)

    if (result.issues.length === 0) {
      return `✓ No security issues detected in ${type}`
    }

    const highCount = result.issues.filter(i => i.severity === 'high').length
    const mediumCount = result.issues.filter(i => i.severity === 'medium').length
    const lowCount = result.issues.filter(i => i.severity === 'low').length

    const parts = []
    if (highCount > 0) parts.push(`${highCount} high`)
    if (mediumCount > 0) parts.push(`${mediumCount} medium`)
    if (lowCount > 0) parts.push(`${lowCount} low`)

    return `⚠️  Found ${result.issues.length} security issues in ${type} (${parts.join(', ')} severity)`
  }

  /**
   * Create summary text for validation result
   * @param issues - Array of security issues
   */
  private createSummary(issues: SecurityIssue[]): string {
    if (issues.length === 0) {
      return 'No security issues detected'
    }

    const highCount = issues.filter(i => i.severity === 'high').length
    const mediumCount = issues.filter(i => i.severity === 'medium').length
    const lowCount = issues.filter(i => i.severity === 'low').length

    const parts = []
    if (highCount > 0) parts.push(`${highCount} high severity`)
    if (mediumCount > 0) parts.push(`${mediumCount} medium severity`)
    if (lowCount > 0) parts.push(`${lowCount} low severity`)

    return `Found ${issues.length} security issues (${parts.join(', ')})`
  }

  /**
   * Filter issues by severity
   * @param issues - Array of security issues
   * @param severity - Minimum severity level
   */
  filterBySeverity(issues: SecurityIssue[], severity: 'high' | 'medium' | 'low'): SecurityIssue[] {
    const severityOrder = { 'high': 3, 'medium': 2, 'low': 1 }
    const minLevel = severityOrder[severity]

    return issues.filter(issue => severityOrder[issue.severity] >= minLevel)
  }

  /**
   * Get issues grouped by category
   * @param issues - Array of security issues
   */
  groupByCategory(issues: SecurityIssue[]): Record<string, SecurityIssue[]> {
    return issues.reduce((groups, issue) => {
      const category = issue.category
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(issue)
      return groups
    }, {} as Record<string, SecurityIssue[]>)
  }
}


