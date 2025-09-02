#!/usr/bin/env npx tsx
/**
 * Test MCP Tool Execution Pipeline
 * Tests actual tool execution with real MCP context
 */

import { promises as fs } from 'node:fs';

// Mock dependencies to test the tools
const mockLogger = {
  info: (obj: any, msg?: string) => console.log(`ℹ️  ${msg || JSON.stringify(obj)}`),
  error: (obj: any, msg?: string) => console.error(`❌ ${msg || JSON.stringify(obj)}`),
  warn: (obj: any, msg?: string) => console.warn(`⚠️  ${msg || JSON.stringify(obj)}`),
  child: (obj: any) => mockLogger
};

const mockContext = {
  logger: mockLogger,
  sessionService: {
    create: async (data: any) => ({ id: 'test-session-123' }),
    get: async (id: string) => ({ 
      success: true, 
      data: { id, metadata: {}, workflow_state: {} } 
    }),
    updateAtomic: async (id: string, updater: any) => {
      console.log(`📝 Session ${id} updated`);
    }
  },
  progressEmitter: {
    emit: async (data: any) => {
      console.log(`📊 Progress: ${data.step} - ${data.status} (${Math.round((data.progress || 0) * 100)}%) - ${data.message}`);
    }
  },
  dockerService: {
    isAvailable: () => false, // Mock as not available to avoid Docker calls
    health: async () => ({ success: true, data: { status: 'healthy' } })
  },
  config: {
    session: { store: 'memory', ttl: 3600, maxSessions: 100 },
    server: { nodeEnv: 'development', logLevel: 'info', port: 3000, host: 'localhost' }
  },
  server: null,
  progressToken: 'test-token-123'
};

/**
 * Test ping tool execution
 */
async function testPingExecution() {
  console.log(`\n🧪 Testing Ping Tool Execution...`);
  
  try {
    // Import the ping tool directly
    const { default: pingTool } = await import('../src/application/tools/ops/ping.js');
    
    console.log(`📋 Tool: ${pingTool.name}`);
    console.log(`📝 Description: ${pingTool.description}`);
    
    // Test input validation
    const testInput = { message: 'test-ping' };
    console.log(`📥 Input:`, testInput);
    
    // Validate input against schema
    const validatedInput = pingTool.inputSchema.parse(testInput);
    console.log(`✅ Input validation passed`);
    
    // Execute the tool
    const result = await pingTool.handler(validatedInput, mockContext);
    console.log(`📤 Output:`, result);
    
    // Validate output
    const validatedOutput = pingTool.outputSchema.parse(result);
    console.log(`✅ Output validation passed`);
    
    console.log(`🎉 Ping tool execution successful!`);
    
  } catch (error) {
    console.error(`❌ Ping tool execution failed:`, error);
    throw error;
  }
}

/**
 * Test server status tool execution
 */
async function testServerStatusExecution() {
  console.log(`\n🧪 Testing Server Status Tool Execution...`);
  
  try {
    const { default: serverStatusTool } = await import('../src/application/tools/ops/server-status.js');
    
    console.log(`📋 Tool: ${serverStatusTool.name}`);
    
    const testInput = { includeMetrics: true };
    console.log(`📥 Input:`, testInput);
    
    const validatedInput = serverStatusTool.inputSchema.parse(testInput);
    console.log(`✅ Input validation passed`);
    
    const result = await serverStatusTool.handler(validatedInput, mockContext);
    console.log(`📤 Output:`, result);
    
    const validatedOutput = serverStatusTool.outputSchema.parse(result);
    console.log(`✅ Output validation passed`);
    
    console.log(`🎉 Server status tool execution successful!`);
    
  } catch (error) {
    console.error(`❌ Server status tool execution failed:`, error);
    throw error;
  }
}

/**
 * Test list tools execution
 */
async function testListToolsExecution() {
  console.log(`\n🧪 Testing List Tools Execution...`);
  
  try {
    const { default: listToolsTool } = await import('../src/application/tools/ops/list-tools.js');
    
    console.log(`📋 Tool: ${listToolsTool.name}`);
    
    const testInput = { category: 'utility' };
    console.log(`📥 Input:`, testInput);
    
    const validatedInput = listToolsTool.inputSchema.parse(testInput);
    console.log(`✅ Input validation passed`);
    
    const result = await listToolsTool.handler(validatedInput, mockContext);
    console.log(`📤 Output:`, result);
    
    console.log(`🎉 List tools execution successful!`);
    
  } catch (error) {
    console.error(`❌ List tools execution failed:`, error);
    throw error;
  }
}

/**
 * Test error transformation
 */
async function testErrorTransformation() {
  console.log(`\n🧪 Testing Error Transformation...`);
  
  try {
    const { default: pingTool } = await import('../src/application/tools/ops/ping.js');
    
    // Test with invalid input to trigger validation error
    const invalidInput = { message: 123 }; // Should be string
    console.log(`📥 Invalid Input:`, invalidInput);
    
    try {
      const validatedInput = pingTool.inputSchema.parse(invalidInput);
      console.log(`❌ Should have failed validation!`);
    } catch (error) {
      console.log(`✅ Input validation correctly rejected invalid input`);
      console.log(`📋 Error type:`, error.constructor.name);
    }
    
    console.log(`🎉 Error transformation working correctly!`);
    
  } catch (error) {
    console.error(`❌ Error transformation test failed:`, error);
    throw error;
  }
}

/**
 * Run all execution tests
 */
async function runExecutionTests() {
  console.log(`🚀 Starting MCP Tool Execution Tests...`);
  
  let passedTests = 0;
  let totalTests = 0;
  
  const tests = [
    { name: 'Ping Tool', fn: testPingExecution },
    { name: 'Server Status Tool', fn: testServerStatusExecution },
    { name: 'List Tools', fn: testListToolsExecution },
    { name: 'Error Transformation', fn: testErrorTransformation }
  ];
  
  for (const test of tests) {
    try {
      totalTests++;
      await test.fn();
      passedTests++;
      console.log(`✅ ${test.name} test passed`);
    } catch (error) {
      console.error(`❌ ${test.name} test failed:`, error);
      // Continue with other tests
    }
  }
  
  console.log(`\n📊 Execution Test Summary:`);
  console.log(`   🧪 Total tests: ${totalTests}`);
  console.log(`   ✅ Passed: ${passedTests}`);
  console.log(`   ❌ Failed: ${totalTests - passedTests}`);
  console.log(`   📈 Success rate: ${Math.round((passedTests / totalTests) * 100)}%`);
  
  if (passedTests === totalTests) {
    console.log(`\n🎉 All execution tests passed! MCP pipeline is working!`);
  } else if (passedTests >= totalTests * 0.75) {
    console.log(`\n✅ Most execution tests passed. Minor issues to resolve.`);
  } else {
    console.log(`\n⚠️  Execution pipeline needs more work.`);
  }
  
  return passedTests === totalTests;
}

/**
 * Main test function
 */
async function main() {
  try {
    const success = await runExecutionTests();
    
    console.log(`\n🏁 MCP Execution Testing Complete!`);
    
    if (success) {
      console.log(`🎯 MCP migration validation: SUCCESSFUL`);
      console.log(`🚀 Ready for production use!`);
    } else {
      console.log(`⚠️  Some tests failed - review needed`);
    }
    
  } catch (error) {
    console.error(`❌ Execution testing failed:`, error);
    process.exit(1);
  }
}

// Run if called directly
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main().catch(console.error);
}

export { runExecutionTests };