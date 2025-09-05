#!/usr/bin/env node

/**
 * Auto Integration Test Runner
 * Detects available services and runs appropriate integration tests
 */

import { spawn } from 'child_process';
import { detectEnvironment } from '../dist/test/utils/environment-detector.js';

// Input validation
const args = process.argv.slice(2);
const validArgs = ['--verbose', '--watch', '--coverage', '--updateSnapshot'];
for (const arg of args) {
    if (arg.startsWith('--') && !validArgs.includes(arg.split('=')[0])) {
        console.error(`Error: Invalid argument '${arg}'. Valid options: ${validArgs.join(', ')}`);
        process.exit(1);
    }
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            ...options
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                resolve(code);
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });
        
        child.on('error', (err) => {
            console.error(`Failed to spawn process: ${err.message}`);
            reject(err);
        });
    });
}

async function main() {
    console.log('🚀 Auto Integration Test Runner');
    console.log('Detecting environment and running available tests...\n');
    
    try {
        // Detect what's available
        const capabilities = await detectEnvironment({ timeout: 5000 });
        
        // Build test patterns based on available services
        const testPatterns = [];
        const availableServices = [];
        
        if (capabilities.docker.available) {
            testPatterns.push('**/integration/**/*docker*.test.ts');
            availableServices.push('Docker');
        }
        
        if (capabilities.registry.available) {
            testPatterns.push('**/integration/**/*registry*.test.ts');
            availableServices.push('Registry');
        }
        
        if (capabilities.trivy.available) {
            testPatterns.push('**/integration/**/*trivy*.test.ts');
            availableServices.push('Trivy');
        }
        
        if (capabilities.kubernetes.available) {
            testPatterns.push('**/integration/**/*k8s*.test.ts');
            testPatterns.push('**/integration/**/*kubernetes*.test.ts');
            availableServices.push('Kubernetes');
        }
        
        // Add remaining integration tests that don't require external services
        testPatterns.push('**/integration/**/*ai*.test.ts');
        testPatterns.push('**/integration/**/*mcp*.test.ts');
        testPatterns.push('**/integration/**/*e2e*.test.ts');
        
        if (testPatterns.length === 0) {
            console.log('❌ No integration tests can run - no services available');
            console.log('Run "npm run diagnose:integration" for setup guidance');
            process.exit(1);
        }
        
        console.log('✅ Available services:', availableServices.join(', '));
        console.log('🧪 Running integration tests for available services...\n');
        
        // Set environment variables for the test run
        const testEnv = {
            ...process.env,
            NODE_OPTIONS: '--experimental-vm-modules'
        };
        
        if (capabilities.docker.available && capabilities.docker.socketPath) {
            testEnv.DOCKER_SOCKET = capabilities.docker.socketPath;
        }
        
        if (capabilities.registry.available) {
            testEnv.TEST_REGISTRY_HOST = `${capabilities.registry.host}:${capabilities.registry.port}`;
            testEnv.USE_LOCAL_REGISTRY = 'true';
        }
        
        // Build Jest command
        const jestArgs = [];
        
        // Add each test pattern as a separate testMatch argument
        testPatterns.forEach(pattern => {
            jestArgs.push(`--testMatch=${pattern}`);
        });
        
        jestArgs.push('--testTimeout=120000');
        jestArgs.push('--verbose');
        
        // Add coverage if requested
        if (process.argv.includes('--coverage')) {
            jestArgs.push('--coverage');
        }
        
        // Add watch mode if requested
        if (process.argv.includes('--watch')) {
            jestArgs.push('--watch');
        }
        
        // Run the tests
        console.log('Running command: jest', jestArgs.join(' '));
        console.log('');
        
        await runCommand('npx', ['jest', ...jestArgs], { 
            env: testEnv,
            cwd: process.cwd()
        });
        
        console.log('\n✅ Integration tests completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Integration tests failed:');
        console.error(error.message);
        
        console.log('\n🔧 Troubleshooting:');
        console.log('• Run "npm run diagnose:integration" to check your environment');
        console.log('• Check test logs above for specific failures');
        console.log('• Ensure all required services are running');
        
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log('Auto Integration Test Runner');
    console.log('');
    console.log('Usage: npm run test:integration:auto [options]');
    console.log('');
    console.log('Options:');
    console.log('  --coverage    Generate test coverage report');
    console.log('  --watch       Run in watch mode');
    console.log('  --help, -h    Show this help message');
    console.log('');
    console.log('This command automatically detects available services and runs');
    console.log('only the integration tests that can actually execute.');
    console.log('');
    console.log('To diagnose your environment:');
    console.log('  npm run diagnose:integration');
    process.exit(0);
}

main().catch(console.error);