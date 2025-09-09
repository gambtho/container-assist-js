# Prompt Registry Audit Report

## Analysis Summary
- **Registry File:** `src/prompts/prompt-registry.ts`
- **File Size:** 1087 lines of code
- **Discovery Date:** 2025-09-09

## Prompt Inventory

Based on manual analysis of the prompt registry, the following main prompts have been identified:

### 1. **dockerfile-generation**
- **Category:** containerization
- **Description:** Generate an optimized Dockerfile for the given application
- **Parameters:** language (required), framework, securityLevel, baseImage
- **Dynamic Args:** dependencies, optimizations
- **Template Size:** Medium (~15 lines)

### 2. **k8s-manifest-generation** 
- **Category:** orchestration
- **Description:** Generate Kubernetes deployment manifests with best practices
- **Parameters:** appName (required), replicas, environment, resourceLimits
- **Dynamic Args:** highAvailability, securityContext
- **Template Size:** Medium (~20 lines)

### 3. **security-analysis**
- **Category:** security
- **Description:** Analyze container configuration for security vulnerabilities
- **Parameters:** configType (required), content, complianceStandard
- **Dynamic Args:** productionChecks
- **Template Size:** Medium (~15 lines)

### 4. **strategy-optimization**
- **Category:** sampling
- **Description:** Generate strategy-specific optimization prompts for sampling
- **Parameters:** strategy (required), context (required)
- **Template Size:** Small (~10 lines)

### 5. **parameter-validation**
- **Category:** validation
- **Description:** Validate tool parameters with AI assistance
- **Parameters:** toolName (required), parameters (required), context, validationRules
- **Dynamic Args:** languageSpecific, productionChecks
- **Template Size:** Large (~20 lines)

### 6. **parameter-suggestions**
- **Category:** validation
- **Description:** Generate parameter suggestions with AI assistance
- **Parameters:** toolName (required), partialParameters (required), context, existingParams
- **Dynamic Args:** targetSpecific, frameworkOptimized
- **Template Size:** Large (~20 lines)

### 7. **dockerfile-sampling**
- **Category:** sampling
- **Description:** Generate Dockerfile variants for sampling
- **Parameters:** strategy (required), language (required), context
- **Template Size:** Small (~10 lines)

### 8. **generate-dockerfile**
- **Category:** containerization
- **Description:** Generate a Dockerfile for a project based on analysis
- **Parameters:** language (required), repoSummary (required), framework, ports, baseImage, requirements
- **Template Size:** Large (~25 lines)

### 9. **fix-dockerfile**
- **Category:** containerization
- **Description:** Fix issues in an existing Dockerfile based on analysis and error context
- **Parameters:** dockerfileContent (required), errors, buildError, language, framework, analysis
- **Template Size:** Large (~25 lines)

### 10. **generate-k8s-manifests**
- **Category:** orchestration
- **Description:** Generate Kubernetes manifests for containerized applications
- **Parameters:** appName (required), imageId (required), namespace, replicas, ports, environment, manifestTypes, resources, repoAnalysis, securityLevel, highAvailability
- **Template Size:** Very Large (~80 lines)

### 11. **enhance-repo-analysis**
- **Category:** analysis
- **Description:** Enhance repository analysis with AI insights and recommendations
- **Parameters:** language (required), framework, buildSystem, dependencies, hasTests, hasDocker, ports, fileCount, repoStructure
- **Template Size:** Large (~25 lines)

## Category Breakdown

| Category | Count | Prompts |
|----------|-------|---------|
| containerization | 3 | dockerfile-generation, generate-dockerfile, fix-dockerfile |
| orchestration | 2 | k8s-manifest-generation, generate-k8s-manifests |
| validation | 2 | parameter-validation, parameter-suggestions |
| sampling | 2 | strategy-optimization, dockerfile-sampling |
| security | 1 | security-analysis |
| analysis | 1 | enhance-repo-analysis |
| **Total** | **11** | |

## Parameter Pattern Analysis

### Common Parameters (appearing in 3+ prompts):
- **language** (7 prompts): Programming language identification
- **framework** (5 prompts): Framework detection/specification
- **environment** (3 prompts): Target environment (dev/staging/prod)
- **context** (3 prompts): General context information

### Required vs Optional Parameters:
- **Always Required:** language, toolName, appName, imageId, configType, strategy
- **Often Optional:** framework, environment, ports, dependencies
- **Context-Dependent:** Most validation and analysis parameters

## Duplicate/Similar Prompt Analysis

### Potential Consolidations:
1. **dockerfile-generation** vs **generate-dockerfile**: Very similar functionality, different parameter sets
2. **k8s-manifest-generation** vs **generate-k8s-manifests**: Similar but generate-k8s-manifests is more comprehensive
3. **parameter-validation** vs **parameter-suggestions**: Related validation functions, could be unified

### Template Complexity Distribution:
- **Small (5-10 lines):** 2 prompts
- **Medium (10-20 lines):** 4 prompts  
- **Large (20-30 lines):** 4 prompts
- **Very Large (50+ lines):** 1 prompt

## Current Registry Structure

### Positive Aspects:
- Well-organized with clear categories
- Comprehensive parameter definitions
- Support for dynamic arguments
- Template-based rendering system

### Areas for Improvement:
- **File Size:** 1087 lines is very large for maintenance
- **Inline Templates:** All templates are embedded in code
- **Duplication:** Some prompts have overlapping functionality
- **Complexity:** Complex template rendering with conditionals

## Externalization Potential

### High Priority for Externalization:
1. **generate-k8s-manifests** (80+ lines template)
2. **fix-dockerfile** (25+ lines template)
3. **enhance-repo-analysis** (25+ lines template)
4. **generate-dockerfile** (25+ lines template)

### Medium Priority:
5. **parameter-validation** (20+ lines template)
6. **parameter-suggestions** (20+ lines template)

### Low Priority (keep inline):
7. **dockerfile-sampling** (small, frequently accessed)
8. **strategy-optimization** (small, performance critical)

## Recommendations

1. **External Format:** Use YAML for human readability
2. **Directory Structure:** Organize by category (containerization/, orchestration/, etc.)
3. **Template Simplification:** Replace complex conditionals with simple mustache-style variables
4. **Consolidation:** Merge similar prompts where possible
5. **Performance:** Cache loaded templates in memory

## Next Steps

1. Design YAML schema and directory structure
2. Create extraction script for automated migration  
3. Implement simple template loader
4. Update tool consumers to use prompt names
5. Validate performance impact