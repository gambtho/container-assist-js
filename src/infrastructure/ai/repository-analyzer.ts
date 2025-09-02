/**
 * Repository Analyzer - AI-powered language detection
 */

import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import type { Logger } from '../../domain/types/index.js'
import { MCPSampler } from './ai-types.js'
import { StructuredSampler } from './structured-sampler.js'
import { ok, fail, type Result } from '../../domain/types/result.js'
import { DotNetAnalyzer } from '../analysis/dotnet-analyzer.js'

/**
 * Repository analysis result
 */
export interface RepositoryAnalysis {
  language: string
  languageVersion?: string
  framework?: string
  frameworkVersion?: string
  buildSystem?: {
    type: string
    buildFile: string
    buildCommand?: string
    testCommand?: string
  }
  dependencies: string[]
  devDependencies?: string[]
  entryPoint?: string
  suggestedPorts: number[]
  dockerConfig?: {
    baseImage: string
    multistage: boolean
    nonRootUser: boolean
  }
}

/**
 * JVM-specific analysis result
 */
export interface JVMAnalysis {
  language: 'java' | 'kotlin' | 'scala'
  jvm_version: string
  framework: {
    primary: string
    version: string
    type: 'web' | 'batch' | 'microservice' | 'desktop' | 'library'
    modern_alternatives: string[]
  }
  build_system: {
    type: 'maven' | 'gradle' | 'sbt'
    version: string
    optimization_opportunities: string[]
    containerization_plugins: string[]
  }
  dependencies: {
    runtime: string[]
    security_sensitive: string[]
    outdated: string[]
    container_relevant: string[]
  }
  application_characteristics: {
    startup_type: 'fast' | 'slow' | 'lazy'
    memory_profile: 'low' | 'medium' | 'high'
    cpu_profile: 'light' | 'moderate' | 'intensive'
    io_profile: 'network' | 'disk' | 'both' | 'minimal'
    scaling_pattern: 'horizontal' | 'vertical' | 'both'
  }
  containerization_recommendations: {
    base_image_preferences: string[]
    jvm_tuning: {
      heap_settings: string
      gc_settings: string
      container_awareness: string
    }
    multi_stage_strategy: string
    layer_optimization: string[]
  }
  security_considerations: {
    jvm_security: string[]
    dependency_security: string[]
    runtime_security: string[]
  }
  performance_optimizations: {
    build_time: string[]
    startup_time: string[]
    runtime_performance: string[]
  }
  health_monitoring: {
    health_endpoint: string
    metrics_endpoints: string[]
    logging_recommendations: string[]
  }
}

/**
 * Universal Repository Analyzer using AI
 */
export class UniversalRepositoryAnalyzer {
  private readonly dotnetAnalyzer: DotNetAnalyzer

  constructor(
    private readonly mcpSampler: MCPSampler,
    private readonly logger: Logger
  ) {
    // Initialize .NET analyzer with StructuredSampler
    this.dotnetAnalyzer = new DotNetAnalyzer(
      new StructuredSampler(this.mcpSampler),
      this.logger as any
    )
  }

