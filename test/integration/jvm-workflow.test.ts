/**
 * JVM Workflow Integration Tests - Real-world validation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { nanoid } from 'nanoid'
import { UniversalRepositoryAnalyzer } from '../../src/infrastructure/ai/repository-analyzer.js'
import { InMemorySessionStore } from '../../src/infrastructure/persistence/memory-store.js'
import { SessionService } from '../../src/service/session/manager.js'
import type { Dependencies } from '../../src/service/dependencies.js'
import { ok } from '../../src/domain/types/result.js'

describe('JVM Workflow Integration', () => {
  let sessionService: SessionService
  let repositoryAnalyzer: UniversalRepositoryAnalyzer
  let dependencies: Dependencies
  let sessionId: string

  beforeEach(async () => {
    sessionId = nanoid()
    
    // Mock dependencies for testing
    const mockInMemorySessionStore = new InMemorySessionStore()
    sessionService = new SessionService(mockInMemorySessionStore)
    
    const mockMcpSampler = {
      sample: jest.fn()
    }
    
    const mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }
    
    repositoryAnalyzer = new UniversalRepositoryAnalyzer(mockMcpSampler as any, mockLogger as any)
    
    dependencies = {
      sessionService,
      repositoryAnalyzer,
      logger: mockLogger as any,
      mcpSampler: mockMcpSampler as any
    } as Dependencies
  })

  describe('Java Maven Project Analysis', () => {
    it('should complete full analysis workflow for Spring Boot project', async () => {
      const mockJavaProject = {
        fileList: [
          'pom.xml',
          'src/main/java/com/example/Application.java',
          'src/main/java/com/example/controller/UserController.java',
          'src/main/java/com/example/service/UserService.java',
          'src/main/java/com/example/repository/UserRepository.java',
          'src/main/resources/application.yml',
          'src/test/java/com/example/ApplicationTests.java'
        ],
        configFiles: {
          'pom.xml': `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
        <relativePath/>
    </parent>
    <groupId>com.example</groupId>
    <artifactId>spring-boot-demo</artifactId>
    <version>1.0.0</version>
    <properties>
        <java.version>17</java.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
    </dependencies>
</project>`,
          'application.yml': `
server:
  port: 8080
spring:
  application:
    name: spring-boot-demo
  datasource:
    url: jdbc:h2:mem:testdb
management:
  endpoints:
    web:
      exposure:
        include: health,metrics,info
`
        }
      }

      // Mock the JVM analysis response
      const mockJVMAnalysisResponse = {
        language: 'java',
        jvm_version: '17',
        framework: {
          primary: 'spring-boot',
          version: '3.2.0',
          type: 'web',
          modern_alternatives: ['quarkus', 'micronaut']
        },
        build_system: {
          type: 'maven',
          version: '3.9.0',
          optimization_opportunities: [
            'Use Maven Wrapper for consistent builds',
            'Enable parallel builds with -T option',
            'Add Jib plugin for containerization'
          ],
          containerization_plugins: ['jib-maven-plugin', 'docker-maven-plugin']
        },
        dependencies: {
          runtime: ['spring-boot-starter-web', 'spring-boot-starter-actuator', 'spring-boot-starter-data-jpa'],
          security_sensitive: ['spring-security', 'spring-boot-starter-oauth2'],
          outdated: [],
          container_relevant: ['spring-boot-actuator', 'micrometer-core']
        },
        application_characteristics: {
          startup_type: 'slow',
          memory_profile: 'medium',
          cpu_profile: 'moderate',
          io_profile: 'network',
          scaling_pattern: 'horizontal'
        },
        containerization_recommendations: {
          base_image_preferences: [
            'eclipse-temurin:17-jre-alpine',
            'eclipse-temurin:17-jre',
            'openjdk:17-jre-alpine'
          ],
          jvm_tuning: {
            heap_settings: '-Xms512m -Xmx1024m',
            gc_settings: '-XX:+UseG1GC -XX:MaxGCPauseMillis=200',
            container_awareness: '-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0'
          },
          multi_stage_strategy: 'Use multi-stage build with Maven cache optimization',
          layer_optimization: [
            'Separate dependencies layer from application code',
            'Use .dockerignore for build optimization',
            'Optimize layer order for better caching'
          ]
        },
        security_considerations: {
          jvm_security: [
            'Use non-root user in container',
            'Apply security updates to base image',
            'Enable JVM security manager if needed'
          ],
          dependency_security: [
            'Scan dependencies for known vulnerabilities',
            'Keep Spring Boot version updated',
            'Review transitive dependencies'
          ],
          runtime_security: [
            'Disable unnecessary Spring Boot actuator endpoints',
            'Use HTTPS in production',
            'Implement proper authentication and authorization'
          ]
        },
        performance_optimizations: {
          build_time: [
            'Use Maven incremental compilation',
            'Enable dependency pre-downloading',
            'Use build cache when available'
          ],
          startup_time: [
            'Enable class data sharing (CDS)',
            'Use tiered compilation optimization',
            'Consider Spring Boot native compilation'
          ],
          runtime_performance: [
            'Tune JVM heap size based on container limits',
            'Use appropriate garbage collector',
            'Profile application for hotspots'
          ]
        },
        health_monitoring: {
          health_endpoint: '/actuator/health',
          metrics_endpoints: ['/actuator/metrics', '/actuator/prometheus'],
          logging_recommendations: [
            'Use structured logging with JSON format',
            'Implement correlation IDs for tracing',
            'Configure log levels appropriately',
            'Use centralized log aggregation'
          ]
        }
      }

      // Mock the repository analyzer methods
      jest.spyOn(repositoryAnalyzer as any, 'getFileList').mockResolvedValue(mockJavaProject.fileList)
      jest.spyOn(repositoryAnalyzer as any, 'readConfigFiles').mockResolvedValue(mockJavaProject.configFiles)
      jest.spyOn(repositoryAnalyzer as any, 'getDirectoryStructure').mockResolvedValue('src/\n  main/\n    java/\n  test/\n    java/')
      jest.spyOn(repositoryAnalyzer as any, 'readBuildFiles').mockResolvedValue(`=== pom.xml ===\n${mockJavaProject.configFiles['pom.xml']}`)
      
      // Mock MCP sampler to return JVM analysis
      dependencies.mcpSampler.sample.mockResolvedValue(ok(mockJVMAnalysisResponse))

      // Execute analysis
      const result = await repositoryAnalyzer.analyze('/test/spring-boot-project')

      // Validate results
      expect(result.success).toBe(true)
      
      if (result.success) {
        const analysis = result.data
        
        // Verify language detection
        expect(analysis.language).toBe('java')
        expect(analysis.languageVersion).toBe('17')
        
        // Verify framework detection
        expect(analysis.framework).toBe('spring-boot')
        expect(analysis.frameworkVersion).toBe('3.2.0')
        
        // Verify build system detection
        expect(analysis.buildSystem?.type).toBe('maven')
        expect(analysis.buildSystem?.buildFile).toBe('pom.xml')
        expect(analysis.buildSystem?.buildCommand).toBe('mvn compile')
        expect(analysis.buildSystem?.testCommand).toBe('mvn test')
        
        // Verify dependencies
        expect(analysis.dependencies).toContain('spring-boot-starter-web')
        expect(analysis.dependencies).toContain('spring-boot-starter-actuator')
        
        // Verify port configuration
        expect(analysis.suggestedPorts).toEqual([8080])
        
        // Verify Docker configuration
        expect(analysis.dockerConfig?.baseImage).toBe('eclipse-temurin:17-jre-alpine')
        expect(analysis.dockerConfig?.multistage).toBe(true)
        expect(analysis.dockerConfig?.nonRootUser).toBe(true)
      }
    })

    it('should handle Maven multi-module projects', async () => {
      const mockMultiModuleProject = {
        fileList: [
          'pom.xml',
          'user-service/pom.xml',
          'user-service/src/main/java/com/example/user/UserApplication.java',
          'order-service/pom.xml', 
          'order-service/src/main/java/com/example/order/OrderApplication.java',
          'common/pom.xml',
          'common/src/main/java/com/example/common/Utils.java'
        ],
        configFiles: {
          'pom.xml': `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>microservices-parent</artifactId>
    <version>1.0.0</version>
    <packaging>pom</packaging>
    <modules>
        <module>user-service</module>
        <module>order-service</module>
        <module>common</module>
    </modules>
</project>`
        }
      }

      const mockAnalysisResponse = {
        language: 'java',
        jvm_version: '17',
        framework: {
          primary: 'spring-boot',
          version: '3.1.0',
          type: 'microservice',
          modern_alternatives: ['quarkus', 'micronaut']
        },
        build_system: {
          type: 'maven',
          version: '3.9.0',
          optimization_opportunities: [
            'Use Maven multi-module build optimization',
            'Implement shared dependency management',
            'Use Maven reactor for parallel builds'
          ],
          containerization_plugins: ['jib-maven-plugin']
        },
        dependencies: {
          runtime: ['spring-boot-starter-web'],
          security_sensitive: [],
          outdated: [],
          container_relevant: ['spring-boot-actuator']
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
          multi_stage_strategy: 'Multi-stage build with shared base for modules',
          layer_optimization: ['Separate common dependencies', 'Module-specific layers']
        },
        security_considerations: {
          jvm_security: [],
          dependency_security: [],
          runtime_security: []
        },
        performance_optimizations: {
          build_time: ['Parallel module compilation', 'Shared Maven repository cache'],
          startup_time: ['Service-specific optimizations'],
          runtime_performance: ['Module-specific tuning']
        },
        health_monitoring: {
          health_endpoint: '/actuator/health',
          metrics_endpoints: ['/actuator/metrics'],
          logging_recommendations: ['Centralized logging for microservices']
        }
      }

      jest.spyOn(repositoryAnalyzer as any, 'getFileList').mockResolvedValue(mockMultiModuleProject.fileList)
      jest.spyOn(repositoryAnalyzer as any, 'readConfigFiles').mockResolvedValue(mockMultiModuleProject.configFiles)
      jest.spyOn(repositoryAnalyzer as any, 'getDirectoryStructure').mockResolvedValue('user-service/\norder-service/\ncommon/')
      jest.spyOn(repositoryAnalyzer as any, 'readBuildFiles').mockResolvedValue('=== pom.xml ===\n<project>')
      
      dependencies.mcpSampler.sample.mockResolvedValue(ok(mockAnalysisResponse))

      const result = await repositoryAnalyzer.analyze('/test/multi-module-project')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.framework).toBe('spring-boot')
        expect(result.data.buildSystem?.type).toBe('maven')
      }
    })
  })

  describe('Kotlin Gradle Project Analysis', () => {
    it('should analyze Kotlin Spring Boot project with Gradle', async () => {
      const mockKotlinProject = {
        fileList: [
          'build.gradle.kts',
          'settings.gradle.kts',
          'src/main/kotlin/com/example/Application.kt',
          'src/main/kotlin/com/example/controller/UserController.kt',
          'src/main/resources/application.properties',
          'src/test/kotlin/com/example/ApplicationTests.kt'
        ],
        configFiles: {
          'build.gradle.kts': `
plugins {
    kotlin("jvm") version "1.9.0"
    kotlin("plugin.spring") version "1.9.0"
    id("org.springframework.boot") version "3.1.0"
}

java.sourceCompatibility = JavaVersion.VERSION_17

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
}
`,
          'application.properties': 'server.port=8080\nspring.application.name=kotlin-demo'
        }
      }

      const mockKotlinAnalysisResponse = {
        language: 'kotlin',
        jvm_version: '17',
        framework: {
          primary: 'spring-boot',
          version: '3.1.0',
          type: 'web',
          modern_alternatives: ['ktor', 'http4k']
        },
        build_system: {
          type: 'gradle',
          version: '8.2',
          optimization_opportunities: [
            'Enable Gradle build cache',
            'Use Gradle configuration cache',
            'Implement Kotlin incremental compilation'
          ],
          containerization_plugins: ['gradle-docker-plugin', 'palantir-docker']
        },
        dependencies: {
          runtime: ['spring-boot-starter-web', 'jackson-module-kotlin', 'kotlin-reflect'],
          security_sensitive: [],
          outdated: [],
          container_relevant: ['spring-boot-actuator']
        },
        application_characteristics: {
          startup_type: 'fast',
          memory_profile: 'medium',
          cpu_profile: 'light',
          io_profile: 'network',
          scaling_pattern: 'horizontal'
        },
        containerization_recommendations: {
          base_image_preferences: [
            'eclipse-temurin:17-jre-alpine',
            'gcr.io/distroless/java17'
          ],
          jvm_tuning: {
            heap_settings: '-Xms256m -Xmx512m',
            gc_settings: '-XX:+UseG1GC',
            container_awareness: '-XX:+UseContainerSupport -XX:MaxRAMPercentage=80.0'
          },
          multi_stage_strategy: 'Multi-stage build with Gradle cache optimization',
          layer_optimization: [
            'Separate Gradle cache layer',
            'Optimize Kotlin compilation layer',
            'Use Gradle build cache'
          ]
        },
        security_considerations: {
          jvm_security: ['Use minimal base image', 'Non-root user execution'],
          dependency_security: ['Gradle dependency verification', 'Regular updates'],
          runtime_security: ['Secure Spring Boot configuration']
        },
        performance_optimizations: {
          build_time: [
            'Gradle daemon optimization',
            'Kotlin incremental compilation',
            'Parallel execution'
          ],
          startup_time: [
            'Kotlin coroutines optimization',
            'Spring Boot lazy initialization'
          ],
          runtime_performance: ['JIT compiler warmup', 'Kotlin-specific optimizations']
        },
        health_monitoring: {
          health_endpoint: '/actuator/health',
          metrics_endpoints: ['/actuator/metrics'],
          logging_recommendations: ['kotlin-logging', 'structured JSON logs']
        }
      }

      jest.spyOn(repositoryAnalyzer as any, 'getFileList').mockResolvedValue(mockKotlinProject.fileList)
      jest.spyOn(repositoryAnalyzer as any, 'readConfigFiles').mockResolvedValue(mockKotlinProject.configFiles)
      jest.spyOn(repositoryAnalyzer as any, 'getDirectoryStructure').mockResolvedValue('src/\n  main/\n    kotlin/')
      jest.spyOn(repositoryAnalyzer as any, 'readBuildFiles').mockResolvedValue('=== build.gradle.kts ===\nplugins')
      
      dependencies.mcpSampler.sample.mockResolvedValue(ok(mockKotlinAnalysisResponse))

      const result = await repositoryAnalyzer.analyze('/test/kotlin-spring-project')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.language).toBe('kotlin')
        expect(result.data.framework).toBe('spring-boot')
        expect(result.data.buildSystem?.type).toBe('gradle')
        expect(result.data.buildSystem?.buildCommand).toBe('./gradlew build')
        expect(result.data.buildSystem?.testCommand).toBe('./gradlew test')
      }
    })
  })

  describe('Scala SBT Project Analysis', () => {
    it('should analyze Scala Akka HTTP project with SBT', async () => {
      const mockScalaProject = {
        fileList: [
          'build.sbt',
          'project/build.properties',
          'project/plugins.sbt',
          'src/main/scala/com/example/Main.scala',
          'src/main/scala/com/example/routes/UserRoutes.scala',
          'src/main/resources/application.conf',
          'src/test/scala/com/example/MainSpec.scala'
        ],
        configFiles: {
          'build.sbt': `
name := "akka-http-demo"
version := "1.0.0"
scalaVersion := "2.13.11"

val akkaVersion = "2.8.0"
val akkaHttpVersion = "10.5.0"

libraryDependencies ++= Seq(
  "com.typesafe.akka" %% "akka-actor-typed" % akkaVersion,
  "com.typesafe.akka" %% "akka-stream" % akkaVersion,
  "com.typesafe.akka" %% "akka-http" % akkaHttpVersion,
  "com.typesafe.akka" %% "akka-http-spray-json" % akkaHttpVersion,
  "ch.qos.logback" % "logback-classic" % "1.4.7"
)
`,
          'application.conf': `
akka {
  http {
    server {
      default-host-header = "localhost:8080"
    }
  }
}
`
        }
      }

      const mockScalaAnalysisResponse = {
        language: 'scala',
        jvm_version: '17',
        framework: {
          primary: 'akka-http',
          version: '10.5.0',
          type: 'web',
          modern_alternatives: ['http4s', 'play-framework', 'zio-http']
        },
        build_system: {
          type: 'sbt',
          version: '1.9.0',
          optimization_opportunities: [
            'Use SBT Native Packager for Docker builds',
            'Enable SBT server for faster builds',
            'Implement coursier for dependency resolution'
          ],
          containerization_plugins: ['sbt-docker', 'sbt-native-packager']
        },
        dependencies: {
          runtime: ['akka-actor-typed', 'akka-stream', 'akka-http', 'logback-classic'],
          security_sensitive: ['akka-http-core'],
          outdated: [],
          container_relevant: ['akka-slf4j', 'logback-classic']
        },
        application_characteristics: {
          startup_type: 'slow',
          memory_profile: 'high',
          cpu_profile: 'intensive',
          io_profile: 'network',
          scaling_pattern: 'both'
        },
        containerization_recommendations: {
          base_image_preferences: [
            'eclipse-temurin:17-jre',
            'eclipse-temurin:17-jre-alpine'
          ],
          jvm_tuning: {
            heap_settings: '-Xms1024m -Xmx2048m',
            gc_settings: '-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1MaxNewSizePercent=75',
            container_awareness: '-XX:+UseContainerSupport -XX:MaxRAMPercentage=85.0'
          },
          multi_stage_strategy: 'Multi-stage with SBT native packager and Ivy cache',
          layer_optimization: [
            'Separate Ivy cache layer',
            'Optimize Scala compilation layers',
            'Use SBT incremental compilation'
          ]
        },
        security_considerations: {
          jvm_security: [
            'Configure Akka security settings',
            'Use security manager policies',
            'Validate input in HTTP handlers'
          ],
          dependency_security: [
            'Regular Akka updates for security patches',
            'Monitor Scala ecosystem vulnerabilities'
          ],
          runtime_security: [
            'Secure Akka HTTP configuration',
            'Implement proper authentication',
            'Use HTTPS in production'
          ]
        },
        performance_optimizations: {
          build_time: [
            'SBT server daemon',
            'Coursier for faster downloads',
            'Incremental compilation'
          ],
          startup_time: [
            'Akka system optimization',
            'Class loading improvements',
            'JIT compiler warmup'
          ],
          runtime_performance: [
            'Akka dispatcher tuning',
            'Connection pool optimization',
            'GC tuning for reactive workloads'
          ]
        },
        health_monitoring: {
          health_endpoint: '/health',
          metrics_endpoints: ['/metrics', '/admin/metrics'],
          logging_recommendations: [
            'Akka structured logging',
            'Logback with JSON encoder',
            'Distributed tracing integration',
            'Actor system monitoring'
          ]
        }
      }

      jest.spyOn(repositoryAnalyzer as any, 'getFileList').mockResolvedValue(mockScalaProject.fileList)
      jest.spyOn(repositoryAnalyzer as any, 'readConfigFiles').mockResolvedValue(mockScalaProject.configFiles)
      jest.spyOn(repositoryAnalyzer as any, 'getDirectoryStructure').mockResolvedValue('src/\n  main/\n    scala/\n  test/\n    scala/')
      jest.spyOn(repositoryAnalyzer as any, 'readBuildFiles').mockResolvedValue('=== build.sbt ===\nname := "akka-http-demo"')
      
      dependencies.mcpSampler.sample.mockResolvedValue(ok(mockScalaAnalysisResponse))

      const result = await repositoryAnalyzer.analyze('/test/scala-akka-project')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.language).toBe('scala')
        expect(result.data.framework).toBe('akka-http')
        expect(result.data.buildSystem?.type).toBe('sbt')
        expect(result.data.buildSystem?.buildCommand).toBe('sbt compile')
        expect(result.data.buildSystem?.testCommand).toBe('sbt test')
        expect(result.data.dockerConfig?.multistage).toBe(true)
      }
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should gracefully handle JVM analysis failures', async () => {
      const mockFailingProject = {
        fileList: ['src/main/java/App.java', 'pom.xml'],
        configFiles: {}
      }

      jest.spyOn(repositoryAnalyzer as any, 'getFileList').mockResolvedValue(mockFailingProject.fileList)
      jest.spyOn(repositoryAnalyzer as any, 'readConfigFiles').mockResolvedValue(mockFailingProject.configFiles)
      jest.spyOn(repositoryAnalyzer as any, 'getDirectoryStructure').mockResolvedValue('src/')
      jest.spyOn(repositoryAnalyzer as any, 'readBuildFiles').mockResolvedValue('')

      // Mock JVM analysis failure and fallback success
      dependencies.mcpSampler.sample
        .mockResolvedValueOnce({ success: false, error: { message: 'JVM analysis failed' } })
        .mockResolvedValueOnce(ok({
          language: 'java',
          framework: 'unknown',
          dependencies: [],
          suggestedPorts: [8080],
          buildSystem: { type: 'maven', buildFile: 'pom.xml' }
        }))

      const result = await repositoryAnalyzer.analyze('/test/failing-project')

      expect(result.success).toBe(true)
      expect(dependencies.logger.warn).toHaveBeenCalledWith('JVM analysis failed, falling back to general analysis')
    })

    it('should handle mixed language projects appropriately', async () => {
      const mockMixedProject = {
        fileList: [
          'pom.xml',
          'src/main/java/com/example/JavaService.java',
          'src/main/kotlin/com/example/KotlinService.kt',
          'frontend/package.json',
          'frontend/src/index.js'
        ],
        configFiles: {
          'pom.xml': '<project><artifactId>mixed-project</artifactId></project>',
          'frontend/package.json': '{"name": "frontend", "dependencies": {"react": "^18.0.0"}}'
        }
      }

      const mockMixedAnalysisResponse = {
        language: 'kotlin', // AI determined Kotlin as primary JVM language
        jvm_version: '17',
        framework: {
          primary: 'spring-boot',
          version: '3.0.0',
          type: 'web',
          modern_alternatives: []
        },
        build_system: {
          type: 'maven',
          version: '3.8.0',
          optimization_opportunities: [],
          containerization_plugins: []
        },
        dependencies: {
          runtime: ['spring-boot-starter-web'],
          security_sensitive: [],
          outdated: [],
          container_relevant: []
        },
        application_characteristics: {
          startup_type: 'fast',
          memory_profile: 'medium',
          cpu_profile: 'moderate',
          io_profile: 'network',
          scaling_pattern: 'horizontal'
        },
        containerization_recommendations: {
          base_image_preferences: ['eclipse-temurin:17-jre'],
          jvm_tuning: { heap_settings: '', gc_settings: '', container_awareness: '' },
          multi_stage_strategy: 'Multi-stage with frontend build',
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

      jest.spyOn(repositoryAnalyzer as any, 'getFileList').mockResolvedValue(mockMixedProject.fileList)
      jest.spyOn(repositoryAnalyzer as any, 'readConfigFiles').mockResolvedValue(mockMixedProject.configFiles)
      jest.spyOn(repositoryAnalyzer as any, 'getDirectoryStructure').mockResolvedValue('src/\nfrontend/')
      jest.spyOn(repositoryAnalyzer as any, 'readBuildFiles').mockResolvedValue('=== pom.xml ===\n<project>')

      dependencies.mcpSampler.sample.mockResolvedValue(ok(mockMixedAnalysisResponse))

      const result = await repositoryAnalyzer.analyze('/test/mixed-project')

      expect(result.success).toBe(true)
      if (result.success) {
        // Should prioritize JVM analysis for mixed projects
        expect(result.data.language).toBe('kotlin')
        expect(result.data.buildSystem?.type).toBe('maven')
      }
    })
  })
})