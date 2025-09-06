import { Result, Success, Failure } from '../types/core.js';
import type { Logger } from 'pino';
import { ScoredCandidate, GenerationContext, SamplingConfig } from '../lib/sampling.js';
import { BaseSamplingOrchestrator, HighestScoreWinnerSelector } from './sampling/base.js';

// Vulnerability and remediation types
export interface Vulnerability {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  package: string;
  installedVersion: string;
  fixedVersion?: string;
  cve?: string;
  cvss?: number;
}

export interface RemediationContext extends GenerationContext {
  vulnerabilities: Vulnerability[];
  originalDockerfile: string;
  remediationStrategy?: 'conservative' | 'aggressive' | 'balanced';
  allowBreakingChanges?: boolean;
  prioritizeSecurity?: boolean;
}

export interface RemediationSolution {
  type: 'dockerfile_change' | 'base_image_upgrade' | 'package_update' | 'config_change';
  description: string;
  originalContent: string;
  remediatedContent: string;
  vulnerabilitiesFixed: string[];
  potentialBreakingChanges: string[];
  confidenceLevel: number; // 0-1
}

export interface RemediationResult {
  solutions: RemediationSolution[];
  summary: {
    totalVulnerabilities: number;
    fixedVulnerabilities: number;
    remainingVulnerabilities: number;
    riskReduction: number; // percentage
  };
}

// Remediation generators
import { BaseCandidateGenerator } from './sampling/base.js';
import { Candidate } from '../lib/sampling.js';

export class VulnerabilityRemediationGenerator extends BaseCandidateGenerator<RemediationResult> {
  readonly name = 'vulnerability-remediation-generator';
  readonly supportedTypes = ['remediation'];

  private remediationStrategies = [
    new ConservativeRemediationStrategy(),
    new BalancedRemediationStrategy(),
    new AggressiveRemediationStrategy(),
    new SecurityFirstRemediationStrategy(),
  ];

  constructor(logger: Logger) {
    super(logger);
  }