  /**
   * Analyze repository to detect language, framework, and containerization requirements
   */
  async analyze(repoPath: string): Promise<Result<RepositoryAnalysis>> {
    try {
      this.logger.info(`Starting repository analysis for: ${repoPath}`)

      const [fileList, configFiles, structure] = await Promise.all([
        this.getFileList(repoPath),
        this.readConfigFiles(repoPath),
        this.getDirectoryStructure(repoPath)
      ])

      this.logger.debug(`Found ${fileList.length} files, ${Object.keys(configFiles).length} config files`)

      // Check for .NET project indicators first
      const isDotNetProject = this.dotnetAnalyzer.detectDotNetProject(fileList)

      if (isDotNetProject) {
        this.logger.info('.NET project detected, using specialized .NET analysis')

        // Use AI-powered .NET analysis
        const dotnetAnalysis = await this.dotnetAnalyzer.analyzeDotNetProject(
          repoPath, fileList, configFiles, structure
        )

        if (dotnetAnalysis.success && dotnetAnalysis.data) {
          const repositoryAnalysis = this.dotnetAnalyzer.convertDotNetToRepositoryAnalysis(
            dotnetAnalysis.data
          )
          this.logger.info(`
            .NET analysis completed - Language: ${repositoryAnalysis.language},
            Framework: ${repositoryAnalysis.framework || 'none'},
            Target Framework: ${dotnetAnalysis.data.target_framework}
          `)
          return ok(repositoryAnalysis)
        }

        // Fall back to general analysis if .NET analysis fails
        this.logger.warn('.NET analysis failed, falling back to general analysis')
      }

      // Check for JVM project indicators
      const isJVMProject = this.detectJVMProject(fileList)

      if (isJVMProject) {
        this.logger.info('JVM project detected, using specialized JVM analysis')

        // Use AI-powered JVM analysis
        const jvmAnalysis = await this.performAIJVMAnalysis(
          repoPath, fileList, configFiles, structure
        )

        if (jvmAnalysis.success && jvmAnalysis.data) {
          const repositoryAnalysis = this.convertJVMToRepositoryAnalysis(jvmAnalysis.data)
          this.logger.info(`JVM analysis completed - Language: ${repositoryAnalysis.language}, Framework: ${repositoryAnalysis.framework || 'none'}`)
          return ok(repositoryAnalysis)
        }

        // Fall back to general analysis if JVM analysis fails
        this.logger.warn('JVM analysis failed, falling back to general analysis')
      }

      // Use general AI analysis for non-JVM or fallback
      const aiResponse = await this.mcpSampler.sample<RepositoryAnalysis>({
        templateId: 'repository-analysis',
        variables: {
          fileList: fileList.slice(0, 500).join('\n'),
          configFiles: this.truncateConfigs(configFiles),
          directoryTree: structure,
          currentDate: new Date().toISOString().split('T')[0]
        },
        format: 'json'
      })

      if (!aiResponse.success) {
        return fail(`AI analysis failed: ${aiResponse.error?.message}`)
      }

      // Validate and enhance the response
      const analysis = this.validateAndEnhanceAnalysis(aiResponse.content)

      this.logger.info(`Analysis completed - Language: ${analysis.language}, Framework: ${analysis.framework || 'none'}`)

      return ok(analysis)

    } catch (error) {
      this.logger.error(`Repository analysis failed: ${(error as Error).message}`)
      return fail(`Repository analysis failed: ${(error as Error).message}`)
    }
  }

  /**
   * Get list of files in the repository (first 500)
   */
  private async getFileList(repoPath: string): Promise<string[]> {
    const files: string[] = []

    try {
      await this.scanDirectory(repoPath, files, 0, 500)
    } catch (error) {
      this.logger.warn(`Error scanning directory: ${(error as Error).message}`)
    }

    return files
  }

