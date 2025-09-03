/**
 * .NET Workflow Integration Tests
 * Comprehensive testing for .NET ecosystem integration
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { nanoid } from 'nanoid';
import { MockMCPSampler } from '../utils/mock-mcp-sampler.js';
import { UniversalRepositoryAnalyzer } from '../../src/infrastructure/ai/repository-analyzer.js';
import { createTestLogger } from '../utils/test-logger.js';
import { ToolRegistry } from '../../src/service/tools/registry.js';
import { createTestDependencies } from '../utils/test-dependencies.js';
import path from 'path';

describe('.NET Workflow Integration', () => {
  let mockSampler: MockMCPSampler;
  let analyzer: UniversalRepositoryAnalyzer;
  let toolRegistry: ToolRegistry;
  let logger: any;
  let dependencies: any;

  beforeEach(async () => {
    logger = createTestLogger();
    mockSampler = new MockMCPSampler();
    analyzer = new UniversalRepositoryAnalyzer(mockSampler, logger);
    dependencies = await createTestDependencies();
    toolRegistry = new ToolRegistry(dependencies);
  });

  afterEach(async () => {
    // Cleanup if needed
  });

  describe('ASP.NET Core Web Application', () => {
    it('should complete full containerization workflow for ASP.NET Core app', async () => {
      const sessionId = nanoid();
      const testFixturePath = path.join(__dirname, '../fixtures/aspnet-core-web');

      // Mock AI responses for ASP.NET Core analysis
      mockSampler.addMockResponse('dotnet-analysis', {
        dotnet_version: '8.0',
        target_framework: 'net8.0',
        project_type: {
          primary: 'web',
          framework: 'aspnetcore',
          hosting_model: 'kestrel',
          modern_alternatives: []
        },
        build_system: {
          sdk_style: true,
          package_management: 'packagereference',
          build_optimizations: ['restore-only-dependencies'],
          containerization_features: ['multi-stage-build']
        },
        dependencies: {
          nuget_packages: ['Microsoft.AspNetCore.OpenApi', 'Swashbuckle.AspNetCore'],
          framework_dependencies: ['Microsoft.NET.Sdk.Web'],
          security_sensitive: [],
          outdated: [],
          container_relevant: ['Microsoft.Extensions.Diagnostics.HealthChecks']
        },
        application_characteristics: {
          startup_type: 'fast',
          memory_profile: 'medium',
          cpu_profile: 'light',
          io_profile: 'network',
          scaling_pattern: 'horizontal',
          state_management: 'stateless'
        },
        containerization_recommendations: {
          base_image_preferences: ['mcr.microsoft.com/dotnet/aspnet:8.0', 'mcr.microsoft.com/dotnet/aspnet:8.0-alpine'],
          runtime_optimizations: {
            gc_settings: 'server',
            runtime_config: '--gc-server',
            globalization: 'invariant'
          },
          multi_stage_strategy: 'build-stage-runtime-stage',
          layer_optimization: ['copy-csproj-first', 'restore-before-copy'],
          aot_compilation: 'not-recommended-for-web'
        },
        security_considerations: {
          dotnet_security: ['use-non-root-user', 'disable-debug-info'],
          dependency_security: ['regular-package-updates'],
          runtime_security: ['https-redirect', 'secure-headers'],
          https_configuration: ['use-tls-1.2-minimum']
        },
        performance_optimizations: {
          build_time: ['layered-builds', 'dependency-caching'],
          startup_time: ['ahead-of-time-compilation'],
          runtime_performance: ['server-gc', 'tiered-compilation'],
          memory_optimization: ['trimming', 'compression']
        },
        cloud_native_features: {
          configuration: ['environment-variables', 'appsettings-json'],
          logging: ['structured-logging', 'console-provider'],
          health_checks: ['/health'],
          metrics: ['prometheus-metrics'],
          service_discovery: ['kubernetes-service-discovery']
        },
        migration_recommendations: {
          framework_migration: 'already-modern',
          modernization_opportunities: ['add-telemetry', 'improve-health-checks'],
          breaking_changes: []
        }
      });

      // 1. Analyze .NET repository
      const analysisResult = await toolRegistry.handleToolCall({
        name: 'analyze-repository',
        arguments: { 
          repo_path: testFixturePath,
          session_id: sessionId
        }
      });
      
      expect(analysisResult.content[0].text).toContain('csharp');
      expect(analysisResult.content[0].text).toContain('aspnetcore');
      
      // 2. Resolve base images for .NET
      const baseImageResult = await toolRegistry.handleToolCall({
        name: 'resolve-base-images', 
        arguments: { 
          session_id: sessionId,
          security_level: 'standard',
          performance_priority: 'speed'
        }
      });
      
      const baseImageResponse = JSON.parse(baseImageResult.content[0].text);
      expect(baseImageResponse.primary_recommendation.image).toContain('mcr.microsoft.com/dotnet');
      
      // 3. Generate Dockerfile optimized for .NET
      const dockerfileResult = await toolRegistry.handleToolCall({
        name: 'generate-dockerfile',
        arguments: { session_id: sessionId }
      });
      
      const dockerfileContent = dockerfileResult.content[0].text;
      expect(dockerfileContent).toContain('FROM mcr.microsoft.com/dotnet');
      expect(dockerfileContent).toContain('COPY *.csproj');
      expect(dockerfileContent).toContain('dotnet restore');
      
      // 4. Test .NET-specific build optimizations
      expect(dockerfileContent).toContain('dotnet publish');
      expect(dockerfileContent).toContain('--no-restore');
      expect(dockerfileContent).toContain('HEALTHCHECK');
    });
    
    it('should optimize Docker build for different security levels', async () => {
      const sessionId = nanoid();
      const testFixturePath = path.join(__dirname, '../fixtures/aspnet-core-web');
      
      // Test hardened security level
      const hardenedResult = await toolRegistry.handleToolCall({
        name: 'resolve-base-images',
        arguments: {
          session_id: sessionId,
          security_level: 'hardened',
          performance_priority: 'size'
        }
      });
      
      const hardenedResponse = JSON.parse(hardenedResult.content[0].text);
      expect(hardenedResponse.primary_recommendation.image).toMatch(/(distroless|alpine|chiseled)/);
      expect(hardenedResponse.security_considerations.vulnerability_status).toBeDefined();
    });
  });

  describe('.NET Framework to .NET Core Migration', () => {
    it('should handle .NET Framework to .NET Core migration recommendations', async () => {
      const sessionId = nanoid();
      const testFixturePath = path.join(__dirname, '../fixtures/dotnet-framework-legacy');
      
      // Mock AI response for legacy .NET Framework project
      mockSampler.addMockResponse('dotnet-analysis', {
        dotnet_version: '4.8',
        target_framework: 'netframework4.8',
        project_type: {
          primary: 'web',
          framework: 'mvc',
          hosting_model: 'iis',
          modern_alternatives: ['aspnetcore-mvc']
        },
        build_system: {
          sdk_style: false,
          package_management: 'packagesconfig',
          build_optimizations: ['convert-to-sdk-style'],
          containerization_features: ['windows-containers-required']
        },
        dependencies: {
          nuget_packages: ['Microsoft.AspNet.Mvc'],
          framework_dependencies: ['.NET Framework 4.8'],
          security_sensitive: ['Newtonsoft.Json'],
          outdated: ['Microsoft.AspNet.Mvc'],
          container_relevant: []
        },
        application_characteristics: {
          startup_type: 'slow',
          memory_profile: 'high',
          cpu_profile: 'moderate',
          io_profile: 'disk',
          scaling_pattern: 'vertical',
          state_management: 'stateful'
        },
        containerization_recommendations: {
          base_image_preferences: ['mcr.microsoft.com/dotnet/framework/aspnet:4.8-windowsservercore-ltsc2022'],
          runtime_optimizations: {
            gc_settings: 'workstation',
            runtime_config: 'legacy-framework',
            globalization: 'full-cultures'
          },
          multi_stage_strategy: 'limited-on-windows',
          layer_optimization: ['minimize-layer-count'],
          aot_compilation: 'not-available'
        },
        security_considerations: {
          dotnet_security: ['update-framework-version', 'security-patches'],
          dependency_security: ['package-vulnerability-scan'],
          runtime_security: ['windows-security-hardening'],
          https_configuration: ['iis-ssl-configuration']
        },
        performance_optimizations: {
          build_time: ['msbuild-parallel'],
          startup_time: ['framework-warm-up'],
          runtime_performance: ['iis-optimization'],
          memory_optimization: ['limited-options']
        },
        cloud_native_features: {
          configuration: ['web-config', 'environment-variables'],
          logging: ['event-log', 'file-logging'],
          health_checks: ['custom-implementation-needed'],
          metrics: ['performance-counters'],
          service_discovery: ['manual-configuration']
        },
        migration_recommendations: {
          framework_migration: 'upgrade-to-net8-recommended',
          modernization_opportunities: [
            'convert-to-aspnet-core',
            'modernize-authentication',
            'implement-dependency-injection',
            'add-health-checks',
            'structured-logging'
          ],
          breaking_changes: [
            'mvc-routing-changes',
            'dependency-injection-required',
            'configuration-system-changes',
            'authentication-middleware-changes'
          ]
        }
      });
      
      const analysisResult = await toolRegistry.handleToolCall({
        name: 'analyze-repository',
        arguments: { 
          repo_path: testFixturePath,
          session_id: sessionId
        }
      });
      
      const analysis = JSON.parse(analysisResult.content[0].text);
      expect(analysis.migration_recommendations).toBeDefined();
      expect(analysis.migration_recommendations.framework_migration).toContain('net8');
      expect(analysis.migration_recommendations.modernization_opportunities).toContain('convert-to-aspnet-core');
      expect(analysis.migration_recommendations.breaking_changes.length).toBeGreaterThan(0);
    });
  });
  
  describe('Project Type Detection and Optimization', () => {
    it('should optimize for different .NET project types', async () => {
      const testCases = [
        {
          fixture: 'aspnet-core-web',
          expectedFramework: 'aspnetcore',
          expectedPorts: [80, 443, 5000, 5001, 8080],
          expectedBaseImage: 'mcr.microsoft.com/dotnet/aspnet:8.0'
        },
        {
          fixture: 'dotnet-console',
          expectedFramework: 'console',
          expectedPorts: [],
          expectedBaseImage: 'mcr.microsoft.com/dotnet/runtime:8.0'
        },
        {
          fixture: 'blazor-server',
          expectedFramework: 'blazor',
          expectedPorts: [80, 443, 5000, 5001],
          expectedBaseImage: 'mcr.microsoft.com/dotnet/aspnet:8.0'
        },
        {
          fixture: 'dotnet-worker',
          expectedFramework: 'worker',
          expectedPorts: [],
          expectedBaseImage: 'mcr.microsoft.com/dotnet/runtime:8.0'
        }
      ];
      
      for (const testCase of testCases) {
        const sessionId = nanoid();
        const testFixturePath = path.join(__dirname, `../fixtures/${testCase.fixture}`);
        
        // Mock appropriate response for each project type
        mockSampler.addMockResponse('dotnet-analysis', {
          dotnet_version: '8.0',
          target_framework: 'net8.0',
          project_type: {
            primary: testCase.expectedFramework === 'aspnetcore' || testCase.expectedFramework === 'blazor' ? 'web' : 
                      testCase.expectedFramework === 'worker' ? 'service' : 'console',
            framework: testCase.expectedFramework,
            hosting_model: testCase.expectedFramework === 'aspnetcore' || testCase.expectedFramework === 'blazor' ? 'kestrel' : 'selfhost',
            modern_alternatives: []
          },
          containerization_recommendations: {
            base_image_preferences: [testCase.expectedBaseImage]
          },
          // ... other required fields with appropriate defaults
        });
        
        const analysisResult = await toolRegistry.handleToolCall({
          name: 'analyze-repository',
          arguments: { 
            repo_path: testFixturePath,
            session_id: sessionId
          }
        });
        
        const analysis = JSON.parse(analysisResult.content[0].text);
        expect(analysis.framework).toBe(testCase.expectedFramework);
        
        if (testCase.expectedPorts.length > 0) {
          expect(analysis.suggestedPorts).toEqual(expect.arrayContaining(testCase.expectedPorts));
        } else {
          expect(analysis.suggestedPorts.length).toBe(0);
        }
        
        expect(analysis.dockerConfig.baseImage).toBe(testCase.expectedBaseImage);
      }
    });
  });
  
  describe('Security Analysis', () => {
    it('should detect and handle .NET security vulnerabilities', async () => {
      const sessionId = nanoid();
      const testFixturePath = path.join(__dirname, '../fixtures/dotnet-security-issues');
      
      // Mock AI response that identifies security issues
      mockSampler.addMockResponse('dotnet-analysis', {
        dotnet_version: '8.0',
        target_framework: 'net8.0',
        project_type: {
          primary: 'web',
          framework: 'aspnetcore',
          hosting_model: 'kestrel',
          modern_alternatives: []
        },
        dependencies: {
          nuget_packages: ['Newtonsoft.Json', 'System.Text.Encodings.Web', 'Microsoft.AspNetCore.Authentication.JwtBearer'],
          security_sensitive: [
            'Newtonsoft.Json:12.0.1 - Known vulnerability CVE-2024-0057',
            'System.Text.Encodings.Web:4.7.0 - Outdated, security updates available',
            'System.IdentityModel.Tokens.Jwt:6.6.0 - Multiple security vulnerabilities'
          ],
          outdated: [
            'Newtonsoft.Json - Update to 13.0.3+',
            'System.Text.Encodings.Web - Update to 8.0.0+',
            'Microsoft.AspNetCore.Authentication.JwtBearer - Update to 8.0.0+'
          ]
        },
        security_considerations: {
          dotnet_security: [
            'update-vulnerable-packages',
            'enable-security-headers',
            'implement-proper-authentication'
          ],
          dependency_security: [
            'Newtonsoft.Json vulnerability - Deserialization attack vector',
            'JWT validation vulnerabilities - Weak token validation',
            'Encoding vulnerabilities - XSS potential'
          ],
          runtime_security: [
            'jwt-bearer-misconfiguration',
            'cors-policy-too-permissive',
            'missing-https-enforcement'
          ]
        },
        migration_recommendations: {
          framework_migration: 'already-modern',
          modernization_opportunities: [
            'replace-newtonsoft-with-system-text-json',
            'implement-proper-jwt-validation',
            'add-security-headers-middleware',
            'restrict-cors-policy'
          ],
          breaking_changes: [
            'newtonsoft-to-system-text-json-serialization-differences',
            'jwt-validation-parameter-changes'
          ]
        }
      });
      
      const analysisResult = await toolRegistry.handleToolCall({
        name: 'analyze-repository',
        arguments: { 
          repo_path: testFixturePath,
          session_id: sessionId
        }
      });
      
      const analysis = JSON.parse(analysisResult.content[0].text);
      expect(analysis.security_considerations.dependency_security).toBeDefined();
      expect(analysis.dependencies.security_sensitive.length).toBeGreaterThan(0);
      expect(analysis.dependencies.outdated.length).toBeGreaterThan(0);
      
      // Verify specific security issues are detected
      expect(analysis.security_considerations.dependency_security.join(' ')).toContain('vulnerability');
      expect(analysis.migration_recommendations.modernization_opportunities).toContain('replace-newtonsoft-with-system-text-json');
    });
    
    it('should recommend secure Docker configurations', async () => {
      const sessionId = nanoid();
      
      const dockerfileResult = await toolRegistry.handleToolCall({
        name: 'generate-dockerfile',
        arguments: { 
          session_id: sessionId,
          security_hardened: true
        }
      });
      
      const dockerfileContent = dockerfileResult.content[0].text;
      
      // Verify security best practices in Dockerfile
      expect(dockerfileContent).toMatch(/USER \w+/); // Non-root user
      expect(dockerfileContent).toMatch(/--no-cache/); // No package cache
      expect(dockerfileContent).toMatch(/(distroless|chiseled|alpine)/); // Minimal base image
      expect(dockerfileContent).toContain('HEALTHCHECK');
    });
  });

  describe('Performance Optimization', () => {
    it('should provide performance-optimized Dockerfiles', async () => {
      const sessionId = nanoid();
      const testFixturePath = path.join(__dirname, '../fixtures/aspnet-core-web');
      
      // Mock performance-focused analysis
      mockSampler.addMockResponse('base-image-resolution', {
        primary_recommendation: {
          image: 'mcr.microsoft.com/dotnet/aspnet:8.0-alpine',
          reasoning: 'Alpine-based image for smallest size and fastest startup',
          performance_notes: 'Optimized for container startup speed and minimal memory footprint'
        },
        performance_optimizations: [
          'multi-stage-build-layer-caching',
          'dependency-restoration-optimization',
          'ahead-of-time-compilation',
          'trimming-unused-code'
        ]
      });
      
      const dockerfileResult = await toolRegistry.handleToolCall({
        name: 'generate-dockerfile',
        arguments: { 
          session_id: sessionId,
          optimization_target: 'performance'
        }
      });
      
      const dockerfileContent = dockerfileResult.content[0].text;
      
      // Verify performance optimizations
      expect(dockerfileContent).toContain('AS build'); // Multi-stage build
      expect(dockerfileContent).toContain('dotnet restore'); // Separate restore step
      expect(dockerfileContent).toContain('--configuration Release'); // Release build
      expect(dockerfileContent).toContain('--no-restore'); // Skip restore in publish
      expect(dockerfileContent).toMatch(/COPY.*\.csproj/); // Copy project files first for layer caching
    });
  });

  describe('Build Error Recovery', () => {
    it('should fix common .NET build errors intelligently', async () => {
      const sessionId = nanoid();
      
      // Mock AI response for dockerfile fixing
      mockSampler.addMockResponse('dockerfile-fix', {
        root_cause_analysis: 'Missing runtime dependencies for ASP.NET Core application',
        fixed_dockerfile: `FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["Web.csproj", "."]
RUN dotnet restore "Web.csproj"
COPY . .
WORKDIR "/src"
RUN dotnet build "Web.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "Web.csproj" -c Release -o /app/publish --no-restore

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Web.dll"]`,
        changes_made: [
          {
            line_changed: '1',
            old_content: 'FROM mcr.microsoft.com/dotnet/runtime:8.0',
            new_content: 'FROM mcr.microsoft.com/dotnet/aspnet:8.0',
            reasoning: 'ASP.NET Core applications need aspnet runtime, not just dotnet runtime'
          }
        ],
        security_improvements: [
          'Using official Microsoft base images',
          'Multi-stage build reduces final image size'
        ],
        performance_optimizations: [
          'Separated restore and build steps for better layer caching',
          'Using --no-restore in publish step'
        ]
      });
      
      const fixResult = await toolRegistry.handleToolCall({
        name: 'fix-dockerfile',
        arguments: {
          session_id: sessionId,
          error_message: 'Unable to find a suitable framework version',
          dockerfile_content: 'FROM mcr.microsoft.com/dotnet/runtime:8.0\nCOPY . .\nRUN dotnet publish'
        }
      });
      
      const fix = JSON.parse(fixResult.content[0].text);
      expect(fix.root_cause_analysis).toContain('runtime dependencies');
      expect(fix.fixed_dockerfile).toContain('aspnet:8.0');
      expect(fix.changes_made.length).toBeGreaterThan(0);
    });
  });
});