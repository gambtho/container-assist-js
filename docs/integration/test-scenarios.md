# Integration Test Scenarios

## Overview

This document defines comprehensive test scenarios for the end-to-end containerization workflow, covering happy paths, error conditions, and performance requirements.

## Test Categories

### 1. Happy Path Scenarios

#### 1.1 Node.js Express Application
**Repository**: Simple Express.js REST API  
**Expected Duration**: 180-300 seconds  
**Success Criteria**: Complete deployment with health checks passing

**Test Steps**:
1. Repository analysis detects Node.js/Express
2. Dockerfile sampling generates 3+ candidates
3. Winner selection chooses multi-stage build
4. Build completes successfully
5. Security scan shows < 5 medium vulnerabilities
6. K8s manifests include service + deployment
7. Deployment succeeds with readiness probes
8. Verification confirms API endpoints respond

**Expected Artifacts**:
- Analysis summary with Node.js detection
- 3 Dockerfile candidates with scores
- Built image < 200MB
- K8s manifests with appropriate resource limits
- Health check endpoints

#### 1.2 Python FastAPI Application  
**Repository**: Python FastAPI with requirements.txt  
**Expected Duration**: 240-360 seconds  
**Success Criteria**: Complete deployment with auto-scaling configured

**Test Steps**:
1. Analysis detects Python/FastAPI with pip dependencies
2. Dockerfile candidates include multi-stage builds
3. Winner uses official Python slim base image
4. Build includes proper dependency caching
5. Security scan handles Python-specific vulnerabilities
6. K8s manifests include HPA configuration
7. Deployment with rolling update strategy
8. Verification includes API documentation endpoint

#### 1.3 Java Spring Boot Application
**Repository**: Maven-based Spring Boot app  
**Expected Duration**: 300-450 seconds  
**Success Criteria**: JVM-optimized deployment

**Test Steps**:
1. Analysis detects Java/Maven/Spring Boot
2. Dockerfile candidates optimize JVM settings
3. Build uses multi-stage with Maven cache
4. Security scan identifies Java-specific issues
5. Remediation updates base image and dependencies
6. K8s manifests include appropriate JVM memory limits
7. Deployment with proper startup/liveness probes
8. Verification confirms actuator endpoints

### 2. Error Handling Scenarios

#### 2.1 Build Failure Recovery
**Repository**: Node.js app with syntax errors in package.json  
**Expected Behavior**: Graceful failure with helpful error message

**Test Steps**:
1. Analysis completes successfully
2. Dockerfile generation succeeds
3. Build fails due to malformed package.json
4. Error recovery suggests manual fix
5. User corrects package.json
6. Workflow resumes from build stage
7. Subsequent steps complete successfully

#### 2.2 Critical Vulnerability Handling
**Repository**: Application with known critical vulnerabilities  
**Expected Behavior**: Automatic remediation with rebuild

**Test Steps**:
1. Initial build and scan detect critical vulnerabilities
2. Automatic remediation triggered
3. Remediation generates updated Dockerfile
4. Rebuild with updated dependencies
5. Rescan shows vulnerability reduction
6. Workflow continues if vulnerabilities below threshold
7. Or fails with detailed remediation report

#### 2.3 Deployment Failure with Rollback
**Repository**: Application with invalid K8s resource requirements  
**Expected Behavior**: Rollback to previous version or fail cleanly

**Test Steps**:
1. All stages complete through K8s generation
2. Deployment fails due to resource constraints
3. Automatic rollback attempted
4. Alternative K8s manifest candidate tried
5. If still failing, clean failure with diagnostic info
6. Session artifacts preserved for debugging

#### 2.4 Network/Service Failures
**Repository**: Any standard application  
**Expected Behavior**: Retry logic and graceful degradation

**Test Scenarios**:
- Docker registry temporarily unavailable
- Security scanner service down
- Kubernetes API server timeout
- Resource cleanup on partial failures

### 3. Performance Test Scenarios

#### 3.1 Concurrent Workflow Execution
**Test**: 10 parallel workflows with different repository types  
**Success Criteria**: All complete within 600 seconds, no resource conflicts

**Metrics**:
- Total execution time < 600s
- Memory usage < 2GB total
- No failed workflows due to resource contention
- Build cache effectiveness

#### 3.2 Large Repository Handling
**Repository**: Monorepo with 1000+ files, 100MB+ size  
**Success Criteria**: Analysis completes within limits

**Test Points**:
- Repository analysis < 60 seconds
- Resource URI system handles large artifacts
- Memory usage stays bounded
- Artifact cleanup works correctly

#### 3.3 Sampling Performance
**Test**: Dockerfile generation with maximum candidates (10)  
**Success Criteria**: Generation within time limits

**Metrics**:
- Candidate generation < 45 seconds
- Scoring time < 5 seconds per candidate
- Memory usage linear with candidate count
- Deterministic scoring consistency

### 4. Edge Case Scenarios

#### 4.1 Multi-Service Repository
**Repository**: Monorepo with multiple deployable services  
**Expected Behavior**: User choice for service to containerize

