/**
 * JVM Analysis Tests - Comprehensive testing for Java/Kotlin/Scala projects
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { UniversalRepositoryAnalyzer, JVMAnalysis, RepositoryAnalysis } from '../../../../src/infrastructure/ai/repository-analyzer.js'
import { ok, fail } from '../../../../src/domain/types/result.js'
import type { Logger } from 'winston'
import type { MCPSampler } from '../../../../src/infrastructure/ai/types.js'

describe('JVM Analysis', () => {
  let analyzer: UniversalRepositoryAnalyzer
  let mockMcpSampler: jest.Mocked<MCPSampler>
  let mockLogger: jest.Mocked<Logger>

  beforeEach(() => {
    mockMcpSampler = {
      sample: jest.fn()
    } as jest.Mocked<MCPSampler>
    
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as jest.Mocked<Logger>
    
    analyzer = new UniversalRepositoryAnalyzer(mockMcpSampler, mockLogger)
  })

  describe('JVM Project Detection', () => {
    it('should detect Java Maven project', async () => {
      const fileList = [
        'src/main/java/com/example/App.java',
        'pom.xml',
        'src/test/java/com/example/AppTest.java'
      ]

      jest.spyOn(analyzer as any, 'getFileList').mockResolvedValue(fileList)
      jest.spyOn(analyzer as any, 'readConfigFiles').mockResolvedValue({
        'pom.xml': '<project><artifactId>test-app</artifactId></project>'
      })
      jest.spyOn(analyzer as any, 'getDirectoryStructure').mockResolvedValue('src/\n  main/\n    java/')
      jest.spyOn(analyzer as any, 'readBuildFiles').mockResolvedValue('=== pom.xml ===\n<project>')

      const mockJVMAnalysis: JVMAnalysis = {
        language: 'java',
        jvm_version: '17',
        framework: {
          primary: 'spring-boot',
          version: '3.0.0',
          type: 'web',
          modern_alternatives: ['quarkus', 'micronaut']
        },
        build_system: {
          type: 'maven',
          version: '3.8.6',
          optimization_opportunities: ['use maven wrapper'],
          containerization_plugins: ['jib-maven-plugin']
        },
        dependencies: {
          runtime: ['spring-boot-starter-web'],
          security_sensitive: ['spring-security'],
          outdated: [],
          container_relevant: ['spring-boot-actuator']
        },
        application_characteristics: {
          startup_type: 'slow',
          memory_profile: 'medium',
          cpu_profile: 'moderate',
          io_profile: 'network',
          scaling_pattern: 'horizontal'
        },
        containerization_recommendations: {
          base_image_preferences: ['eclipse-temurin:17-jre-alpine'],
          jvm_tuning: {
            heap_settings: '-Xms512m -Xmx1024m',
            gc_settings: '-XX:+UseG1GC',
            container_awareness: '-XX:+UseContainerSupport'
          },
          multi_stage_strategy: 'Use multi-stage build for smaller images',
          layer_optimization: ['separate dependencies layer', 'use .dockerignore']
        },
        security_considerations: {
          jvm_security: ['use non-root user', 'minimal base image'],
          dependency_security: ['scan dependencies for vulnerabilities'],
          runtime_security: ['disable unnecessary services']
        },
        performance_optimizations: {
          build_time: ['parallel builds', 'dependency caching'],
          startup_time: ['class data sharing', 'tiered compilation'],
          runtime_performance: ['profile-guided optimization']
        },
        health_monitoring: {
          health_endpoint: '/actuator/health',
          metrics_endpoints: ['/actuator/metrics', '/actuator/prometheus'],
          logging_recommendations: ['structured logging', 'log aggregation']
        }
      }

      mockMcpSampler.sample.mockResolvedValue(ok(mockJVMAnalysis))

      const result = await analyzer.analyze('/test/repo')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.language).toBe('java')
        expect(result.data.framework).toBe('spring-boot')
        expect(result.data.buildSystem?.type).toBe('maven')
        expect(result.data.suggestedPorts).toEqual([8080])
        expect(result.data.dockerConfig?.multistage).toBe(true)
      }
    })

    it('should detect Kotlin Gradle project', async () => {
      const fileList = [
        'src/main/kotlin/com/example/App.kt',
        'build.gradle.kts',
        'settings.gradle.kts'
      ]

      jest.spyOn(analyzer as any, 'getFileList').mockResolvedValue(fileList)
      jest.spyOn(analyzer as any, 'readConfigFiles').mockResolvedValue({
        'build.gradle.kts': 'plugins { kotlin("jvm") }'
      })
      jest.spyOn(analyzer as any, 'getDirectoryStructure').mockResolvedValue('src/\n  main/\n    kotlin/')
      jest.spyOn(analyzer as any, 'readBuildFiles').mockResolvedValue('=== build.gradle.kts ===\nplugins')

      const mockJVMAnalysis: JVMAnalysis = {
        language: 'kotlin',
        jvm_version: '17',
        framework: {
          primary: 'ktor',
          version: '2.3.0',
          type: 'microservice',
          modern_alternatives: ['spring-boot-kotlin']
        },
        build_system: {
          type: 'gradle',
          version: '8.0',
          optimization_opportunities: ['gradle build cache'],
          containerization_plugins: ['gradle-docker-plugin']
        },
        dependencies: {
          runtime: ['ktor-server-core'],
          security_sensitive: ['ktor-auth'],
          outdated: [],
          container_relevant: ['ktor-server-netty']
        },
        application_characteristics: {
          startup_type: 'fast',
          memory_profile: 'low',
          cpu_profile: 'light',
          io_profile: 'network',
          scaling_pattern: 'horizontal'
        },
        containerization_recommendations: {
          base_image_preferences: ['eclipse-temurin:17-jre-alpine'],
          jvm_tuning: {
            heap_settings: '-Xms256m -Xmx512m',
            gc_settings: '-XX:+UseG1GC',
            container_awareness: '-XX:+UseContainerSupport'
          },
          multi_stage_strategy: 'Use multi-stage build with Gradle cache',
          layer_optimization: ['separate gradle cache', 'optimize layer ordering']
        },
        security_considerations: {
          jvm_security: ['security manager', 'minimal permissions'],
          dependency_security: ['gradle dependency verification'],
          runtime_security: ['secure defaults']
        },
        performance_optimizations: {
          build_time: ['gradle daemon', 'build cache'],
          startup_time: ['kotlin coroutines optimization'],
          runtime_performance: ['JIT warmup']
        },
        health_monitoring: {
          health_endpoint: '/health',
          metrics_endpoints: ['/metrics'],
          logging_recommendations: ['kotlin-logging', 'structured logs']
        }
      }

      mockMcpSampler.sample.mockResolvedValue(ok(mockJVMAnalysis))

      const result = await analyzer.analyze('/test/repo')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.language).toBe('kotlin')
        expect(result.data.framework).toBe('ktor')
        expect(result.data.buildSystem?.type).toBe('gradle')
        expect(result.data.buildSystem?.buildCommand).toBe('./gradlew build')
      }
    })

    it('should detect Scala SBT project', async () => {
      const fileList = [
        'src/main/scala/com/example/App.scala',
        'build.sbt',
        'project/build.properties'
      ]

      jest.spyOn(analyzer as any, 'getFileList').mockResolvedValue(fileList)
      jest.spyOn(analyzer as any, 'readConfigFiles').mockResolvedValue({
        'build.sbt': 'name := "test-app"'
      })
      jest.spyOn(analyzer as any, 'getDirectoryStructure').mockResolvedValue('src/\n  main/\n    scala/')
      jest.spyOn(analyzer as any, 'readBuildFiles').mockResolvedValue('=== build.sbt ===\nname := "test-app"')

      const mockJVMAnalysis: JVMAnalysis = {
        language: 'scala',
        jvm_version: '17',
        framework: {
          primary: 'akka-http',
          version: '10.5.0',
          type: 'web',
          modern_alternatives: ['http4s', 'play']
        },
        build_system: {
          type: 'sbt',
          version: '1.8.2',
          optimization_opportunities: ['sbt native packager'],
          containerization_plugins: ['sbt-docker']
        },
        dependencies: {
          runtime: ['akka-http', 'akka-stream'],
          security_sensitive: ['akka-http-cors'],
          outdated: [],
          container_relevant: ['akka-slf4j']
        },
        application_characteristics: {
          startup_type: 'slow',
          memory_profile: 'high',
          cpu_profile: 'intensive',
          io_profile: 'network',
          scaling_pattern: 'both'
        },
        containerization_recommendations: {
          base_image_preferences: ['eclipse-temurin:17-jre'],
          jvm_tuning: {
            heap_settings: '-Xms1024m -Xmx2048m',
            gc_settings: '-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions',
            container_awareness: '-XX:+UseContainerSupport'
          },
          multi_stage_strategy: 'Multi-stage with SBT native packager',
          layer_optimization: ['ivy cache layer', 'compiled classes layer']
        },
        security_considerations: {
          jvm_security: ['security policy', 'signed jars'],
          dependency_security: ['dependency check plugin'],
          runtime_security: ['actor system security']
        },
        performance_optimizations: {
          build_time: ['sbt server', 'coursier resolver'],
          startup_time: ['class loading optimization'],
          runtime_performance: ['actor dispatcher tuning']
        },
        health_monitoring: {
          health_endpoint: '/health',
          metrics_endpoints: ['/metrics', '/admin/metrics'],
          logging_recommendations: ['akka-slf4j', 'logback structured']
        }
      }

      mockMcpSampler.sample.mockResolvedValue(ok(mockJVMAnalysis))

      const result = await analyzer.analyze('/test/repo')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.language).toBe('scala')
        expect(result.data.framework).toBe('akka-http')
        expect(result.data.buildSystem?.type).toBe('sbt')
        expect(result.data.buildSystem?.testCommand).toBe('sbt test')
      }
    })

    it('should fall back to general analysis when JVM analysis fails', async () => {
      const fileList = [
        'src/main/java/com/example/App.java',
        'pom.xml'
      ]

      jest.spyOn(analyzer as any, 'getFileList').mockResolvedValue(fileList)
      jest.spyOn(analyzer as any, 'readConfigFiles').mockResolvedValue({})
      jest.spyOn(analyzer as any, 'getDirectoryStructure').mockResolvedValue('src/')
      jest.spyOn(analyzer as any, 'readBuildFiles').mockResolvedValue('')

      // Mock JVM analysis failure
      mockMcpSampler.sample
        .mockResolvedValueOnce(fail('JVM analysis failed'))
        .mockResolvedValueOnce(ok({
          language: 'java',
          framework: 'spring',
          dependencies: ['spring-core'],
          suggestedPorts: [8080]
        }))

      const result = await analyzer.analyze('/test/repo')

      expect(result.success).toBe(true)
      expect(mockLogger.warn).toHaveBeenCalledWith('JVM analysis failed, falling back to general analysis')
    })
  })

  describe('JVM Helper Methods', () => {
    it('should detect JVM project from file list', () => {
      const analyzer = new UniversalRepositoryAnalyzer(mockMcpSampler, mockLogger)
      const detectJVMProject = (analyzer as any).detectJVMProject.bind(analyzer)

      expect(detectJVMProject(['src/main/java/App.java'])).toBe(true)
      expect(detectJVMProject(['src/main/kotlin/App.kt'])).toBe(true)
      expect(detectJVMProject(['src/main/scala/App.scala'])).toBe(true)
      expect(detectJVMProject(['pom.xml'])).toBe(true)
      expect(detectJVMProject(['build.gradle'])).toBe(true)
      expect(detectJVMProject(['build.sbt'])).toBe(true)
      expect(detectJVMProject(['package.json', 'index.js'])).toBe(false)
    })

    it('should get correct build file for build system type', () => {
      const analyzer = new UniversalRepositoryAnalyzer(mockMcpSampler, mockLogger)
      const getBuildFileForType = (analyzer as any).getBuildFileForType.bind(analyzer)

      expect(getBuildFileForType('maven')).toBe('pom.xml')
      expect(getBuildFileForType('gradle')).toBe('build.gradle')
      expect(getBuildFileForType('sbt')).toBe('build.sbt')
      expect(getBuildFileForType('unknown')).toBe('build file')
    })

    it('should get correct build commands for build system type', () => {
      const analyzer = new UniversalRepositoryAnalyzer(mockMcpSampler, mockLogger)
      const getBuildCommandForType = (analyzer as any).getBuildCommandForType.bind(analyzer)
      const getTestCommandForType = (analyzer as any).getTestCommandForType.bind(analyzer)

      expect(getBuildCommandForType('maven')).toBe('mvn compile')
      expect(getBuildCommandForType('gradle')).toBe('./gradlew build')
      expect(getBuildCommandForType('sbt')).toBe('sbt compile')

      expect(getTestCommandForType('maven')).toBe('mvn test')
      expect(getTestCommandForType('gradle')).toBe('./gradlew test')
      expect(getTestCommandForType('sbt')).toBe('sbt test')
    })

    it('should get correct ports for JVM frameworks', () => {
      const analyzer = new UniversalRepositoryAnalyzer(mockMcpSampler, mockLogger)
      const getJVMPortsForFramework = (analyzer as any).getJVMPortsForFramework.bind(analyzer)

      expect(getJVMPortsForFramework('spring-boot')).toEqual([8080])
      expect(getJVMPortsForFramework('play')).toEqual([9000])
      expect(getJVMPortsForFramework('dropwizard')).toEqual([8080, 8081])
      expect(getJVMPortsForFramework('spark')).toEqual([4567])
      expect(getJVMPortsForFramework('unknown-framework')).toEqual([8080])
    })
  })

  describe('JVM Analysis Conversion', () => {
    it('should correctly convert JVM analysis to repository analysis', () => {
      const analyzer = new UniversalRepositoryAnalyzer(mockMcpSampler, mockLogger)
      const convertJVMToRepositoryAnalysis = (analyzer as any).convertJVMToRepositoryAnalysis.bind(analyzer)

      const jvmAnalysis: JVMAnalysis = {
        language: 'java',
        jvm_version: '17',
        framework: {
          primary: 'spring-boot',
          version: '3.0.0',
          type: 'web',
          modern_alternatives: []
        },
        build_system: {
          type: 'maven',
          version: '3.8.6',
          optimization_opportunities: [],
          containerization_plugins: []
        },
        dependencies: {
          runtime: ['spring-boot-starter-web'],
          security_sensitive: ['spring-security'],
          outdated: [],
          container_relevant: ['actuator']
        },
        application_characteristics: {
          startup_type: 'slow',
          memory_profile: 'medium',
          cpu_profile: 'moderate',
          io_profile: 'network',
          scaling_pattern: 'horizontal'
        },
        containerization_recommendations: {
          base_image_preferences: ['eclipse-temurin:17-jre-alpine'],
          jvm_tuning: {
            heap_settings: '-Xms512m -Xmx1024m',
            gc_settings: '-XX:+UseG1GC',
            container_awareness: '-XX:+UseContainerSupport'
          },
          multi_stage_strategy: 'Use multi-stage build',
          layer_optimization: []
        },
        security_considerations: {
          jvm_security: [],
          dependency_security: [],
          runtime_security: []
        },
        performance_optimizations: {
          build_time: [],
          startup_time: [],
          runtime_performance: []
        },
        health_monitoring: {
          health_endpoint: '/actuator/health',
          metrics_endpoints: [],
          logging_recommendations: []
        }
      }

      const result: RepositoryAnalysis = convertJVMToRepositoryAnalysis(jvmAnalysis)

      expect(result.language).toBe('java')
      expect(result.languageVersion).toBe('17')
      expect(result.framework).toBe('spring-boot')
      expect(result.frameworkVersion).toBe('3.0.0')
      expect(result.buildSystem?.type).toBe('maven')
      expect(result.buildSystem?.buildFile).toBe('pom.xml')
      expect(result.buildSystem?.buildCommand).toBe('mvn compile')
      expect(result.buildSystem?.testCommand).toBe('mvn test')
      expect(result.dependencies).toEqual(['spring-boot-starter-web'])
      expect(result.devDependencies).toEqual(['spring-security', 'actuator'])
      expect(result.suggestedPorts).toEqual([8080])
      expect(result.dockerConfig?.baseImage).toBe('eclipse-temurin:17-jre-alpine')
      expect(result.dockerConfig?.multistage).toBe(true)
      expect(result.dockerConfig?.nonRootUser).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle mixed JVM languages in same project', async () => {
      const fileList = [
        'src/main/java/com/example/JavaClass.java',
        'src/main/kotlin/com/example/KotlinClass.kt',
        'build.gradle.kts'
      ]

      jest.spyOn(analyzer as any, 'getFileList').mockResolvedValue(fileList)
      jest.spyOn(analyzer as any, 'readConfigFiles').mockResolvedValue({})
      jest.spyOn(analyzer as any, 'getDirectoryStructure').mockResolvedValue('src/')
      jest.spyOn(analyzer as any, 'readBuildFiles').mockResolvedValue('build.gradle.kts content')

      const mockJVMAnalysis: JVMAnalysis = {
        language: 'kotlin', // AI should determine primary language
        jvm_version: '17',
        framework: { primary: 'spring-boot', version: '3.0.0', type: 'web', modern_alternatives: [] },
        build_system: { type: 'gradle', version: '8.0', optimization_opportunities: [], containerization_plugins: [] },
        dependencies: { runtime: [], security_sensitive: [], outdated: [], container_relevant: [] },
        application_characteristics: { startup_type: 'fast', memory_profile: 'low', cpu_profile: 'light', io_profile: 'network', scaling_pattern: 'horizontal' },
        containerization_recommendations: { base_image_preferences: ['eclipse-temurin:17-jre'], jvm_tuning: { heap_settings: '', gc_settings: '', container_awareness: '' }, multi_stage_strategy: '', layer_optimization: [] },
        security_considerations: { jvm_security: [], dependency_security: [], runtime_security: [] },
        performance_optimizations: { build_time: [], startup_time: [], runtime_performance: [] },
        health_monitoring: { health_endpoint: '/health', metrics_endpoints: [], logging_recommendations: [] }
      }

      mockMcpSampler.sample.mockResolvedValue(ok(mockJVMAnalysis))

      const result = await analyzer.analyze('/test/repo')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.language).toBe('kotlin')
        expect(result.data.buildSystem?.type).toBe('gradle')
      }
    })

    it('should handle missing build files gracefully', async () => {
      const fileList = ['src/main/java/App.java']

      jest.spyOn(analyzer as any, 'getFileList').mockResolvedValue(fileList)
      jest.spyOn(analyzer as any, 'readConfigFiles').mockResolvedValue({})
      jest.spyOn(analyzer as any, 'getDirectoryStructure').mockResolvedValue('src/')
      jest.spyOn(analyzer as any, 'readBuildFiles').mockResolvedValue('')

      const mockJVMAnalysis: JVMAnalysis = {
        language: 'java',
        jvm_version: '17',
        framework: { primary: 'unknown', version: 'unknown', type: 'library', modern_alternatives: [] },
        build_system: { type: 'maven', version: 'unknown', optimization_opportunities: ['add build automation'], containerization_plugins: [] },
        dependencies: { runtime: [], security_sensitive: [], outdated: [], container_relevant: [] },
        application_characteristics: { startup_type: 'fast', memory_profile: 'low', cpu_profile: 'light', io_profile: 'minimal', scaling_pattern: 'vertical' },
        containerization_recommendations: { base_image_preferences: ['openjdk:17-jre-alpine'], jvm_tuning: { heap_settings: '', gc_settings: '', container_awareness: '' }, multi_stage_strategy: 'simple single stage', layer_optimization: [] },
        security_considerations: { jvm_security: [], dependency_security: [], runtime_security: [] },
        performance_optimizations: { build_time: [], startup_time: [], runtime_performance: [] },
        health_monitoring: { health_endpoint: '/health', metrics_endpoints: [], logging_recommendations: [] }
      }

      mockMcpSampler.sample.mockResolvedValue(ok(mockJVMAnalysis))

      const result = await analyzer.analyze('/test/repo')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.language).toBe('java')
        expect(result.data.framework).toBe('unknown')
      }
    })
  })
})