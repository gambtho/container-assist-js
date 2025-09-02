# NPM Publishing Guide

## Overview
This guide documents the process for publishing new releases to NPM.

## Pre-Release Checklist

### Code Quality
- [ ] All tests passing: `npm test`
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build:prod`

### Documentation
- [ ] CHANGELOG.md updated
- [ ] README.md version badge updated
- [ ] API documentation current
- [ ] Migration guide (if breaking changes)

### Version Management
- [ ] Version bumped in package.json
- [ ] Version follows semver:
  - MAJOR: Breaking changes
  - MINOR: New features
  - PATCH: Bug fixes

## Release Process

### Step 1: Prepare Release Branch
```bash
# Create release branch
git checkout -b release/v1.2.3

# Update version
npm version minor  # or major/patch

# Update CHANGELOG.md
# Add release notes with date
```

### Step 2: Final Testing
```bash
# Clean build
npm run clean
npm run build:prod

# Test package locally
npm pack
npm install -g thgamble-containerization-assist-mcp-1.2.3.tgz

# Verify it works
container-kit-mcp --version
```

### Step 3: Create Pull Request
```bash
# Push release branch
git push origin release/v1.2.3

# Create PR via GitHub
# Title: "Release v1.2.3"
# Description: Copy CHANGELOG entries
```

### Step 4: Merge and Tag
After PR approval:
```bash
# Merge to main
git checkout main
git pull origin main

# Create and push tag
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

### Step 5: Publish to NPM

#### Manual Publishing
```bash
# Login to NPM
npm login

# Publish with public access
npm publish --access public

# Verify on NPM
npm view @thgamble/containerization-assist-mcp
```

#### Automated Publishing (GitHub Actions)
The release workflow triggers on tag push:
1. Tests run automatically
2. Package builds
3. Publishes to NPM
4. Creates GitHub release

## Post-Release Tasks

### Verification
- [ ] Package visible on NPM
- [ ] Version installable: `npm install -g @thgamble/containerization-assist-mcp@latest`
- [ ] GitHub release created
- [ ] Documentation site updated

### Announcement
- [ ] Update project website
- [ ] Post to Discord/Slack
- [ ] Tweet release notes
- [ ] Update dependent projects

## Versioning Strategy

### Version Format
`MAJOR.MINOR.PATCH[-PRERELEASE]`

### Examples
- `2.0.0` - Major release with breaking changes
- `1.5.0` - Minor release with new features
- `1.4.3` - Patch release with bug fixes
- `2.0.0-beta.1` - Pre-release version

### Breaking Changes
Require major version bump:
- Removing tools
- Changing tool signatures
- Modifying configuration format
- Dropping Node.js version support

### Feature Additions
Require minor version bump:
- New tools
- New configuration options
- Performance improvements
- New service integrations

### Bug Fixes
Require patch version bump:
- Fixing tool errors
- Correcting documentation
- Security patches
- Performance fixes

## NPM Configuration

### package.json Settings
```json
{
  "name": "@thgamble/containerization-assist-mcp",
  "version": "1.2.3",
  "description": "MCP server for containerization workflows",
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  },
  "files": [
    "dist/**/*",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
  "keywords": [
    "mcp",
    "docker",
    "kubernetes",
    "containerization",
    "ai",
    "claude"
  ]
}
```

### .npmignore
```
# Source files
src/
test/
docs/

# Config files
.env*
.eslintrc*
.prettierrc*
tsconfig*.json

# Development
node_modules/
coverage/
.git/
.github/
*.log
```

## Automated Release Workflow

### GitHub Actions Configuration
```yaml
# .github/workflows/release.yml
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

### Release Script
```bash
#!/bin/bash
# scripts/release.sh

set -e

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
echo "Releasing version $VERSION"

# Verify clean working directory
if [ -n "$(git status --porcelain)" ]; then
  echo "Working directory is not clean. Please commit or stash changes."
  exit 1
fi

# Run quality checks
echo "Running quality checks..."
npm run validate

# Build production package
echo "Building production package..."
npm run build:prod

# Create git tag
echo "Creating git tag v$VERSION..."
git tag -a "v$VERSION" -m "Release v$VERSION"

