# CI/CD Configuration Guide

## GitHub Actions Workflows

### Current Workflows Review

#### 1. CI Workflow (.github/workflows/ci.yml)
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint
        run: npm run lint
      
      - name: Type check
        run: npm run typecheck
      
      - name: Test
        run: npm test -- --coverage
      
      - name: Build
        run: npm run build:prod
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

#### 2. Release Workflow (.github/workflows/release.yml)
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write
      
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build:prod
      
      - name: Test
        run: npm test
      
      - name: Publish to NPM
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            dist/**/*.js
            CHANGELOG.md
          generate_release_notes: true
```

#### 3. PR Validation (.github/workflows/pr-check.yml)
```yaml
name: PR Validation

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Check commit messages
        uses: wagoid/commitlint-github-action@v5
      
      - name: Check code quality
        run: |
          npm run lint
          npm run typecheck
      
      - name: Test changes
        run: npm test -- --changedSince=main
      
      - name: Size check
        uses: andresz1/size-limit-action@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          build_script: build:prod
```

## Package.json Scripts Review

### Current Scripts Configuration
Based on the project's package.json, here are the key scripts:

```json
{
  "scripts": {
    // Development
    "start:dev": "tsx watch src/bin/cli.ts",
    "dev": "npm run start:dev",
    
    // Building
    "clean": "rm -rf dist coverage .tsbuildinfo*",
    "prebuild": "npm run clean && npm run lint && npm run typecheck",
    "build": "tsc -p tsconfig.build.json",
    "build:prod": "npm run prebuild:prod && tsc -p tsconfig.prod.json",
    "build:fast": "npm run clean && tsc -p tsconfig.build.json --skipLibCheck",
    "build:watch": "tsc --watch --preserveWatchOutput -p tsconfig.json",
    "postbuild": "npm run copy:assets && npm run make:executable",
    
    // Quality
    "lint": "eslint src --ext .ts --max-warnings 0",
    "lint:fix": "eslint src --ext .ts --fix",
    "format": "prettier --write 'src/**/*.ts'",
    "format:check": "prettier --check 'src/**/*.ts'",
    "typecheck": "tsc --noEmit",
    
    // Testing
    "test": "NODE_OPTIONS='--experimental-vm-modules' jest",
    "test:watch": "NODE_OPTIONS='--experimental-vm-modules' jest --watch",
    "test:coverage": "NODE_OPTIONS='--experimental-vm-modules' jest --coverage",
    "test:integration": "NODE_OPTIONS='--experimental-vm-modules' jest --testMatch='**/integration/**/*.test.ts' --testTimeout=120000",
    "test:unit": "NODE_OPTIONS='--experimental-vm-modules' jest --testMatch='**/unit/**/*.test.ts' --testTimeout=30000",
    "test:unit:quick": "NODE_OPTIONS='--experimental-vm-modules' jest --testMatch='**/unit/**/*.test.ts' --testTimeout=10000 --bail",
    
    // Validation
    "validate": "npm run lint && npm run typecheck && npm test",
    "prepublishOnly": "npm run validate && npm run build:prod"
  }
}
```

## Recommended CI/CD Improvements

### 1. Enhanced CI Pipeline
```yaml
# .github/workflows/ci-enhanced.yml
name: Enhanced CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'

jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      cache-key: ${{ steps.cache-keys.outputs.cache-key }}
    steps:
      - uses: actions/checkout@v4
      
      - name: Generate cache keys
        id: cache-keys
        run: |
          echo "cache-key=node-modules-${{ hashFiles('package-lock.json') }}" >> $GITHUB_OUTPUT
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci

  lint-and-format:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Check formatting
        run: npm run format:check
      
      - name: Lint code
        run: npm run lint
      
      - name: Type check
        run: npm run typecheck

  test:
    needs: setup
    runs-on: ubuntu-latest
    strategy:
      matrix:
        test-suite: [unit, integration]
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Setup Docker (for integration tests)
        if: matrix.test-suite == 'integration'
        uses: docker/setup-docker@v2
      
      - name: Run tests
        run: npm run test:${{ matrix.test-suite }}
        env:
          CI: true
      
      - name: Upload coverage
        if: matrix.test-suite == 'unit'
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
          flags: unittests

  security-scan:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run security audit
        run: |
          npm audit --production --audit-level=moderate
      
      - name: Run Snyk security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  build:
    needs: [lint-and-format, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build production
        run: npm run build:prod
      
      - name: Test built package
        run: |
          npm pack --dry-run
          node -e "console.log('Build validation passed')"
      
      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: build-artifacts
          path: dist/
          retention-days: 7
```

### 2. Docker Integration Testing
```yaml
# .github/workflows/docker-integration.yml
name: Docker Integration Tests

on:
  pull_request:
    paths:
      - 'src/**'
      - 'Dockerfile'
      - 'docker-compose.yml'

jobs:
  docker-tests:
    runs-on: ubuntu-latest
    services:
      docker:
        image: docker:dind
        options: --privileged
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      
      - name: Build test image
        run: |
          docker build -t container-kit-test .
      
      - name: Run container smoke test
        run: |
          docker run --rm container-kit-test --version
      
      - name: Test Docker integration
        run: |
          npm run test:integration -- --testNamePattern="Docker"
```

### 3. Performance Monitoring
```yaml
# .github/workflows/performance.yml
name: Performance Monitoring

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build:prod
      
      - name: Run performance tests
        run: npm run test:performance
      
      - name: Check bundle size
        run: |
          npm run bundle:size
          du -sh dist/
      
      - name: Performance regression check
        uses: benchmark-action/github-action-benchmark@v1
        with:
          tool: 'customSmallerIsBetter'
          output-file-path: performance-results.json
          github-token: ${{ secrets.GITHUB_TOKEN }}
          alert-threshold: '150%'
          comment-on-alert: true
```

### 4. Automated Dependency Updates
```yaml
# .github/workflows/dependency-updates.yml
name: Dependency Updates

on:
  schedule:
    - cron: '0 0 * * 1' # Weekly on Monday
  workflow_dispatch:

jobs:
  update-dependencies:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Update dependencies
        run: |
          npm update
          npm audit fix --force
      
      - name: Test updates
        run: |
          npm run validate
      
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: 'chore: update dependencies'
          title: 'Automated dependency updates'
          body: |
            Automated dependency updates from scheduled workflow.
            
            Please review the changes and ensure all tests pass.
          branch: dependency-updates
```

## Quality Gates

### Required Checks for PRs
1. ✅ All tests passing (unit + integration)
2. ✅ TypeScript compilation successful
3. ✅ Linting passes (0 warnings)
4. ✅ Code coverage > 80%
5. ✅ No security vulnerabilities (high/critical)
6. ✅ Bundle size within limits
7. ✅ Commit messages follow convention
8. ✅ Performance regression check

### Branch Protection Configuration
```yaml
# .github/branch-protection.yml
branch_protection_rules:
  main:
    required_status_checks:
      strict: true
      contexts:
        - "Enhanced CI / lint-and-format"
        - "Enhanced CI / test (unit)"
        - "Enhanced CI / test (integration)"
        - "Enhanced CI / security-scan"
        - "Enhanced CI / build"
        - "Performance Monitoring / performance"
    
    required_pull_request_reviews:
      required_approving_review_count: 1
      dismiss_stale_reviews: true
      require_code_owner_reviews: true
    
    restrictions:
      users: []
      teams: ["maintainers"]
    
    enforce_admins: true
    allow_force_pushes: false
    allow_deletions: false
```

## Monitoring and Alerts

### Status Badges
Add these badges to your README.md:

```markdown
![CI](https://github.com/gambtho/container-assist-js/workflows/Enhanced%20CI/badge.svg)
![Coverage](https://codecov.io/gh/gambtho/container-assist-js/branch/main/graph/badge.svg)
![NPM](https://img.shields.io/npm/v/@thgamble/containerization-assist-mcp)
![License](https://img.shields.io/npm/l/@thgamble/containerization-assist-mcp)
![Node](https://img.shields.io/node/v/@thgamble/containerization-assist-mcp)
```

### Slack Notifications
```yaml
# Add to workflow steps
- name: Notify Slack on failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    channel: '#ci-notifications'
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### GitHub Notifications
```yaml
# .github/workflows/notify.yml
name: Notifications

on:
  workflow_run:
    workflows: ["Enhanced CI", "Release"]
    types:
      - completed

jobs:
  notify:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    steps:
      - name: Create issue on failure
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `CI Failure: ${context.workflow} on ${context.ref}`,
              body: `The ${context.workflow} workflow failed on ${context.ref}.
              
              Please investigate: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
              labels: ['ci-failure', 'bug']
            })
```

## Deployment Pipeline

### Staging Deployment
```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to Staging

on:
  push:
    branches: [develop]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build:prod
      
      - name: Deploy to staging
        run: |
          # Deploy logic here
          echo "Deploying to staging environment"
      
      - name: Run smoke tests
        run: |
          # Smoke test logic
          npm run test:smoke -- --baseUrl=${{ secrets.STAGING_URL }}
      
      - name: Notify team
        uses: 8398a7/action-slack@v3
        with:
          status: custom
          custom_payload: |
            {
              text: "🚀 New staging deployment available",
              attachments: [{
                color: "good",
                fields: [{
                  title: "Commit",
                  value: "${{ github.sha }}",
                  short: true
                }, {
                  title: "URL",
                  value: "${{ secrets.STAGING_URL }}",
                  short: true
                }]
              }]
            }
```

### Production Deployment
```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  release:
    types: [published]

jobs:
  deploy-production:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Validate release
        run: |
          npm run validate
          npm run build:prod
      
      - name: Publish to NPM
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      
      - name: Update Docker Hub
        uses: docker/build-push-action@v4
        with:
          push: true
          tags: |
            thgamble/containerization-assist-mcp:latest
            thgamble/containerization-assist-mcp:${{ github.event.release.tag_name }}
          platforms: linux/amd64,linux/arm64
      
      - name: Post-deployment verification
        run: |
          # Verify NPM package
          npm view @thgamble/containerization-assist-mcp@latest
          
          # Verify Docker image
          docker pull thgamble/containerization-assist-mcp:latest
          docker run --rm thgamble/containerization-assist-mcp:latest --version
```

## Local Development Setup

### Pre-commit Hooks
Configure Husky for pre-commit checks:

```json
// package.json
{
  "lint-staged": {
    "*.{ts,js}": [
      "eslint --fix --max-warnings 0",
      "prettier --write"
    ],
    "*.{md,json,yml,yaml}": [
      "prettier --write"
    ]
  },
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged",
      "commit-msg": "commitlint -E HUSKY_GIT_PARAMS",
      "pre-push": "npm run validate"
    }
  }
}
```

### VSCode Integration
```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.includePackageJsonAutoImports": "auto",
  "files.exclude": {
    "dist": true,
    "coverage": true,
    "node_modules": true
  }
}
```

### Development Scripts
```json
// package.json - additional development scripts
{
  "scripts": {
    "check-all": "npm run lint && npm run typecheck && npm run test && npm run build:prod",
    "fix-all": "npm run lint:fix && npm run format",
    "prerelease": "npm run check-all && npm run bundle:check",
    "release:patch": "npm version patch && git push --follow-tags",
    "release:minor": "npm version minor && git push --follow-tags",
    "release:major": "npm version major && git push --follow-tags"
  }
}
```

## Troubleshooting CI/CD Issues

### Common Problems and Solutions

#### 1. Node.js Version Mismatches
```yaml
# Always specify exact version
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20.x'  # Use specific version
    cache: 'npm'
```

#### 2. NPM Cache Issues
```yaml
# Clear cache if needed
- name: Clear NPM cache
  run: npm cache clean --force
  
- name: Install dependencies
  run: npm ci --no-optional
```

#### 3. Test Timeouts
```bash
# Increase timeout for integration tests
npm run test:integration -- --testTimeout=120000
```

#### 4. Memory Issues
```yaml
# Increase Node.js memory limit
env:
  NODE_OPTIONS: --max-old-space-size=4096
```

#### 5. Docker in CI
```yaml
# Use Docker-in-Docker service
services:
  docker:
    image: docker:dind
    options: --privileged

# Or use setup-docker action
- name: Set up Docker
  uses: docker/setup-docker@v2
```

## Metrics and Analytics

### Build Performance Tracking
```yaml
- name: Track build performance
  run: |
    echo "BUILD_START=$(date +%s)" >> $GITHUB_ENV
    npm run build:prod
    BUILD_END=$(date +%s)
    BUILD_DURATION=$((BUILD_END - BUILD_START))
    echo "Build took ${BUILD_DURATION} seconds"
    echo "build_duration=${BUILD_DURATION}" >> $GITHUB_OUTPUT
```

### Test Result Analysis
```yaml
- name: Publish test results
  uses: EnricoMi/publish-unit-test-result-action@v2
  if: always()
  with:
    files: |
      test-results/**/*.xml
      coverage/**/*.xml
```

### Code Quality Trends
```yaml
- name: SonarCloud Scan
  uses: SonarSource/sonarcloud-github-action@master
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

This comprehensive CI/CD setup ensures high code quality, thorough testing, and reliable deployments for the Container Kit MCP Server.