# Security Scanning Setup Guide

## Overview

The containerization-assist-js MCP server now includes integrated security vulnerability scanning for Docker images using Trivy. This document explains how to set up and use the security scanning features.

## Prerequisites

### Required Software

1. **Docker** - Must be installed and running
2. **Trivy** - Open source vulnerability scanner

### Installing Trivy

#### macOS
```bash
brew install trivy
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install wget apt-transport-https gnupg lsb-release
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
echo "deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee -a /etc/apt/sources.list.d/trivy.list
sudo apt-get update
sudo apt-get install trivy
```

#### Linux (RHEL/CentOS)
```bash
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://aquasecurity.github.io/trivy-repo/rpm/releases/trivy.repo
sudo yum install trivy
```

#### Docker
```bash
docker pull aquasec/trivy:latest
alias trivy="docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest"
```

#### Verify Installation
```bash
trivy --version
```

## Configuration

### Environment Variables

Configure security scanning in your `.env` file:

```env
# Enable/disable security scanning
SCANNING_ENABLED=true

# Scanner to use (trivy, grype, or both)
SCANNING_SCANNER=trivy

# Severity threshold (low, medium, high, critical)
SCANNING_SEVERITY_THRESHOLD=high

# Fail builds on vulnerabilities
SCANNING_FAIL_ON_VULNERABILITIES=false

# Skip vulnerability database updates (speeds up scans in CI)
SCANNING_SKIP_UPDATE=false

# Scan timeout in milliseconds
SCANNING_TIMEOUT=300000

# Trivy-specific settings
TRIVY_CACHE_DIR=/tmp/trivy-cache
```

### Application Configuration

The scanner is configured through the application config:

```typescript
// src/config/config.ts
const config = {
  infrastructure: {
    scanning: {
      enabled: true,
      scanner: 'trivy',
      severityThreshold: 'high',
      failOnVulnerabilities: false,
      skipUpdate: false,
      timeout: 300000
    }
  }
};
```

## Usage

### Using the scan_image Tool

The `scan_image` tool is automatically called during the containerization workflow after building an image:

```typescript
// Via MCP protocol
{
  "tool": "scan_image",
  "arguments": {
    "image_id": "myapp:latest",
    "severity_threshold": "high",
    "ignore_unfixed": true
  }
}
```

### Scan Results

The scanner returns detailed vulnerability information:

```json
{
  "success": true,
  "vulnerabilities": [
    {
      "severity": "high",
      "cve": "CVE-2024-1234",
      "package": "openssl",
      "version": "1.1.1",
      "fixedVersion": "1.1.1w",
      "description": "Buffer overflow vulnerability"
    }
  ],
  "summary": {
    "critical": 0,
    "high": 2,
    "medium": 5,
    "low": 10,
    "total": 17,
    "fixable": 15
  },
  "scanTime": "2024-01-20T10:30:00Z",
  "scanner": "trivy",
  "recommendations": [
    "2 vulnerabilities have fixes available - run updates",
    "Use minimal base images (alpine, distroless) when possible"
  ]
}
```

### Programmatic Usage

```typescript
import { DockerClient } from './infrastructure/docker-client';
import { createLogger } from './infrastructure/logger';

const logger = createLogger();
const dockerClient = new DockerClient(
  {
    socketPath: '/var/run/docker.sock',
    trivy: {
      scannerPath: 'trivy',
      cacheDir: '/tmp/trivy-cache',
      timeout: 300000
    }
  },
  logger
);

await dockerClient.initialize();

// Scan an image
const scanResult = await dockerClient.scan('myapp:latest', {
  severity: 'high',
  ignoreUnfixed: true
});

console.log(`Found ${scanResult.summary.total} vulnerabilities`);
console.log(`Critical: ${scanResult.summary.critical}`);
console.log(`High: ${scanResult.summary.high}`);
```

## Workflow Integration

### Automatic Scanning

Security scanning is automatically performed in the standard containerization workflow:

1. `analyze_repository` - Analyze the codebase
2. `generate_dockerfile` - Create Dockerfile
3. `build_image` - Build Docker image
4. **`scan_image`** - Scan for vulnerabilities ← Automatic
5. `tag_image` - Tag the image
6. `push_image` - Push to registry

### CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Build and Scan

on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Install Trivy
        run: |
          sudo apt-get update
          sudo apt-get install wget apt-transport-https gnupg lsb-release
          wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
          echo "deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee -a /etc/apt/sources.list.d/trivy.list
          sudo apt-get update
          sudo apt-get install trivy
      
      - name: Build and Scan
        env:
          SCANNING_ENABLED: true
          SCANNING_FAIL_ON_VULNERABILITIES: true
          SCANNING_SEVERITY_THRESHOLD: critical
        run: |
          npm run build
          # The scan_image tool will be called automatically