# Push tag (triggers GitHub Actions)
echo "Pushing tag to trigger release..."
git push origin "v$VERSION"

echo "Release process initiated. Check GitHub Actions for progress."
```

## Troubleshooting

### NPM Login Issues
```bash
# Check current user
npm whoami

# Re-login
npm logout
npm login
```

### Publishing Errors

#### E403: Forbidden
- Check NPM authentication
- Verify package name availability
- Ensure you have publish rights

#### E404: Not Found
- Ensure scoped package name is correct
- Check registry URL

#### Version Already Exists
- Bump version number
- Never republish same version

### Rollback Procedure
If critical issue found after publish:
```bash
# Deprecate broken version
npm deprecate @thgamble/containerization-assist-mcp@1.2.3 "Critical bug - use 1.2.4"

# Publish patch immediately
npm version patch
npm publish
```

## Security Considerations

### NPM Token Management
- Use NPM automation tokens for CI/CD
- Rotate tokens regularly
- Never commit tokens to repository

### 2FA Setup
- Enable 2FA on NPM account
- Use auth-only 2FA for automation
- Store backup codes securely

### Audit Before Publishing
```bash
# Check for vulnerabilities
npm audit

# Fix if possible
npm audit fix

# Review remaining issues
npm audit --production
```

## Release Checklist Template

Copy this checklist for each release:

```markdown
## Release v1.2.3 Checklist

### Pre-Release
- [ ] All tests passing
- [ ] TypeScript compiles cleanly
- [ ] Linting passes
- [ ] Build succeeds
- [ ] CHANGELOG.md updated
- [ ] Version bumped appropriately

### Release Process
- [ ] Release branch created
- [ ] PR created and approved
- [ ] Tag created and pushed
- [ ] GitHub Actions completed successfully
- [ ] NPM package published

### Post-Release
- [ ] Package installable from NPM
- [ ] GitHub release created
- [ ] Documentation updated
- [ ] Announcement posted

### Issues Found
- [ ] None / List any issues discovered
```

## Continuous Deployment

### Automated Patch Releases
For critical bug fixes, enable automatic patch releases:

```yaml
# .github/workflows/auto-patch.yml
name: Auto Patch Release

on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'package.json'

jobs:
  check-for-patches:
    if: contains(github.event.head_commit.message, '[patch]')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Auto patch and release
        run: |
          npm version patch
          git push origin main --tags
```

### Release Branch Protection
Protect release branches to ensure quality:

```yaml
# .github/branch-protection.yml
release/*:
  required_status_checks:
    strict: true
    contexts:
      - "ci/tests"
      - "ci/build"
      - "ci/lint"
  required_pull_request_reviews:
    required_approving_review_count: 1
    dismiss_stale_reviews: true
```

## Monitoring Releases

### Post-Release Monitoring
Track release success with monitoring:

```bash
# Check download stats
npm info @thgamble/containerization-assist-mcp

# Monitor for issues
# Set up alerts for error reports
# Track user feedback
```

### Release Metrics
Track these metrics for each release:
- Download count within 24 hours
- Installation success rate
- User feedback/issues reported
- Performance impact
- Breaking change adoption

## Emergency Procedures

### Immediate Response
If a critical issue is discovered:

1. **Assess Impact**: Determine severity and affected users
2. **Communication**: Post notice to users immediately
3. **Quick Fix**: Apply minimal fix for critical issue
4. **Emergency Release**: Follow fast-track release process
5. **Post-Mortem**: Document what went wrong and how to prevent

### Fast-Track Release Process
For emergency releases:

```bash
# Skip normal process for critical fixes
git checkout main
git pull origin main

# Apply critical fix
# ... make necessary changes ...

# Emergency release
npm version patch
git add .
git commit -m "Emergency fix: [describe issue]"
git tag -a "v$(node -p 'require("./package.json").version')" -m "Emergency release"
git push origin main --tags

# Manual publish (bypass CI for speed)
npm run build:prod
npm publish --access public
```

Remember: Emergency procedures should be used sparingly and only for critical security or functionality issues that affect all users.