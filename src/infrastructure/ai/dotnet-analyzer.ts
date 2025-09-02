/**
 * .NET Project Analyzer
 * AI-powered analysis of .NET projects with comprehensive ecosystem understanding
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import type { Logger } from '../../domain/types/index.js'
import type { StructuredSampler } from '../ai/structured-sampler.js'
import { ok, fail, type Result } from '../../domain/types/result.js'
import { DotNetAnalysisSchema, type DotNetAnalysis } from '../../domain/types/dotnet.js'

/**
 * Repository analysis result interface
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
    buildArgs?: Record<string, string>
    environmentVars?: Record<string, string>
    healthCheck?: {
      interval: string
      timeout: string
      retries: number
      test: string[]
    }
  }
}

export class DotNetAnalyzer {
  constructor(
    private readonly structuredSampler: StructuredSampler,
    private readonly logger: Logger
  ) {}

  /**
   * Analyze a .NET project using AI-powered analysis
   */
  async analyzeDotNetProject(
    repoPath: string,
    fileList: string[],
    configFiles: Record<string, string>,
    structure: string
  ): Promise<Result<DotNetAnalysis>> {
    try {
      // Read .NET project files for detailed analysis
      const projectFilesContent = await this.readDotNetProjectFiles(repoPath, fileList)

      this.logger.info({
        projectFilesCount: projectFilesContent.split('===').length - 1,
        repoPath
      }, 'Starting AI-powered .NET project analysis')

      const dotnetAnalysis = await this.structuredSampler.sampleJSON<DotNetAnalysis>({
        templateId: 'dotnet-analysis',
        variables: {
          file_list: fileList.slice(0, 500).join('\n'), // Limit to prevent token overflow
          project_files_content: projectFilesContent,
          config_files: JSON.stringify(configFiles, null, 2),
          directory_structure: structure,
          current_date: new Date().toISOString().split('T')[0]
        }
      }, DotNetAnalysisSchema)

      if (!dotnetAnalysis.success || !dotnetAnalysis.data) {
        return fail(`AI-powered .NET analysis failed: ${dotnetAnalysis.error?.message ?? 'No data returned'}`)
      }

      if (!dotnetAnalysis.data) {
        return fail('AI-powered .NET analysis returned no data')
      }

      const analysisData = dotnetAnalysis.data
      this.logger.info({
        dotnetVersion: analysisData.dotnet_version,
        targetFramework: analysisData.target_framework,
        projectType: analysisData.project_type.primary,
        framework: analysisData.project_type.framework
      }, '.NET project analysis completed successfully')

      return ok(analysisData)

    } catch (error) {
      this.logger.error({ error, repoPath }); // Fixed logger call
      return fail(`Failed to analyze .NET project: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Detect if a project is a .NET project based on file indicators
   */
  detectDotNetProject(fileList: string[]): boolean {
    const dotnetIndicators = [
      '.csproj', '.vbproj', '.fsproj',
      '.sln', 'global.json', 'nuget.config',
      'appsettings.json', 'Program.cs', 'Startup.cs',
      'Controllers/', 'Views/', 'Models/',
      'wwwroot/', 'bin/', 'obj/',
      'App.xaml', 'MainWindow.xaml', // WPF indicators
      'App.config', 'web.config',    // Config files
      'packages.config'              // Legacy package management
    ]

    const hasIndicators = dotnetIndicators.some(indicator =>
      fileList.some(file => file.toLowerCase().includes(indicator.toLowerCase()))
    )

    if (hasIndicators) {
      this.logger.debug({
        foundIndicators: dotnetIndicators.filter(indicator =>
          fileList.some(file => file.toLowerCase().includes(indicator.toLowerCase()))
        )
      }, '.NET project detected')
    }

    return hasIndicators
  }

  /**
   * Convert AI-generated .NET analysis to standard RepositoryAnalysis format
   */
  convertDotNetToRepositoryAnalysis(dotnetAnalysis: DotNetAnalysis): RepositoryAnalysis {
    const projectFile = this.findProjectFile(dotnetAnalysis)
    const entryPoint = this.determineEntryPoint(dotnetAnalysis.project_type)
    const suggestedPorts = this.getSuggestedPorts(dotnetAnalysis.project_type)
    const baseImage = this.selectBaseImage(dotnetAnalysis)

    return {
      language: 'csharp',
      languageVersion: dotnetAnalysis.dotnet_version,
      framework: dotnetAnalysis.project_type.framework,
      frameworkVersion: dotnetAnalysis.target_framework,
      buildSystem: {
        type: 'msbuild',
        buildFile: projectFile,
        buildCommand: 'dotnet build',
        testCommand: 'dotnet test'
      },
      dependencies: dotnetAnalysis.dependencies.nuget_packages,
      devDependencies: dotnetAnalysis.dependencies.framework_dependencies,
      entryPoint,
      suggestedPorts,
      dockerConfig: (() => {
        const healthCheck = this.getHealthCheck(dotnetAnalysis)
        return {
          baseImage,
          multistage: true,
          nonRootUser: true,
          buildArgs: this.getBuildArgs(dotnetAnalysis),
          environmentVars: this.getEnvironmentVars(dotnetAnalysis),
          ...(healthCheck ? { healthCheck } : {})
        }
      })()
    }
  }

  /**
   * Read .NET project files for detailed analysis
   */
  private async readDotNetProjectFiles(repoPath: string, fileList: string[]): Promise<string> {
    const projectFiles = fileList.filter(file =>
      file.endsWith('.csproj') ||
      file.endsWith('.vbproj') ||
      file.endsWith('.fsproj') ||
      file.endsWith('.sln') ||
      file.includes('appsettings.json') ||
      file.includes('appsettings.Development.json') ||
      file.includes('appsettings.Production.json') ||
      file.includes('global.json') ||
      file.includes('nuget.config') ||
      file.includes('Directory.Build.props') ||
      file.includes('Directory.Build.targets') ||
      file.includes('packages.config') ||
      file.includes('web.config') ||
      file.includes('app.config')
    )

    const contents: string[] = []

    for (const file of projectFiles.slice(0, 15)) { // Limit to first 15 files to manage token usage
      try {
        const fullPath = path.resolve(repoPath, file)
        const content = await fs.readFile(fullPath, 'utf-8')
        // Truncate very large files to prevent token overflow
        const truncatedContent = content.length > 5000 ?
          `${content.substring(0, 5000)}\n... [truncated]` :
          content
        contents.push(`=== ${file} ===\n${truncatedContent}\n`)
      } catch (error) {
        this.logger.debug({ file, error }); // Fixed logger call
        contents.push(`=== ${file} ===\n[Error reading file: ${error instanceof Error ? error.message : String(error)}]\n`)
      }
    }

    if (contents.length === 0) {
      contents.push('No .NET project files could be read')
    }

    return contents.join('\n')
  }

  /**
   * Find the main project file based on analysis
   */
  private findProjectFile(analysis: DotNetAnalysis): string {
    const projectType = analysis.project_type.primary
    const framework = analysis.project_type.framework

    switch (projectType) {
      case 'web':
        if (framework === 'blazor') return 'BlazorApp.csproj'
        if (framework === 'mvc') return 'WebMvc.csproj'
        if (framework === 'webapi') return 'WebApi.csproj'
        return 'Web.csproj'
      case 'console':
        return 'Console.csproj'
      case 'library':
        return 'Library.csproj'
      case 'service':
        return 'Service.csproj'
      case 'desktop':
        if (framework === 'wpf') return 'WpfApp.csproj'
        if (framework === 'winforms') return 'WinFormsApp.csproj'
        return 'DesktopApp.csproj'
      default:
        return 'Project.csproj'
    }
  }

  /**
   * Determine the application entry point
   */
  private determineEntryPoint(projectType: DotNetAnalysis['project_type']): string {
    switch (projectType.primary) {
      case 'web':
      case 'service':
        return projectType.framework === 'aspnetcore' ? 'Program.cs' : 'Startup.cs'
      case 'console':
        return 'Program.cs'
      case 'library':
        return 'library.dll'
      case 'desktop':
        return projectType.framework === 'wpf' ? 'App.xaml' : 'Program.cs'
      default:
        return 'Program.cs'
    }
  }

  /**
   * Get suggested ports based on project type
   */
  private getSuggestedPorts(projectType: DotNetAnalysis['project_type']): number[] {
    switch (projectType.framework) {
      case 'aspnetcore':
      case 'webapi':
        return [80, 443, 5000, 5001, 8080]
      case 'mvc':
        return [80, 443, 8080]
      case 'blazor':
        return [80, 443, 5000, 5001]
      case 'worker':
        return []; // Background services typically don't expose ports
      default:
        return [8080]
    }
  }

  /**
   * Select optimal base image based on analysis
   */
  private selectBaseImage(analysis: DotNetAnalysis): string {
    const preferences = analysis.containerization_recommendations.base_image_preferences
    if (preferences.length > 0) {
      return preferences[0]; // Use AI's primary recommendation
    }

    // Fallback logic based on target framework
    const targetFramework = analysis.target_framework
    if (targetFramework.startsWith('net8')) {
      return analysis.project_type.primary === 'web' ?
        'mcr.microsoft.com/dotnet/aspnet:8.0' :
        'mcr.microsoft.com/dotnet/runtime:8.0'
    } else if (targetFramework.startsWith('net7')) {
      return analysis.project_type.primary === 'web' ?
        'mcr.microsoft.com/dotnet/aspnet:7.0' :
        'mcr.microsoft.com/dotnet/runtime:7.0'
    } else if (targetFramework.startsWith('net6')) {
      return analysis.project_type.primary === 'web' ?
        'mcr.microsoft.com/dotnet/aspnet:6.0' :
        'mcr.microsoft.com/dotnet/runtime:6.0'
    }

    // Default for modern .NET
    return 'mcr.microsoft.com/dotnet/aspnet:8.0'
  }

  /**
   * Get build arguments for Docker
   */
  private getBuildArgs(analysis: DotNetAnalysis): Record<string, string> {
    const buildArgs: Record<string, string> = {}

    if (analysis.target_framework) {
      buildArgs.TARGET_FRAMEWORK = analysis.target_framework
    }

    if (analysis.dotnet_version) {
      buildArgs.DOTNET_VERSION = analysis.dotnet_version
    }

    // Add performance optimizations as build args
    if (analysis.performance_optimizations.build_time.includes('self-contained')) {
      buildArgs.SELF_CONTAINED = 'true'
    }

    if (analysis.containerization_recommendations.aot_compilation.includes('enabled')) {
      buildArgs.PUBLISH_AOT = 'true'
    }

    return buildArgs
  }

  /**
   * Get environment variables for runtime
   */
  private getEnvironmentVars(analysis: DotNetAnalysis): Record<string, string> {
    const envVars: Record<string, string> = {}

    // Runtime optimizations
    const runtimeConfig = analysis.containerization_recommendations.runtime_optimizations
    if (runtimeConfig.gc_settings) {
      envVars.DOTNET_gcServer = '1'
    }

    if (runtimeConfig.globalization.includes('invariant')) {
      envVars.DOTNET_SYSTEM_GLOBALIZATION_INVARIANT = 'true'
    }

    // Web-specific settings
    if (analysis.project_type.primary === 'web') {
      envVars.ASPNETCORE_URLS = 'http://+:80'
      envVars.ASPNETCORE_ENVIRONMENT = 'Production'
    }

    return envVars
  }

  /**
   * Get health check configuration
   */
  private getHealthCheck(analysis: DotNetAnalysis): { interval: string; timeout: string; retries?: number; test?: string[] } | undefined {
    const healthChecks = analysis.cloud_native_features.health_checks

    if (healthChecks.length > 0 && analysis.project_type.primary === 'web') {
      return {
        interval: '30s',
        timeout: '3s',
        retries: 3,
        test: ['CMD', 'curl', '-f', 'http://localhost/health', '||', 'exit', '1']
      }
    }

    return undefined
  }
}