```

## Security Best Practices

### 1. Use Minimal Base Images
- Prefer `alpine` or `distroless` images
- Smaller attack surface = fewer vulnerabilities

### 2. Regular Scanning
- Scan images on every build
- Schedule periodic scans of deployed images
- Monitor for new CVEs

### 3. Update Dependencies
- Keep base images updated
- Regularly update application dependencies
- Use automated dependency updates (Dependabot, Renovate)

### 4. Severity Thresholds
- Development: `medium` threshold
- Staging: `high` threshold  
- Production: `critical` threshold with `failOnVulnerabilities: true`

### 5. Fix Priority
1. Critical vulnerabilities with fixes available
2. High vulnerabilities with fixes available
3. Critical/High without fixes - consider alternatives
4. Medium/Low - address in regular maintenance

## Troubleshooting

### Trivy Not Found

**Error**: "Trivy is not installed"

**Solution**: Install Trivy following the installation instructions above.

### Scan Timeouts

**Error**: "Trivy scan timed out"

**Solution**: 
- Increase timeout in configuration
- Ensure Trivy database is updated (`trivy image --download-db-only`)
- Check network connectivity

### Database Update Issues

**Error**: "Failed to update Trivy database"

**Solution**:
- Check internet connectivity
- Clear cache: `rm -rf /tmp/trivy-cache`
- Manually update: `trivy image --download-db-only`
- In CI, set `SCANNING_SKIP_UPDATE=true` and use cached database

### Docker Socket Access

**Error**: "Cannot connect to Docker daemon"

**Solution**:
- Ensure Docker is running
- Check socket permissions: `sudo chmod 666 /var/run/docker.sock`
- For remote Docker, configure `DOCKER_HOST`

### No Vulnerabilities Found

If scanning shows 0 vulnerabilities on images known to have issues:

1. Update Trivy database
2. Check severity filter settings
3. Verify image name/tag
4. Run manual scan: `trivy image <image-name>`

## Performance Optimization

### 1. Cache Vulnerability Database
```bash
# Pre-download database
trivy image --download-db-only

# Use cached database in CI
export SCANNING_SKIP_UPDATE=true
```

### 2. Parallel Scanning
When scanning multiple images, use parallel execution:

```typescript
const images = ['app:v1', 'app:v2', 'app:v3'];
const results = await Promise.all(
  images.map(image => dockerClient.scan(image))
);
```

### 3. Scan Layer Caching
Trivy caches scan results by layer. Minimize layer changes to benefit from caching.

### 4. Ignore Unfixed
In CI pipelines, consider ignoring unfixed vulnerabilities:

```typescript
const result = await dockerClient.scan(image, {
  ignoreUnfixed: true
});
```

## Alternative Scanners

While Trivy is the recommended scanner, you can also use:

### Grype
```bash
# Install
curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin

# Configure
SCANNING_SCANNER=grype
```

### Snyk (requires API key)
```bash
# Install
npm install -g snyk

# Configure
SCANNING_SCANNER=snyk
SNYK_API_KEY=your-api-key
```

## Monitoring and Alerting

### Metrics to Track
- Total vulnerabilities by severity
- Fixable vs unfixable vulnerabilities
- Scan duration
- Images with critical vulnerabilities
- Compliance rate (images passing threshold)

### Example Monitoring Query
```sql
SELECT 
  image_name,
  scan_date,
  critical_count,
  high_count,
  total_count,
  fixable_count
FROM scan_results
WHERE scan_date > NOW() - INTERVAL '7 days'
ORDER BY critical_count DESC, high_count DESC;
```

## Compliance and Reporting

### Generate Security Report
```typescript
const generateSecurityReport = async (images: string[]) => {
  const report = {
    scanDate: new Date().toISOString(),
    images: [],
    summary: {
      totalImages: images.length,
      compliant: 0,
      nonCompliant: 0,
      criticalVulnerabilities: 0
    }
  };

  for (const image of images) {
    const scan = await dockerClient.scan(image);
    report.images.push({
      name: image,
      vulnerabilities: scan.summary,
      compliant: scan.summary.critical === 0
    });
    
    if (scan.summary.critical === 0) {
      report.summary.compliant++;
    } else {
      report.summary.nonCompliant++;
    }
    
    report.summary.criticalVulnerabilities += scan.summary.critical;
  }

  return report;
};
```

## Support

For issues or questions:
- GitHub Issues: [containerization-assist-js/issues](https://github.com/your-org/containerization-assist-js/issues)
- Trivy Documentation: [aquasecurity.github.io/trivy](https://aquasecurity.github.io/trivy)
- Security advisories: Check your package manager's security advisories