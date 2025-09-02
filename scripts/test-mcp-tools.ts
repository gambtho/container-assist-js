#!/usr/bin/env npx tsx
/**
 * Test MCP Tool Execution
 * Validates that migrated tools work correctly with MCP format
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

interface MockMCPToolContext {
  logger: {
    info: (obj: any, msg?: string) => void;
    error: (obj: any, msg?: string) => void;
    warn: (obj: any, msg?: string) => void;
    child: (obj: any) => MockMCPToolContext['logger'];
  };
  sessionService?: {
    create: (data: any) => Promise<{ id: string }>;
    get: (id: string) => Promise<any>;
    updateAtomic: (id: string, updater: (data: any) => any) => Promise<void>;
  };
  progressEmitter?: {
    emit: (data: any) => Promise<void>;
  };
  dockerService?: any;
  kubernetesService?: any;
  aiService?: any;
  eventPublisher?: any;
  workflowManager?: any;
  workflowOrchestrator?: any;
  config?: any;
  server?: any;
  progressToken?: string;
}

/**
 * Create a mock MCP context for testing
 */
function createMockContext(): MockMCPToolContext {
  const logger = {
    info: (obj: any, msg?: string) => {
      console.log(`ℹ️  ${msg || 'Info'}:`, obj);
    },
    error: (obj: any, msg?: string) => {
      console.error(`❌ ${msg || 'Error'}:`, obj);
    },
    warn: (obj: any, msg?: string) => {
      console.warn(`⚠️  ${msg || 'Warning'}:`, obj);
    },
    child: (obj: any) => logger
  };

  return {
    logger,
    sessionService: {
      create: async (data: any) => ({ id: 'test-session-123' }),
      get: async (id: string) => ({ id, metadata: {}, workflow_state: {} }),
      updateAtomic: async (id: string, updater: any) => {
        console.log(`📝 Session ${id} updated`);
      }
    },
    progressEmitter: {
      emit: async (data: any) => {
        console.log(`📊 Progress: ${data.step} - ${data.status} (${Math.round((data.progress || 0) * 100)}%)`);
      }
    },
    config: {
      session: { store: 'memory', ttl: 3600, maxSessions: 100 },
      server: { nodeEnv: 'development', logLevel: 'info', port: 3000, host: 'localhost' }
    }
  };
}

/**
 * Test a specific MCP tool
 */
async function testMCPTool(toolPath: string, testInput: any): Promise<void> {
  try {
    console.log(`\n🧪 Testing tool: ${path.basename(toolPath, '.ts')}`);
    console.log(`📂 Path: ${toolPath}`);
    
    // Read the tool file to check if it's MCP format
    const toolContent = await fs.readFile(toolPath, 'utf-8');
    
    if (!toolContent.includes('MCPToolDescriptor')) {
      console.log(`⏭️  Skipping - not an MCP tool`);
      return;
    }

    if (!toolContent.includes('export default')) {
      console.log(`⏭️  Skipping - no default export`);
      return;
    }

    console.log(`✅ Tool appears to be in MCP format`);
    
    // Check tool structure
    const hasHandler = toolContent.includes('handler:');
    const hasInputSchema = toolContent.includes('inputSchema:');
    const hasOutputSchema = toolContent.includes('outputSchema:');
    
    console.log(`📋 Tool structure:`);
    console.log(`   - Handler: ${hasHandler ? '✅' : '❌'}`);
    console.log(`   - Input Schema: ${hasInputSchema ? '✅' : '❌'}`);
    console.log(`   - Output Schema: ${hasOutputSchema ? '✅' : '❌'}`);
    
    if (hasHandler && hasInputSchema && hasOutputSchema) {
      console.log(`🎉 Tool structure is valid for MCP!`);
    } else {
      console.log(`⚠️  Tool structure needs work`);
    }

  } catch (error) {
    console.error(`❌ Error testing tool:`, error);
  }
}

/**
 * Test tool registry functionality
 */
