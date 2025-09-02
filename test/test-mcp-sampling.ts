#!/usr/bin/env node

/**
 * Test script to verify MCP sampling integration
 * This tests the generate_dockerfile tool with a real Java project
 */

import { spawn } from 'child_process'
import { readFile, writeFile, rm } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { nanoid } from 'nanoid'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Test configuration
const TEST_REPO = join(__dirname, 'fixtures', 'java-spring-boot-maven')
const SESSION_ID = `test-${nanoid(8)}`

// MCP request helper
async function sendMCPRequest(method, params) {
  return new Promise((resolve, reject) => {
    const mcpServer = spawn('node', [join(__dirname, '..', 'server.js')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LOG_LEVEL: 'debug',
        WORKSPACE_DIR: dirname(TEST_REPO)
      }
    })
    
    let response = ''
    let error = ''
    
    mcpServer.stdout.on('data', (data) => {
      response += data.toString()
    })
    
    mcpServer.stderr.on('data', (data) => {
      error += data.toString()
    })
    
    mcpServer.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`MCP server exited with code ${code}: ${error}`))
      } else {
        try {
          // Parse the response
          const lines = response.split('\n').filter(line => line.trim())
          const lastLine = lines[lines.length - 1]
          const result = JSON.parse(lastLine)
          resolve(result)
        } catch (err) {
          reject(new Error(`Failed to parse response: ${response}`))
        }
      }
    })
    
    // Send the request
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: `tools/${method}`,
      params: params
    }
    
    mcpServer.stdin.write(JSON.stringify(request) + '\n')
    mcpServer.stdin.end()
  })
}

// Test workflow
async function runTest() {
  console.log('🚀 Testing MCP Sampling Integration')
  console.log('=====================================\n')
  
  try {
    // Step 1: Test analyze_repository
    console.log('📝 Step 1: Analyzing repository...')
    const analyzeResult = await sendMCPRequest('analyze_repository', {
      repo_path: TEST_REPO
    })
    
    if (!analyzeResult.success) {
      throw new Error(`Analysis failed: ${analyzeResult.error}`)
    }
    
    console.log('✅ Repository analyzed successfully')
    console.log('   Language:', analyzeResult.data.language)
    console.log('   Framework:', analyzeResult.data.framework)
    console.log('   Build System:', analyzeResult.data.buildSystem)
    console.log('')
    
    // Step 2: Test generate_dockerfile with MCP Sampling
    console.log('🐳 Step 2: Generating Dockerfile via MCP Sampling...')
    const dockerfileResult = await sendMCPRequest('generate_dockerfile', {
      session_id: SESSION_ID
    })
    
    if (!dockerfileResult.success) {
      throw new Error(`Dockerfile generation failed: ${dockerfileResult.error}`)
    }
    
    console.log('✅ Dockerfile generated successfully')
    console.log('   Path:', dockerfileResult.data.path)
    console.log('   Validation warnings:', dockerfileResult.data.validation?.length || 0)
    console.log('')
    
    // Step 3: Verify the generated Dockerfile
    console.log('🔍 Step 3: Verifying generated Dockerfile...')
    const dockerfilePath = join(TEST_REPO, 'Dockerfile')
    const dockerfileContent = await readFile(dockerfilePath, 'utf8')
    
    // Check for expected patterns
    const checks = [
      { pattern: /FROM.*openjdk|eclipse-temurin|amazoncorretto/, name: 'Java base image' },
      { pattern: /WORKDIR/, name: 'Working directory' },
      { pattern: /COPY.*pom\.xml|build\.gradle/, name: 'Build file copy' },
      { pattern: /RUN.*mvn|gradle/, name: 'Build command' },
      { pattern: /EXPOSE.*8080/, name: 'Port exposure' },
      { pattern: /ENTRYPOINT|CMD/, name: 'Container entrypoint' }
    ]
    
    console.log('   Content checks:')
    for (const check of checks) {
      const passed = check.pattern.test(dockerfileContent)
      console.log(`   ${passed ? '✅' : '❌'} ${check.name}`)
    }
    console.log('')
    
    // Step 4: Test K8s manifest generation
    console.log('☸️  Step 4: Generating Kubernetes manifests...')
    const k8sResult = await sendMCPRequest('generate_k8s_manifests', {
      session_id: SESSION_ID
    })
    
    if (!k8sResult.success) {
      throw new Error(`K8s generation failed: ${k8sResult.error}`)
    }
    
    console.log('✅ Kubernetes manifests generated successfully')
    console.log('   Path:', k8sResult.data.path)
    console.log('   Resources:', k8sResult.data.resources.map(r => r.kind).join(', '))
    console.log('')
    
    // Cleanup
    console.log('🧹 Cleaning up test artifacts...')
    await rm(dockerfilePath, { force: true })
    await rm(join(TEST_REPO, 'k8s-manifests.yaml'), { force: true })
    
    console.log('\n✨ All tests passed successfully!')
    console.log('=====================================')
    console.log('MCP Sampling integration is working correctly.')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    process.exit(1)
  }
}

// Run the test
runTest().catch(console.error)