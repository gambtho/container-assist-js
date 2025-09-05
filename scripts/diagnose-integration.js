#!/usr/bin/env node

/**
 * Integration Test Diagnostic Tool
 * Analyzes the environment and reports what integration tests can be run
 */

import { detectEnvironment, createEnvironmentReport } from '../dist/test/utils/environment-detector.js';

// Input validation
const args = process.argv.slice(2);
const validArgs = ['--json', '--verbose'];
for (const arg of args) {
    if (arg.startsWith('--') && !validArgs.includes(arg)) {
        console.error(`Error: Invalid argument '${arg}'. Valid options: ${validArgs.join(', ')}`);
        process.exit(1);
    }
}

const outputJson = args.includes('--json');
const verbose = args.includes('--verbose');

async function main() {
    console.log('🔍 Diagnosing Integration Test Environment...\n');
    
    try {
        // Detect environment with reasonable timeout
        const capabilities = await detectEnvironment({ 
            timeout: 10000 // 10 second timeout for diagnosis
        });
        
        // Create detailed report
        const report = createEnvironmentReport(capabilities);
        
        if (outputJson) {
            console.log(JSON.stringify(capabilities, null, 2));
        } else {
            console.log(report);
        }
        
        // Provide actionable recommendations
        console.log('=== Quick Setup Commands ===');
        
        if (!capabilities.docker.available) {
            console.log('📋 Docker Setup:');
            console.log('   • Install Docker: https://docs.docker.com/get-docker/');
            console.log('   • Start Docker daemon');
            console.log('   • Verify: docker --version');
            console.log('');
        }
        
        if (!capabilities.registry.available && capabilities.docker.available) {
            console.log('📋 Registry Setup:');
            console.log('   • Run: npm run registry:start');
            console.log('   • Or: ./scripts/setup-test-registry.sh');
            console.log('');
        }
        
        if (!capabilities.trivy.available && capabilities.docker.available) {
            console.log('📋 Security Scanner Setup:');
            console.log('   • Install Trivy: https://aquasecurity.github.io/trivy/latest/getting-started/installation/');
            console.log('   • Or use container mode (automatic fallback)');
            console.log('');
        }
        
        if (!capabilities.kubernetes.available) {
            console.log('📋 Kubernetes Setup (Optional):');
            console.log('   • Install kubectl: https://kubernetes.io/docs/tasks/tools/');
            console.log('   • Setup local cluster: kind, minikube, or Docker Desktop');
            console.log('   • Verify: kubectl version --client');
            console.log('');
        }
        
        // Test execution recommendations
        console.log('=== Recommended Test Commands ===');
        
        const availableServices = [];
        if (capabilities.docker.available) availableServices.push('docker');
        if (capabilities.registry.available) availableServices.push('registry');
        if (capabilities.trivy.available) availableServices.push('trivy');
        if (capabilities.kubernetes.available) availableServices.push('k8s');
        
        if (availableServices.length === 0) {
            console.log('❌ No integration tests can run - please set up dependencies');
        } else {
            console.log('✅ You can run these integration tests:');
            
            if (capabilities.docker.available) {
                console.log('   npm run test:integration:docker    # Docker workflow tests');
            }
            if (capabilities.registry.available) {
                console.log('   npm run test:integration:registry  # Registry push/pull tests');
            }
            if (capabilities.trivy.available) {
                console.log('   npm run test:integration:trivy     # Security scanning tests');
            }
            if (capabilities.kubernetes.available) {
                console.log('   npm run test:integration:k8s       # Kubernetes deployment tests');
            }
            
            console.log('   npm run test:integration:auto       # Auto-detect and run available tests');
            console.log('   npm run test:integration             # Run all tests (some may be skipped)');
        }
        
        console.log('');
        console.log('=== Environment Files ===');
        console.log('You can set these environment variables in .env:');
        console.log('');
        
        if (capabilities.docker.socketPath) {
            console.log(`DOCKER_SOCKET=${capabilities.docker.socketPath}`);
        }
        if (capabilities.registry.available) {
            console.log(`TEST_REGISTRY_HOST=${capabilities.registry.host}:${capabilities.registry.port}`);
            console.log('USE_LOCAL_REGISTRY=true');
        }
        if (capabilities.platform.ci) {
            console.log('# CI Environment detected');
            console.log('SKIP_INTEGRATION_TESTS=true  # Skip external dependencies in CI');
        } else {
            console.log('SKIP_INTEGRATION_TESTS=false');
        }
        
        // Exit with appropriate code
        const criticalMissing = !capabilities.docker.available;
        process.exit(criticalMissing ? 1 : 0);
        
    } catch (error) {
        console.error('❌ Error during environment detection:');
        console.error(error.message);
        process.exit(1);
    }
}

main().catch(console.error);