  /**
   * Recursively scan directory for files
   */
  private async scanDirectory(
    dirPath: string,
    files: string[],
    depth: number,
    maxFiles: number
  ): Promise<void> {
    if (files.length >= maxFiles || depth > 5) return

    try {
      const items = await readdir(dirPath)

      for (const item of items) {
        if (files.length >= maxFiles) break

        // Skip hidden files and common ignore patterns
        if (item.startsWith('.') || this.shouldIgnore(item)) {
          continue
        }

        const itemPath = join(dirPath, item)
        const stats = await stat(itemPath)

        if (stats.isFile()) {
          const relativePath = itemPath.replace(dirPath, '').replace(/^\//, '')
          files.push(relativePath)
        } else if (stats.isDirectory() && depth < 3) {
          await this.scanDirectory(itemPath, files, depth + 1, maxFiles)
        }
      }
    } catch (error) {
      // Ignore directory access errors
    }
  }

  /**
   * Check if file/directory should be ignored
   */
  private shouldIgnore(name: string): boolean {
    const ignorePatterns = [
      'node_modules', 'target', 'build', 'dist', '.git',
      'vendor', '__pycache__', '.pytest_cache', 'coverage',
      '.idea', '.vscode', '.gradle'
    ]

    return ignorePatterns.some(pattern => name.includes(pattern))
  }

  /**
   * Read common configuration files
   */
  private async readConfigFiles(repoPath: string): Promise<Record<string, string>> {
    const configFiles: Record<string, string> = {}

    const commonConfigs = [
      'package.json', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'build.sbt',
      'settings.gradle', 'gradle.properties', 'application.properties', 'application.yml', 'application.yaml',
      'Cargo.toml', 'requirements.txt', 'go.mod', 'composer.json', 'Pipfile', 'poetry.lock',
      'Dockerfile', 'docker-compose.yml', 'kubernetes.yaml', 'k8s.yaml', '.env',
      'Makefile', 'CMakeLists.txt', 'setup.py', 'pyproject.toml',
      // .NET configuration files
      'appsettings.json', 'appsettings.Development.json', 'appsettings.Production.json',
      'global.json', 'nuget.config', 'Directory.Build.props', 'Directory.Build.targets',
      'packages.config', 'web.config', 'app.config'
    ]

    for (const configFile of commonConfigs) {
      try {
        const filePath = join(repoPath, configFile)
        const content = await readFile(filePath, 'utf8')
        configFiles[configFile] = content.slice(0, 2000); // Truncate to 2KB
      } catch (error) {
        // File doesn't exist, skip
      }
    }

    return configFiles
  }

  /**
   * Get directory structure (simplified tree)
   */
  private async getDirectoryStructure(repoPath: string): Promise<string> {
    const structure: string[] = []

    try {
      await this.buildTree(repoPath, structure, '', 0, 20)
    } catch (error) {
      this.logger.warn(`Error building directory tree: ${(error as Error).message}`)
    }

    return structure.join('\n')
  }

  /**
   * Build directory tree structure
   */
  private async buildTree(dirPath: string, structure: string[], prefix: string, depth: number, maxItems: number): Promise<void> {
    if (structure.length >= maxItems || depth > 3) return

    try {
      const items = await readdir(dirPath)

      for (const item of items.slice(0, 10)) { // Limit items per directory
        if (structure.length >= maxItems) break

        if (item.startsWith('.') || this.shouldIgnore(item)) {
          continue
        }

        const itemPath = join(dirPath, item)
        const stats = await stat(itemPath)

        structure.push(`${prefix}${item}${stats.isDirectory() ? '/' : ''}`)

        if (stats.isDirectory() && depth < 2) {
          await this.buildTree(itemPath, structure, `${prefix}  `, depth + 1, maxItems)
        }
      }
    } catch (error) {
      // Ignore directory access errors
    }
  }

  /**
   * Truncate config files to reasonable size for AI
   */
  private truncateConfigs(configFiles: Record<string, string>): string {
    const entries = Object.entries(configFiles)
    const truncatedEntries = entries.map(([file, content]) => {
      const truncated = content.length > 1000 ? `${content.slice(0, 1000)}...` : content
      return `=== ${file} ===\n${truncated}\n`
    })

    return truncatedEntries.join('\n')
  }

  /**
   * Validate and enhance AI analysis response
   */
  private validateAndEnhanceAnalysis(analysis: any): RepositoryAnalysis {
    // Ensure required fields exist with defaults
    const validated: RepositoryAnalysis = {
      language: analysis.language || 'unknown',
      languageVersion: analysis.languageVersion || undefined,
      framework: analysis.framework || undefined,
      frameworkVersion: analysis.frameworkVersion || undefined,
      buildSystem: analysis.buildSystem || {
        type: 'unknown',
        buildFile: 'unknown'
      },
      dependencies: Array.isArray(analysis.dependencies) ? analysis.dependencies : [],
      devDependencies: Array.isArray(analysis.devDependencies) ? analysis.devDependencies : undefined,
      entryPoint: analysis.entryPoint || undefined,
      suggestedPorts: Array.isArray(analysis.suggestedPorts) ? analysis.suggestedPorts : [8080],
      dockerConfig: analysis.dockerConfig || {
        baseImage: this.getDefaultBaseImage(analysis.language),
        multistage: this.shouldUseMultistage(analysis.language),
        nonRootUser: true
      }
    }

    // Enhance with language-specific defaults
    this.enhanceWithLanguageDefaults(validated)

    return validated
  }

  /**
   * Get default base image for language
   */
  private getDefaultBaseImage(language: string): string {
    const baseImages: Record<string, string> = {
      'javascript': 'node:18-slim',
      'nodejs': 'node:18-slim',
      'typescript': 'node:18-slim',
      'python': 'python:3.11-slim',
      'java': 'openjdk:17-slim',
      'go': 'golang:1.21-alpine',
      'rust': 'rust:1.75-slim',
      'php': 'php:8.2-fpm-alpine',
      'ruby': 'ruby:3.2-slim',
      'csharp': 'mcr.microsoft.com/dotnet/runtime:7.0-alpine',
      'dotnet': 'mcr.microsoft.com/dotnet/runtime:7.0-alpine'
    }

    return baseImages[language.toLowerCase()] || 'ubuntu:22.04'
  }

  /**
   * Determine if multistage build should be used
   */
  private shouldUseMultistage(language: string): boolean {
    const multistageLanguages = ['java', 'go', 'rust', 'csharp', 'dotnet', 'scala', 'kotlin']
    return multistageLanguages.includes(language.toLowerCase())
  }

  /**
   * Enhance analysis with language-specific defaults
   */
  private enhanceWithLanguageDefaults(analysis: RepositoryAnalysis): void {
    const lang = analysis.language.toLowerCase()

    // Set default ports based on framework/language
    if (analysis.suggestedPorts.length === 0 || analysis.suggestedPorts.includes(8080)) {
      const defaultPorts: Record<string, number[]> = {
        'express': [3000],
        'react': [3000],
        'vue': [8080, 3000],
        'angular': [4200],
        'nextjs': [3000],
        'nuxt': [3000],
        'django': [8000],
        'flask': [5000],
        'fastapi': [8000],
        'spring': [8080],
        'gin': [8080],
        'fiber': [3000],
        'rails': [3000]
      }

      const framework = analysis.framework?.toLowerCase()
      if (framework && defaultPorts[framework]) {
        analysis.suggestedPorts = defaultPorts[framework]!
      } else {
        // Language defaults
        const langPorts: Record<string, number[]> = {
          'javascript': [3000, 8000],
          'nodejs': [3000, 8000],
          'typescript': [3000, 8000],
          'python': [8000, 5000],
          'java': [8080],
          'go': [8080, 3000],
          'rust': [8080],
          'php': [80, 8080],
          'ruby': [3000],
          'csharp': [80, 5000],
          'dotnet': [80, 5000]
        }

        if (langPorts[lang]) {
          analysis.suggestedPorts = langPorts[lang]!
        }
      }
    }

    // Enhance build system information
    if (analysis.buildSystem && analysis.buildSystem.type === 'unknown') {
      const buildSystems: Record<string, { type: string; buildFile: string; buildCommand?: string; testCommand?: string }> = {
        'javascript': { type: 'npm', buildFile: 'package.json', buildCommand: 'npm run build', testCommand: 'npm test' },
        'nodejs': { type: 'npm', buildFile: 'package.json', buildCommand: 'npm run build', testCommand: 'npm test' },
        'typescript': { type: 'npm', buildFile: 'package.json', buildCommand: 'npm run build', testCommand: 'npm test' },
        'python': { type: 'pip', buildFile: 'requirements.txt', buildCommand: 'pip install -r requirements.txt', testCommand: 'pytest' },
        'java': { type: 'maven', buildFile: 'pom.xml', buildCommand: 'mvn compile', testCommand: 'mvn test' },
        'go': { type: 'go', buildFile: 'go.mod', buildCommand: 'go build', testCommand: 'go test' },
        'rust': { type: 'cargo', buildFile: 'Cargo.toml', buildCommand: 'cargo build', testCommand: 'cargo test' },
        'php': { type: 'composer', buildFile: 'composer.json', buildCommand: 'composer install', testCommand: 'phpunit' },
        'ruby': { type: 'bundler', buildFile: 'Gemfile', buildCommand: 'bundle install', testCommand: 'rspec' }
      }

      if (buildSystems[lang]) {
        analysis.buildSystem = buildSystems[lang]!
      }
    }
  }

  /**
   * Detect if this is a JVM project
   */
  private detectJVMProject(fileList: string[]): boolean {
    const jvmIndicators = [
      '.java', '.kt', '.scala',
      'pom.xml', 'build.gradle', 'build.gradle.kts', 'build.sbt',
      'src/main/java', 'src/main/kotlin', 'src/main/scala'
    ]

    return jvmIndicators.some(indicator =>
      fileList.some(file => file.includes(indicator))
    )
  }

  /**
   * Perform AI-powered JVM analysis
   */
  private async performAIJVMAnalysis(
    repoPath: string,
    fileList: string[],
    configFiles: Record<string, string>,
    structure: string
  ): Promise<Result<JVMAnalysis>> {
    try {
      // Read build files for detailed analysis
      const buildFilesContent = await this.readBuildFiles(repoPath, fileList)

      const jvmAnalysis = await this.mcpSampler.sample<JVMAnalysis>({
        templateId: 'jvm-analysis',
        variables: {
          file_list: fileList.join('\n'),
          config_files: JSON.stringify(configFiles, null, 2),
          build_files_content: buildFilesContent,
          directory_structure: structure,
          current_date: new Date().toISOString().split('T')[0]
        },
        format: 'json'
      })

      if (jvmAnalysis.success && jvmAnalysis.content) {
        return ok(jvmAnalysis.content)
      } else {
        return fail(jvmAnalysis.error?.message || 'JVM analysis failed')
      }
    } catch (error) {
      this.logger.error(`JVM analysis failed: ${(error as Error).message}`)
      return fail(`JVM analysis failed: ${(error as Error).message}`)
    }
  }

  /**
   * Read build files for JVM analysis
   */
  private async readBuildFiles(repoPath: string, fileList: string[]): Promise<string> {
    const buildFiles = ['pom.xml', 'build.gradle', 'build.gradle.kts', 'build.sbt', 'gradle.properties', 'settings.gradle']
    const contents: string[] = []

    for (const buildFile of buildFiles) {
      const matchingFiles = fileList.filter(file => file.includes(buildFile))

      for (const file of matchingFiles.slice(0, 3)) { // Limit to 3 files per type
        try {
          const filePath = join(repoPath, file)
          const content = await readFile(filePath, 'utf8')
          contents.push(`=== ${file} ===\n${content.slice(0, 3000)}\n`)
        } catch (error) {
          // File doesn't exist or can't be read
        }
      }
    }

    return contents.join('\n')
  }

  /**
   * Convert JVM analysis to repository analysis format
   */
  private convertJVMToRepositoryAnalysis(jvmAnalysis: JVMAnalysis): RepositoryAnalysis {
    return {
      language: jvmAnalysis.language,
      languageVersion: jvmAnalysis.jvm_version,
      framework: jvmAnalysis.framework.primary,
      frameworkVersion: jvmAnalysis.framework.version,
      buildSystem: {
        type: jvmAnalysis.build_system.type,
        buildFile: this.getBuildFileForType(jvmAnalysis.build_system.type),
        buildCommand: this.getBuildCommandForType(jvmAnalysis.build_system.type),
        testCommand: this.getTestCommandForType(jvmAnalysis.build_system.type)
      },
      dependencies: jvmAnalysis.dependencies.runtime,
      devDependencies: [...jvmAnalysis.dependencies.security_sensitive, ...jvmAnalysis.dependencies.container_relevant],
      ...(jvmAnalysis.framework.type === 'web' && { entryPoint: 'main application class' }),
      suggestedPorts: this.getJVMPortsForFramework(jvmAnalysis.framework.primary),
      dockerConfig: {
        baseImage: jvmAnalysis.containerization_recommendations.base_image_preferences[0] || this.getDefaultBaseImage(jvmAnalysis.language),
        multistage: jvmAnalysis.containerization_recommendations.multi_stage_strategy.includes('multi-stage'),
        nonRootUser: true
      }
    }
  }

  /**
   * Get build file name for JVM build system type
   */
  private getBuildFileForType(buildType: string): string {
    switch (buildType) {
      case 'maven': return 'pom.xml'
      case 'gradle': return 'build.gradle'
      case 'sbt': return 'build.sbt'
      default: return 'build file'
    }
  }

  /**
   * Get build command for JVM build system type
   */
  private getBuildCommandForType(buildType: string): string {
    switch (buildType) {
      case 'maven': return 'mvn compile'
      case 'gradle': return './gradlew build'
      case 'sbt': return 'sbt compile'
      default: return 'build command'
    }
  }

  /**
   * Get test command for JVM build system type
   */
  private getTestCommandForType(buildType: string): string {
    switch (buildType) {
      case 'maven': return 'mvn test'
      case 'gradle': return './gradlew test'
      case 'sbt': return 'sbt test'
      default: return 'test command'
    }
  }

  /**
   * Get default ports for JVM frameworks
   */
  private getJVMPortsForFramework(framework: string): number[] {
    const frameworkPorts: Record<string, number[]> = {
      'spring-boot': [8080],
      'spring': [8080],
      'quarkus': [8080],
      'micronaut': [8080],
      'dropwizard': [8080, 8081],
      'vert.x': [8080],
      'play': [9000],
      'akka-http': [8080],
      'http4s': [8080],
      'spark': [4567],
      'javalin': [7000],
      'ratpack': [5050]
    }

    const frameworkLower = framework.toLowerCase()
    for (const [key, ports] of Object.entries(frameworkPorts)) {
      if (frameworkLower.includes(key) || key.includes(frameworkLower)) {
        return ports
      }
    }

    return [8080]; // Default JVM port
  }

}