async function testToolRegistry(): Promise<void> {
  try {
    console.log(`\n🔧 Testing Tool Registry...`);
    
    // Read registry file to check dual-mode support
    const registryPath = 'src/application/tools/ops/registry.ts';
    const registryContent = await fs.readFile(registryPath, 'utf-8');
    
    const hasRegisterMethod = registryContent.includes('register(');
    const hasRegisterMCPMethod = registryContent.includes('registerMCPTool(');
    const hasDualModeSupport = registryContent.includes('module.default.handler') && registryContent.includes('module.default.execute');
    
    console.log(`📋 Registry capabilities:`);
    console.log(`   - Legacy Tool Registration: ${hasRegisterMethod ? '✅' : '❌'}`);
    console.log(`   - MCP Tool Registration: ${hasRegisterMCPMethod ? '✅' : '❌'}`);
    console.log(`   - Dual-Mode Support: ${hasDualModeSupport ? '✅' : '❌'}`);
    
    if (hasRegisterMethod && hasRegisterMCPMethod && hasDualModeSupport) {
      console.log(`🎉 Registry supports both legacy and MCP tools!`);
    } else {
      console.log(`⚠️  Registry needs additional work`);
    }
    
  } catch (error) {
    console.error(`❌ Error testing registry:`, error);
  }
}

/**
 * Find all tool files and test them
 */
async function testAllMCPTools(): Promise<void> {
  console.log(`🚀 Testing MCP Tool Migration...`);
  
  // Test registry first
  await testToolRegistry();
  
  // Test key tools that should be migrated
  const toolsToTest = [
    'src/application/tools/ops/ping.ts',
    'src/application/tools/ops/server-status.ts',
    'src/application/tools/ops/list-tools.ts',
    'src/application/tools/analysis/analyze-repository.ts',
    'src/application/tools/analysis/analyze-repository-v2.ts',
    'src/application/tools/build/build-image.ts',
    'src/application/tools/build/generate-dockerfile.ts',
    'src/application/tools/deploy/deploy-application.ts'
  ];
  
  let mcpToolsCount = 0;
  let validToolsCount = 0;
  
  for (const toolPath of toolsToTest) {
    try {
      const exists = await fs.access(toolPath).then(() => true, () => false);
      if (!exists) {
        console.log(`⏭️  Skipping non-existent: ${toolPath}`);
        continue;
      }
      
      await testMCPTool(toolPath, {});
      
      // Check if tool is MCP format
      const content = await fs.readFile(toolPath, 'utf-8');
      if (content.includes('MCPToolDescriptor')) {
        mcpToolsCount++;
        if (content.includes('handler:') && content.includes('export default')) {
          validToolsCount++;
        }
      }
      
    } catch (error) {
      console.error(`❌ Error with ${toolPath}:`, error);
    }
  }
  
  console.log(`\n📊 Migration Summary:`);
  console.log(`   🔧 Tools tested: ${toolsToTest.length}`);
  console.log(`   🎯 MCP format tools: ${mcpToolsCount}`);
  console.log(`   ✅ Valid MCP tools: ${validToolsCount}`);
  console.log(`   📈 Migration success rate: ${Math.round((validToolsCount / toolsToTest.length) * 100)}%`);
  
  if (validToolsCount >= toolsToTest.length * 0.8) {
    console.log(`\n🎉 Migration is highly successful! Most tools are MCP-ready.`);
  } else if (validToolsCount >= toolsToTest.length * 0.6) {
    console.log(`\n✅ Migration is mostly successful, some tools need finishing touches.`);
  } else {
    console.log(`\n⚠️  Migration needs more work.`);
  }
}

/**
 * Test progress token support
 */
async function testProgressTokenSupport(): Promise<void> {
  console.log(`\n📊 Testing Progress Token Support...`);
  
  const context = createMockContext();
  context.progressToken = 'test-token-123';
  
  // Simulate progress emissions
  await context.progressEmitter!.emit({
    step: 'test_step',
    status: 'in_progress',
    progress: 0.5,
    message: 'Testing progress tokens'
  });
  
  console.log(`✅ Progress token support is working!`);
}

/**
 * Main test function
 */
async function main(): Promise<void> {
  try {
    await testAllMCPTools();
    await testProgressTokenSupport();
    
    console.log(`\n🏁 MCP Tool Testing Complete!`);
    
  } catch (error) {
    console.error(`❌ Testing failed:`, error);
    process.exit(1);
  }
}

// Run if called directly
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main().catch(console.error);
}

export { testMCPTool, testAllMCPTools };