  async generate(
    context: GenerationContext,
    count = 3,
  ): Promise<Result<Candidate<RemediationResult>[]>> {
    try {
      const remediationContext = context as RemediationContext;
      this.logger.debug(
        {
          sessionId: context.sessionId,
          vulnerabilityCount: remediationContext.vulnerabilities.length,
        },
        'Generating vulnerability remediation candidates',
      );

      if (remediationContext.vulnerabilities.length === 0) {
        return Success([]); // No vulnerabilities to fix
      }

      const candidates: Candidate<RemediationResult>[] = [];
      const selectedStrategies = this.selectStrategies(count, remediationContext);
      const progressToken = `remediation-gen-${context.sessionId}`;

      this.notifyProgress(progressToken, 0, 'Starting vulnerability remediation');

      for (let i = 0; i < selectedStrategies.length; i++) {
        const strategy = selectedStrategies[i];

        try {
          const remediation = await strategy.generateRemediation(remediationContext);
          const candidateId = this.createCandidateId(strategy.name, context);

          const candidate: Candidate<RemediationResult> = {
            id: candidateId,
            content: remediation,
            metadata: {
              strategy: strategy.name,
              source: 'vulnerability-remediation-generator',
              confidence: strategy.confidence,
              riskReduction: remediation.summary.riskReduction,
              breakingChangesRisk: strategy.breakingChangesRisk,
            },
            generatedAt: new Date(),
          };

          candidates.push(candidate);

          const progress = Math.round(((i + 1) / selectedStrategies.length) * 100);
          this.notifyProgress(
            progressToken,
            progress,
            `Generated remediation ${i + 1}/${selectedStrategies.length}`,
          );
        } catch (error) {
          this.logger.warn({ strategy: strategy.name, error }, 'Remediation strategy failed');
          continue;
        }
      }

      if (candidates.length === 0) {
        return Failure('No remediation candidates could be generated');
      }

      this.logger.debug(
        { count: candidates.length },
        'Successfully generated vulnerability remediation candidates',
      );
      return Success(candidates);
    } catch (error) {
      const errorMessage = `Vulnerability remediation generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error({ error, context }, errorMessage);
      return Failure(errorMessage);
    }
  }

  async validate(candidate: Candidate<RemediationResult>): Promise<Result<boolean>> {
    try {
      const remediation = candidate.content;

      // Basic validation checks
      const validationChecks = [
        remediation.solutions.length > 0,
        remediation.summary.fixedVulnerabilities >= 0,
        remediation.summary.riskReduction >= 0,
        remediation.solutions.every(sol => sol.confidenceLevel >= 0 && sol.confidenceLevel <= 1),
      ];

      const isValid = validationChecks.every(check => check);
      return Success(isValid);
    } catch (error) {
      return Failure(
        `Remediation validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private selectStrategies(
    count: number,
    context: RemediationContext,
  ): RemediationStrategy[] {
    const availableStrategies = this.remediationStrategies.filter(strategy =>
      strategy.isApplicable(context),
    );

    // Prefer user's specified strategy if available
    if (context.remediationStrategy) {
      const preferredStrategy = availableStrategies.find(s =>
        s.name.toLowerCase().includes(context.remediationStrategy!),
      );
      if (preferredStrategy) {
        return [preferredStrategy, ...availableStrategies.filter(s => s !== preferredStrategy)]
          .slice(0, count);
      }
    }

    return availableStrategies.slice(0, Math.min(count, availableStrategies.length));
  }
}

// Abstract remediation strategy interface
abstract class RemediationStrategy {
  abstract readonly name: string;
  abstract readonly confidence: number;
  abstract readonly breakingChangesRisk: number; // 0-1

  abstract isApplicable(context: RemediationContext): boolean;
  abstract generateRemediation(context: RemediationContext): Promise<RemediationResult>;
}

// Conservative strategy - minimal changes, low risk
class ConservativeRemediationStrategy extends RemediationStrategy {
  readonly name = 'conservative-remediation';
  readonly confidence = 0.9;
  readonly breakingChangesRisk = 0.1;

  isApplicable(context: RemediationContext): boolean {
    return true; // Always applicable
  }

  async generateRemediation(context: RemediationContext): Promise<RemediationResult> {
    const solutions: RemediationSolution[] = [];
    const criticalVulns = context.vulnerabilities.filter(v => v.severity === 'CRITICAL');
    const highVulns = context.vulnerabilities.filter(v => v.severity === 'HIGH');

    // Focus only on CRITICAL and HIGH severity vulnerabilities
    const targetVulns = [...criticalVulns, ...highVulns];

    // Strategy 1: Upgrade base image if possible (low risk)
    const baseImageSolution = await this.generateBaseImageUpgrade(context, targetVulns);
    if (baseImageSolution) {
      solutions.push(baseImageSolution);
    }

    // Strategy 2: Pin specific package versions for critical vulnerabilities
    const packageSolutions = await this.generatePackageVersionPins(context, criticalVulns);
    solutions.push(...packageSolutions);

    const fixedVulns = solutions.flatMap(sol => sol.vulnerabilitiesFixed);
    const uniqueFixedVulns = [...new Set(fixedVulns)];

    return {
      solutions,
      summary: {
        totalVulnerabilities: context.vulnerabilities.length,
        fixedVulnerabilities: uniqueFixedVulns.length,
        remainingVulnerabilities: context.vulnerabilities.length - uniqueFixedVulns.length,
        riskReduction: this.calculateRiskReduction(context.vulnerabilities, uniqueFixedVulns),
      },
    };
  }

  private async generateBaseImageUpgrade(
    context: RemediationContext,
    vulnerabilities: Vulnerability[],
  ): Promise<RemediationSolution | null> {
    const dockerfile = context.originalDockerfile;
    const fromMatch = dockerfile.match(/^FROM\s+([^\s]+)/m);

    if (!fromMatch) return null;

    const currentImage = fromMatch[1];
    const [imageName, currentTag] = currentImage.split(':');

    if (!currentTag || currentTag === 'latest') return null;

    // Suggest upgrading to a newer patch version (conservative)
    const versionMatch = currentTag.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (versionMatch) {
      const [, major, minor, patch] = versionMatch;
      const newPatch = parseInt(patch) + 1;
      const newTag = `${major}.${minor}.${newPatch}${currentTag.slice(versionMatch[0].length)}`;
      const newImage = `${imageName}:${newTag}`;

      // Estimate which vulnerabilities might be fixed (simplified heuristic)
      const potentiallyFixed = vulnerabilities
        .filter(v => v.package.includes('base-files') || v.package.includes('libc'))
        .map(v => v.id);

      if (potentiallyFixed.length > 0) {
        return {
          type: 'base_image_upgrade',
          description: `Upgrade base image from ${currentImage} to ${newImage}`,
          originalContent: fromMatch[0],
          remediatedContent: `FROM ${newImage}`,
          vulnerabilitiesFixed: potentiallyFixed,
          potentialBreakingChanges: ['Base system packages may change'],
          confidenceLevel: 0.7,
        };
      }
    }

    return null;
  }

  private async generatePackageVersionPins(
    context: RemediationContext,
    vulnerabilities: Vulnerability[],
  ): Promise<RemediationSolution[]> {
    const solutions: RemediationSolution[] = [];
    const dockerfile = context.originalDockerfile;

    // Group vulnerabilities by package
    const vulnsByPackage = vulnerabilities.reduce((acc, vuln) => {
      if (!acc[vuln.package]) acc[vuln.package] = [];
      acc[vuln.package].push(vuln);
      return acc;
    }, {} as Record<string, Vulnerability[]>);

    for (const [packageName, vulns] of Object.entries(vulnsByPackage)) {
      const fixableVulns = vulns.filter(v => v.fixedVersion);
      if (fixableVulns.length === 0) continue;

      // Find the highest fixed version
      const latestFixedVersion = fixableVulns
        .map(v => v.fixedVersion!)
        .sort()
        .pop()!;

      // Generate apt-get install command for pinned version
      const installCommand = `RUN apt-get update && apt-get install -y ${packageName}=${latestFixedVersion} && rm -rf /var/lib/apt/lists/*`;

      solutions.push({
        type: 'package_update',
        description: `Pin ${packageName} to version ${latestFixedVersion}`,
        originalContent: '# No specific package pinning',
        remediatedContent: installCommand,
        vulnerabilitiesFixed: fixableVulns.map(v => v.id),
        potentialBreakingChanges: [`${packageName} API changes in version ${latestFixedVersion}`],
        confidenceLevel: 0.8,
      });
    }

    return solutions;
  }

  private calculateRiskReduction(allVulns: Vulnerability[], fixedVulnIds: string[]): number {
    const fixedVulns = allVulns.filter(v => fixedVulnIds.includes(v.id));

    // Calculate risk based on severity
    const severityWeights = { CRITICAL: 10, HIGH: 7, MEDIUM: 4, LOW: 1 };

    const totalRisk = allVulns.reduce((sum, v) => sum + severityWeights[v.severity], 0);
    const fixedRisk = fixedVulns.reduce((sum, v) => sum + severityWeights[v.severity], 0);

    return totalRisk > 0 ? (fixedRisk / totalRisk) * 100 : 0;
  }
}

// Balanced strategy - good balance of fixes and risk
class BalancedRemediationStrategy extends RemediationStrategy {
  readonly name = 'balanced-remediation';
  readonly confidence = 0.85;
  readonly breakingChangesRisk = 0.3;

  isApplicable(context: RemediationContext): boolean {
    return context.vulnerabilities.length > 0;
  }

  async generateRemediation(context: RemediationContext): Promise<RemediationResult> {
    const solutions: RemediationSolution[] = [];

    // Fix CRITICAL and HIGH, and some MEDIUM vulnerabilities
    const targetVulns = context.vulnerabilities.filter(v =>
      v.severity === 'CRITICAL' || v.severity === 'HIGH' ||
      (v.severity === 'MEDIUM' && Math.random() > 0.5),
    );

    // Multiple strategies
    const baseImageSolution = await this.generateImageUpgradeStrategy(context, targetVulns);
    if (baseImageSolution) solutions.push(baseImageSolution);

    const packageSolutions = await this.generatePackageUpdateStrategy(context, targetVulns);
    solutions.push(...packageSolutions);

    const configSolutions = await this.generateConfigurationChanges(context, targetVulns);
    solutions.push(...configSolutions);

    const fixedVulns = solutions.flatMap(sol => sol.vulnerabilitiesFixed);
    const uniqueFixedVulns = [...new Set(fixedVulns)];

    return {
      solutions,
      summary: {
        totalVulnerabilities: context.vulnerabilities.length,
        fixedVulnerabilities: uniqueFixedVulns.length,
        remainingVulnerabilities: context.vulnerabilities.length - uniqueFixedVulns.length,
        riskReduction: this.calculateRiskReduction(context.vulnerabilities, uniqueFixedVulns),
      },
    };
  }

  private async generateImageUpgradeStrategy(
    context: RemediationContext,
    vulnerabilities: Vulnerability[],
  ): Promise<RemediationSolution | null> {
    // More aggressive image upgrade strategy
    const dockerfile = context.originalDockerfile;
    const fromMatch = dockerfile.match(/^FROM\s+([^\s]+)/m);

    if (!fromMatch) return null;

    const currentImage = fromMatch[1];
    const [imageName, currentTag] = currentImage.split(':');

    // Suggest upgrading to latest LTS or stable version
    let newTag: string;
    if (imageName.includes('node')) {
      newTag = currentTag?.includes('alpine') ? '18-alpine' : '18-slim';
    } else if (imageName.includes('ubuntu')) {
      newTag = '22.04';
    } else if (imageName.includes('debian')) {
      newTag = 'bookworm-slim';
    } else {
      return null;
    }

    const newImage = `${imageName}:${newTag}`;
    const potentiallyFixed = vulnerabilities
      .filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH')
      .map(v => v.id);

    return {
      type: 'base_image_upgrade',
      description: `Upgrade base image from ${currentImage} to ${newImage}`,
      originalContent: fromMatch[0],
      remediatedContent: `FROM ${newImage}`,
      vulnerabilitiesFixed: potentiallyFixed,
      potentialBreakingChanges: [
        'Base system may have different package versions',
        'Some system tools may behave differently',
      ],
      confidenceLevel: 0.75,
    };
  }

  private async generatePackageUpdateStrategy(
    context: RemediationContext,
    vulnerabilities: Vulnerability[],
  ): Promise<RemediationSolution[]> {
    const solutions: RemediationSolution[] = [];

    // Group by package and generate comprehensive update commands
    const vulnsByPackage = vulnerabilities.reduce((acc, vuln) => {
      if (!acc[vuln.package]) acc[vuln.package] = [];
      acc[vuln.package].push(vuln);
      return acc;
    }, {} as Record<string, Vulnerability[]>);

    const packageUpdateCommands = [];
    const allFixedVulns = [];

    for (const [packageName, vulns] of Object.entries(vulnsByPackage)) {
      const fixableVulns = vulns.filter(v => v.fixedVersion);
      if (fixableVulns.length === 0) continue;

      const latestFixedVersion = fixableVulns
        .map(v => v.fixedVersion!)
        .sort()
        .pop()!;

      packageUpdateCommands.push(`${packageName}=${latestFixedVersion}`);
      allFixedVulns.push(...fixableVulns.map(v => v.id));
    }

    if (packageUpdateCommands.length > 0) {
      const updateCommand = `RUN apt-get update && apt-get install -y ${packageUpdateCommands.join(' ')} && rm -rf /var/lib/apt/lists/*`;

      solutions.push({
        type: 'package_update',
        description: `Update multiple packages with fixed versions`,
        originalContent: '# No specific package updates',
        remediatedContent: updateCommand,
        vulnerabilitiesFixed: allFixedVulns,
        potentialBreakingChanges: packageUpdateCommands.map(pkg => `API changes in ${pkg.split('=')[0]}`),
        confidenceLevel: 0.8,
      });
    }

    return solutions;
  }

  private async generateConfigurationChanges(
    context: RemediationContext,
    vulnerabilities: Vulnerability[],
  ): Promise<RemediationSolution[]> {
    const solutions: RemediationSolution[] = [];

    // Add security hardening configurations
    const securityVulns = vulnerabilities.filter(v =>
      v.description.toLowerCase().includes('privilege') ||
      v.description.toLowerCase().includes('permission') ||
      v.description.toLowerCase().includes('access'),
    );

    if (securityVulns.length > 0) {
      solutions.push({
        type: 'config_change',
        description: 'Add security hardening configuration',
        originalContent: '# No security hardening',
        remediatedContent: `
# Security hardening
USER 1001
RUN chmod -R 755 /app && chown -R 1001:1001 /app
ENV NODE_ENV=production
ENV NPM_CONFIG_AUDIT=false`,
        vulnerabilitiesFixed: securityVulns.map(v => v.id),
        potentialBreakingChanges: [
          'Application may need file permissions adjustments',
          'Some npm packages may not work with restricted permissions',
        ],
        confidenceLevel: 0.7,
      });
    }

    return solutions;
  }

  private calculateRiskReduction(allVulns: Vulnerability[], fixedVulnIds: string[]): number {
    const fixedVulns = allVulns.filter(v => fixedVulnIds.includes(v.id));
    const severityWeights = { CRITICAL: 10, HIGH: 7, MEDIUM: 4, LOW: 1 };

    const totalRisk = allVulns.reduce((sum, v) => sum + severityWeights[v.severity], 0);
    const fixedRisk = fixedVulns.reduce((sum, v) => sum + severityWeights[v.severity], 0);

    return totalRisk > 0 ? (fixedRisk / totalRisk) * 100 : 0;
  }
}

// Aggressive strategy - fix everything possible, higher risk
class AggressiveRemediationStrategy extends RemediationStrategy {
  readonly name = 'aggressive-remediation';
  readonly confidence = 0.7;
  readonly breakingChangesRisk = 0.6;

  isApplicable(context: RemediationContext): boolean {
    return context.allowBreakingChanges !== false;
  }

  async generateRemediation(context: RemediationContext): Promise<RemediationResult> {
    const solutions: RemediationSolution[] = [];

    // Attempt to fix ALL vulnerabilities
    const allVulns = context.vulnerabilities;

    // Major base image upgrade
    const majorUpgradeSolution = await this.generateMajorImageUpgrade(context, allVulns);
    if (majorUpgradeSolution) solutions.push(majorUpgradeSolution);

    // Comprehensive package updates
    const packageSolutions = await this.generateComprehensivePackageUpdates(context, allVulns);
    solutions.push(...packageSolutions);

    // System-level security changes
    const systemSolutions = await this.generateSystemSecurityChanges(context, allVulns);
    solutions.push(...systemSolutions);

    const fixedVulns = solutions.flatMap(sol => sol.vulnerabilitiesFixed);
    const uniqueFixedVulns = [...new Set(fixedVulns)];

    return {
      solutions,
      summary: {
        totalVulnerabilities: context.vulnerabilities.length,
        fixedVulnerabilities: uniqueFixedVulns.length,
        remainingVulnerabilities: context.vulnerabilities.length - uniqueFixedVulns.length,
        riskReduction: this.calculateRiskReduction(context.vulnerabilities, uniqueFixedVulns),
      },
    };
  }

  private async generateMajorImageUpgrade(
    context: RemediationContext,
    vulnerabilities: Vulnerability[],
  ): Promise<RemediationSolution | null> {
    const dockerfile = context.originalDockerfile;
    const fromMatch = dockerfile.match(/^FROM\s+([^\s]+)/m);

    if (!fromMatch) return null;

    const currentImage = fromMatch[1];

    // Suggest latest available version
    let newImage: string;
    if (currentImage.includes('node')) {
      newImage = 'node:20-alpine'; // Latest LTS
    } else if (currentImage.includes('ubuntu')) {
      newImage = 'ubuntu:24.04'; // Latest LTS
    } else if (currentImage.includes('debian')) {
      newImage = 'debian:bookworm-slim';
    } else {
      newImage = currentImage.includes(':') ?
        `${currentImage.split(':')[0]}:latest` :
        `${currentImage}:latest`;
    }

    return {
      type: 'base_image_upgrade',
      description: `Major upgrade from ${currentImage} to ${newImage}`,
      originalContent: fromMatch[0],
      remediatedContent: `FROM ${newImage}`,
      vulnerabilitiesFixed: vulnerabilities.map(v => v.id), // Assume all might be fixed
      potentialBreakingChanges: [
        'Major version changes may break compatibility',
        'System tools and libraries will be different versions',
        'Build process may need adjustments',
        'Runtime behavior may change',
      ],
      confidenceLevel: 0.6,
    };
  }

  private async generateComprehensivePackageUpdates(
    context: RemediationContext,
    vulnerabilities: Vulnerability[],
  ): Promise<RemediationSolution[]> {
    const solutions: RemediationSolution[] = [];

    // Update all packages to latest versions
    const allPackages = [...new Set(vulnerabilities.map(v => v.package))];
    const updateCommands = [];

    for (const packageName of allPackages) {
      updateCommands.push(`${packageName}=*`); // Latest available
    }

    if (updateCommands.length > 0) {
      solutions.push({
        type: 'package_update',
        description: 'Update all vulnerable packages to latest versions',
        originalContent: '# No package updates',
        remediatedContent: `
RUN apt-get update && \\
    apt-get dist-upgrade -y && \\
    apt-get install -y ${updateCommands.slice(0, 10).join(' ')} && \\
    apt-get autoremove -y && \\
    apt-get clean && \\
    rm -rf /var/lib/apt/lists/*`,
        vulnerabilitiesFixed: vulnerabilities.map(v => v.id),
        potentialBreakingChanges: [
          'Latest package versions may have breaking API changes',
          'System behavior may change significantly',
          'Some packages may conflict with each other',
        ],
        confidenceLevel: 0.5,
      });
    }

    return solutions;
  }

  private async generateSystemSecurityChanges(
    context: RemediationContext,
    vulnerabilities: Vulnerability[],
  ): Promise<RemediationSolution[]> {
    const solutions: RemediationSolution[] = [];

    // Aggressive security hardening
    solutions.push({
      type: 'config_change',
      description: 'Comprehensive security hardening',
      originalContent: '# No security configuration',
      remediatedContent: `
# Comprehensive security hardening
RUN addgroup --system --gid 1001 nodejs && \\
    adduser --system --uid 1001 --gid 1001 --no-create-home --disabled-password nodejs

# Remove unnecessary packages and tools
RUN apt-get purge -y wget curl git && \\
    apt-get autoremove -y

# Set strict permissions
RUN chmod -R 755 /app && \\
    chown -R nodejs:nodejs /app && \\
    chmod -R go-rwx /app

# Security environment
ENV NODE_ENV=production
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
ENV CI=true

# Switch to non-root user
USER nodejs

# Health check with security context
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
    CMD ["node", "-e", "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"]`,
      vulnerabilitiesFixed: vulnerabilities
        .filter(v => v.description.toLowerCase().includes('privilege') ||
                    v.description.toLowerCase().includes('permission'))
        .map(v => v.id),
      potentialBreakingChanges: [
        'Application may fail if it requires root privileges',
        'File system access may be restricted',
        'Some npm packages may not install correctly',
        'Development tools removed may be needed at runtime',
      ],
      confidenceLevel: 0.65,
    });

    return solutions;
  }

  private calculateRiskReduction(allVulns: Vulnerability[], fixedVulnIds: string[]): number {
    // Aggressive strategy assumes high fix rate
    return Math.min((fixedVulnIds.length / allVulns.length) * 95, 100);
  }
}

// Security-first strategy - maximum security focus
class SecurityFirstRemediationStrategy extends RemediationStrategy {
  readonly name = 'security-first-remediation';
  readonly confidence = 0.95;
  readonly breakingChangesRisk = 0.4;

  isApplicable(context: RemediationContext): boolean {
    return context.prioritizeSecurity !== false;
  }

  async generateRemediation(context: RemediationContext): Promise<RemediationResult> {
    // Focus primarily on CRITICAL and HIGH severity vulnerabilities
    const criticalHighVulns = context.vulnerabilities.filter(v =>
      v.severity === 'CRITICAL' || v.severity === 'HIGH',
    );

    const solutions: RemediationSolution[] = [];

    // Security-focused base image selection
    const secureImageSolution = await this.generateSecureBaseImage(context, criticalHighVulns);
    if (secureImageSolution) solutions.push(secureImageSolution);

    // Targeted critical vulnerability fixes
    const criticalFixSolutions = await this.generateCriticalVulnerabilityFixes(context, criticalHighVulns);
    solutions.push(...criticalFixSolutions);

    // Security hardening
    const hardeningSolutions = await this.generateSecurityHardening(context, criticalHighVulns);
    solutions.push(...hardeningSolutions);

    const fixedVulns = solutions.flatMap(sol => sol.vulnerabilitiesFixed);
    const uniqueFixedVulns = [...new Set(fixedVulns)];

    return {
      solutions,
      summary: {
        totalVulnerabilities: context.vulnerabilities.length,
        fixedVulnerabilities: uniqueFixedVulns.length,
        remainingVulnerabilities: context.vulnerabilities.length - uniqueFixedVulns.length,
        riskReduction: this.calculateRiskReduction(context.vulnerabilities, uniqueFixedVulns),
      },
    };
  }

  private async generateSecureBaseImage(
    context: RemediationContext,
    vulnerabilities: Vulnerability[],
  ): Promise<RemediationSolution | null> {
    const dockerfile = context.originalDockerfile;
    const fromMatch = dockerfile.match(/^FROM\s+([^\s]+)/m);

    if (!fromMatch) return null;

    const currentImage = fromMatch[1];

    // Choose most secure base image variants
    let secureImage: string;
    if (currentImage.includes('node')) {
      secureImage = 'node:18-alpine'; // Alpine is more secure, smaller attack surface
    } else if (currentImage.includes('ubuntu')) {
      secureImage = 'ubuntu:22.04'; // Latest LTS with security updates
    } else if (currentImage.includes('debian')) {
      secureImage = 'debian:bookworm-slim'; // Minimal Debian
    } else {
      // Prefer alpine variants when possible
      secureImage = currentImage.includes(':') ?
        `${currentImage.split(':')[0]}:alpine` :
        `${currentImage}:alpine`;
    }

    const baseVulns = vulnerabilities.filter(v =>
      v.package.includes('base-files') ||
      v.package.includes('libc') ||
      v.package.includes('openssl'),
    );

    return {
      type: 'base_image_upgrade',
      description: `Security-focused base image upgrade from ${currentImage} to ${secureImage}`,
      originalContent: fromMatch[0],
      remediatedContent: `FROM ${secureImage}`,
      vulnerabilitiesFixed: baseVulns.map(v => v.id),
      potentialBreakingChanges: [
        'Minimal base image may lack some system tools',
        'Package manager behavior may differ',
      ],
      confidenceLevel: 0.9,
    };
  }

  private async generateCriticalVulnerabilityFixes(
    context: RemediationContext,
    vulnerabilities: Vulnerability[],
  ): Promise<RemediationSolution[]> {
    const solutions: RemediationSolution[] = [];

    // Group critical vulnerabilities by fix approach
    const fixableVulns = vulnerabilities.filter(v => v.fixedVersion);
    const unfixableVulns = vulnerabilities.filter(v => !v.fixedVersion);

    // Handle fixable vulnerabilities with precise version pins
    if (fixableVulns.length > 0) {
      const packageFixes = fixableVulns
        .map(v => `${v.package}=${v.fixedVersion}`)
        .join(' ');

      solutions.push({
        type: 'package_update',
        description: 'Precise fixes for critical vulnerabilities',
        originalContent: '# No targeted vulnerability fixes',
        remediatedContent: `
# Critical vulnerability fixes
RUN apt-get update && \\
    apt-get install -y --no-install-recommends ${packageFixes} && \\
    apt-get clean && \\
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*`,
        vulnerabilitiesFixed: fixableVulns.map(v => v.id),
        potentialBreakingChanges: fixableVulns.map(v =>
          `${v.package} version ${v.fixedVersion} may have API changes`,
        ),
        confidenceLevel: 0.95,
      });
    }

    // Handle unfixable vulnerabilities with mitigation strategies
    if (unfixableVulns.length > 0) {
      solutions.push({
        type: 'config_change',
        description: 'Mitigation for unfixable critical vulnerabilities',
        originalContent: '# No vulnerability mitigations',
        remediatedContent: `
# Mitigation for unfixable vulnerabilities
RUN apt-get purge -y ${unfixableVulns.map(v => v.package).join(' ')} || true
# Add alternative packages if needed
RUN apt-get update && apt-get install -y --no-install-recommends \\
    safer-alternative-packages && \\
    rm -rf /var/lib/apt/lists/*`,
        vulnerabilitiesFixed: [], // These are mitigations, not fixes
        potentialBreakingChanges: [
          'Removing vulnerable packages may break functionality',
          'Alternative packages may have different APIs',
        ],
        confidenceLevel: 0.6,
      });
    }

    return solutions;
  }

  private async generateSecurityHardening(
    context: RemediationContext,
    vulnerabilities: Vulnerability[],
  ): Promise<RemediationSolution[]> {
    const solutions: RemediationSolution[] = [];

    // Security-first hardening focused on vulnerability classes
    const privilegeVulns = vulnerabilities.filter(v =>
      v.description.toLowerCase().includes('privilege') ||
      v.description.toLowerCase().includes('escalation'),
    );

    if (privilegeVulns.length > 0) {
      solutions.push({
        type: 'config_change',
        description: 'Privilege escalation prevention',
        originalContent: '# No privilege restrictions',
        remediatedContent: `
# Privilege escalation prevention
RUN groupadd -r appuser --gid=1000 && \\
    useradd -r -g appuser --uid=1000 --home-dir=/app --shell=/sbin/nologin appuser

# Strict file permissions
RUN chown -R appuser:appuser /app && \\
    chmod -R 750 /app && \\
    chmod -R go-rwx /home/appuser 2>/dev/null || true

# Drop capabilities and use non-root
USER appuser:appuser

# Security environment variables
ENV NODE_ENV=production
ENV NPM_CONFIG_AUDIT_LEVEL=high
ENV NPM_CONFIG_FUND=false`,
        vulnerabilitiesFixed: privilegeVulns.map(v => v.id),
        potentialBreakingChanges: [
          'Application must handle running as non-root user',
          'File system permissions may prevent some operations',
        ],
        confidenceLevel: 0.85,
      });
    }

    return solutions;
  }

  private calculateRiskReduction(allVulns: Vulnerability[], fixedVulnIds: string[]): number {
    const fixedVulns = allVulns.filter(v => fixedVulnIds.includes(v.id));

    // Weight critical and high vulnerabilities more heavily
    const severityWeights = { CRITICAL: 20, HIGH: 10, MEDIUM: 3, LOW: 1 };

    const totalRisk = allVulns.reduce((sum, v) => sum + severityWeights[v.severity], 0);
    const fixedRisk = fixedVulns.reduce((sum, v) => sum + severityWeights[v.severity], 0);

    return totalRisk > 0 ? (fixedRisk / totalRisk) * 100 : 0;
  }
}

// Remediation orchestrator
export class VulnerabilityRemediationOrchestrator extends BaseSamplingOrchestrator<RemediationResult> {
  constructor(logger: Logger, config: Partial<SamplingConfig> = {}) {
    const generator = new VulnerabilityRemediationGenerator(logger);
    const scorer = new RemediationScorer(logger);
    const selector = new HighestScoreWinnerSelector<RemediationResult>();

    const mergedConfig: Partial<SamplingConfig> = {
      maxCandidates: 4, // One for each strategy
      validation: { enabled: true, failFast: false },
      ...config,
    };

    super(logger, generator, scorer, selector, mergedConfig);
  }

  async generateBestRemediation(
    context: RemediationContext,
  ): Promise<Result<ScoredCandidate<RemediationResult>>> {
    this.logger.info({
      sessionId: context.sessionId,
      vulnerabilityCount: context.vulnerabilities.length,
    }, 'Starting vulnerability remediation');

    return this.sample(context);
  }
}

// Simple remediation scorer
import { BaseCandidateScorer } from './sampling/base.js';

class RemediationScorer extends BaseCandidateScorer<RemediationResult> {
  readonly name = 'remediation-scorer';

  constructor(logger: Logger) {
    const weights = {
      riskReduction: 0.4,
      confidenceLevel: 0.3,
      solutionCount: 0.2,
      breakingChangesRisk: 0.1,
    };
    super(logger, weights);
  }

  protected async scoreCandidate(
    candidate: Candidate<RemediationResult>,
  ): Promise<Result<ScoredCandidate<RemediationResult>>> {
    try {
      const remediation = candidate.content;

      const scoreBreakdown = {
        riskReduction: remediation.summary.riskReduction,
        confidenceLevel: (remediation.solutions.reduce((sum, sol) => sum + sol.confidenceLevel, 0) / remediation.solutions.length) * 100,
        solutionCount: Math.min(remediation.solutions.length * 20, 100),
        breakingChangesRisk: (1 - (candidate.metadata.breakingChangesRisk || 0)) * 100,
      };

      const finalScore = this.calculateFinalScore(scoreBreakdown);

      return Success({
        ...candidate,
        score: Math.round(finalScore * 100) / 100,
        scoreBreakdown,
        rank: 0,
      });
    } catch (error) {
      return Failure(`Remediation scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Factory function
export const createRemediationSampler = (
  logger: Logger,
  config: Partial<SamplingConfig> = {},
): VulnerabilityRemediationOrchestrator => {
  return new VulnerabilityRemediationOrchestrator(logger, config);
};

// Type exports
export type {
  RemediationContext,
  RemediationSolution,
  RemediationResult,
};