**Test Steps**:
1. Analysis detects multiple services
2. User presented with service selection
3. Workflow proceeds for selected service
4. Artifacts properly namespaced by service

#### 4.2 Dockerfile Already Present
**Repository**: Project with existing Dockerfile  
**Expected Behavior**: Option to use existing or generate new

**Test Flow**:
1. Analysis detects existing Dockerfile
2. User choice: use existing, improve existing, or generate new
3. If generate new: sampling proceeds normally
4. If use existing: validation and direct build
5. If improve: existing used as base for sampling

#### 4.3 No Standard Framework Detected
**Repository**: Custom build system or unknown framework  
**Expected Behavior**: Generic containerization with user guidance

**Test Steps**:
1. Analysis reports "generic" application type
2. User prompted for runtime hints
3. Basic Dockerfile template sampling
4. Extra validation steps required
5. User confirmation at each major step

#### 4.4 Security Policy Conflicts
**Repository**: Application requiring capabilities that violate policy  
**Expected Behavior**: Clear policy violation reporting

**Test Flow**:
1. K8s manifest generation includes privileged requirements
2. Security policy validation fails
3. Clear explanation of policy violations
4. Suggested alternatives or policy override options
5. Workflow stops with actionable guidance

### 5. Integration Test Matrix

#### 5.1 Repository Types
| Type | Framework | Package Manager | Expected Time | Success Rate |
|------|-----------|----------------|---------------|--------------|
| Node.js | Express | npm | 180-300s | >95% |
| Node.js | NestJS | npm | 200-320s | >90% |
| Python | Django | pip | 240-360s | >90% |
| Python | FastAPI | poetry | 220-340s | >90% |
| Java | Spring Boot | Maven | 300-450s | >85% |
| Java | Spring Boot | Gradle | 320-470s | >85% |
| Go | Gin | go mod | 120-200s | >95% |
| .NET | ASP.NET Core | dotnet | 180-280s | >90% |

#### 5.2 Deployment Targets
| Environment | Features | Expected Behavior |
|------------|----------|------------------|
| Development | Basic deployment | Fast deployment, minimal resources |
| Staging | Full monitoring | Production-like with debugging |
| Production | Security hardening | Full compliance, monitoring, scaling |

#### 5.3 Failure Injection Tests
| Failure Type | Injection Point | Expected Recovery |
|--------------|----------------|-------------------|
| Network timeout | Build stage | Retry with exponential backoff |
| Memory limit | Large repository | Graceful degradation |
| Disk space | Build artifacts | Cleanup and retry |
| Permission denied | K8s deployment | Clear error message |

## Test Data Management

### Test Repositories
```
test/fixtures/test-repositories/
├── node-express-basic/          # Simple Express API
├── node-express-complex/        # Multi-service Express
├── python-fastapi-basic/        # Simple FastAPI
├── python-django-complex/       # Django with migrations
├── java-spring-boot/            # Standard Spring Boot
├── go-gin-basic/                # Simple Go API
├── dotnet-webapi/               # .NET Web API
├── multi-service-monorepo/      # Multiple services
├── dockerfile-existing/         # Has existing Dockerfile
├── vulnerable-dependencies/     # Known vulnerabilities
├── large-repository/            # Size/complexity test
├── custom-build-system/         # Non-standard build
├── malformed-configs/           # Invalid configurations
└── policy-violations/           # Security policy conflicts
```

### Expected Outputs
```
test/fixtures/expected-outputs/
├── analysis-results/            # Expected analysis outputs
├── dockerfile-candidates/       # Expected Dockerfile samples
├── k8s-manifests/              # Expected K8s outputs
├── vulnerability-reports/       # Expected scan results
└── performance-baselines/       # Performance benchmarks
```

## Test Execution Framework

### Test Runner Configuration
```typescript
interface TestScenario {
  name: string;
  repository: string;
  config: WorkflowConfig;
  expectations: {
    duration: { min: number; max: number };
    successRate: number;
    artifacts: string[];
    metrics: Record<string, number>;
  };
  cleanup: boolean;
}
```

### Automated Validation
- **Performance regression detection**: Compare against baselines
- **Artifact validation**: Verify all expected outputs produced
- **Success rate monitoring**: Track workflow success rates
- **Error categorization**: Classify and trend error types

### Manual Testing Procedures
- **User experience validation**: Manual workflow execution
- **Documentation accuracy**: Verify docs match actual behavior
- **Error message clarity**: Assess user-friendliness
- **Performance perception**: Subjective speed assessment

## CI/CD Integration

### Automated Test Execution
```yaml
# Weekly full test suite
schedule:
  - cron: "0 2 * * 1"  # Monday 2 AM

# On pull request  
on:
  pull_request:
    paths:
      - 'src/workflows/**'
      - 'src/application/tools/**'
```

### Performance Monitoring
- Baseline comparison for each test scenario
- Alert on >10% performance regression
- Track success rate trends
- Monitor resource utilization patterns

### Test Result Reporting
- Detailed failure analysis
- Performance trend charts
- Coverage gap identification
- Success rate dashboard