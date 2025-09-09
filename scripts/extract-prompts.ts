#!/usr/bin/env ts-node
/**
 * Prompt Extraction Script
 * 
 * Extracts prompts from the existing PromptRegistry and converts them 
 * to external YAML files organized by category.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { dump } from 'js-yaml';
import { fileURLToPath } from 'url';

// Import the existing prompt registry
import { PromptRegistry } from '../src/prompts/prompt-registry.js';
import { createLogger } from '../src/lib/logger/index.js';

/**
 * Schema for external YAML prompt files
 */
interface PromptYAML {
  metadata: {
    name: string;
    category: string;
    description: string;
    version: string;
    parameters: Array<{
      name: string;
      type: string;
      required: boolean;
      description: string;
    }>;
  };
  template: string;
}

/**
 * Extract parameters from a template string
 */
function extractParameters(template: string): Array<{ name: string; type: string }> {
  const params = new Set<string>();
  
  // Find {{variable}} patterns
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  matches.forEach(match => {
    const paramName = match.replace(/\{\{|\}\}/g, '');
    params.add(paramName);
  });

  // Find {{#condition}} patterns
  const conditionalMatches = template.match(/\{\{#(\w+)\}\}/g) || [];
  conditionalMatches.forEach(match => {
    const paramName = match.replace(/\{\{#|\}\}/g, '');
    params.add(paramName);
  });

  return Array.from(params).map(name => ({
    name,
    type: inferParameterType(name)
  }));
}

/**
 * Infer parameter type from name
 */
function inferParameterType(paramName: string): string {
  const booleanParams = ['hasTests', 'hasDocker', 'highAvailability', 'optimization', 'multistage'];
  const numberParams = ['replicas', 'fileCount', 'maxRetries', 'retryDelay', 'maxTokens'];
  
  if (booleanParams.includes(paramName)) return 'boolean';
  if (numberParams.includes(paramName)) return 'number';
  return 'string';
}

/**
 * Determine category directory from prompt name
 */
function getCategoryDirectory(name: string, category?: string): string {
  if (category) return category;
  
  // Infer from name
  if (name.includes('dockerfile')) return 'containerization';
  if (name.includes('k8s') || name.includes('kubernetes')) return 'orchestration';
  if (name.includes('security')) return 'security';
  if (name.includes('parameter') || name.includes('validation')) return 'validation';
  if (name.includes('sampling') || name.includes('strategy')) return 'sampling';
  if (name.includes('analysis') || name.includes('enhance')) return 'analysis';
  
  return 'general';
}

/**
 * Clean up template content
 */
function cleanTemplate(template: string): string {
  return template
    .trim()
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n');
}

/**
 * Extract all prompts and save to YAML files
 */
async function extractPrompts(): Promise<void> {
  const logger = createLogger('info');
  const registry = new PromptRegistry(logger);
  
  console.log('🔍 Extracting prompts from registry...');
  
  const promptNames = registry.getPromptNames();
  console.log(`📋 Found ${promptNames.length} prompts to extract`);

  let extracted = 0;
  const errors: string[] = [];

  for (const name of promptNames) {
    try {
      console.log(`📝 Processing: ${name}`);
      
      // Get prompt info
      const promptInfo = registry.getPromptInfo(name);
      if (!promptInfo) {
        errors.push(`Could not get info for prompt: ${name}`);
        continue;
      }

      // Get the actual prompt with template
      const promptResult = await registry.getPrompt(name, {});
      const prompt = registry['prompts'].get(name); // Access private property
      
      if (!prompt) {
        errors.push(`Could not access prompt definition: ${name}`);
        continue;
      }

      // Extract template parameters
      const templateParams = prompt.template ? extractParameters(prompt.template) : [];
      
      // Merge with defined arguments, prefer defined ones
      const allParams = new Map<string, any>();
      
      // Add template-extracted params first
      templateParams.forEach(param => {
        allParams.set(param.name, {
          name: param.name,
          type: param.type,
          required: false,
          description: `Template parameter: ${param.name}`
        });
      });
      
      // Override with defined arguments
      prompt.arguments.forEach(arg => {
        allParams.set(arg.name, {
          name: arg.name,
          type: typeof arg.required !== 'undefined' ? 'string' : 'string', // Simplify type inference
          required: arg.required || false,
          description: arg.description
        });
      });

      // Build YAML structure
      const yamlData: PromptYAML = {
        metadata: {
          name: prompt.name,
          category: prompt.category || getCategoryDirectory(name),
          description: prompt.description,
          version: '1.0',
          parameters: Array.from(allParams.values())
        },
        template: prompt.template ? cleanTemplate(prompt.template) : `Execute ${name} with provided arguments`
      };

      // Determine file path
      const category = yamlData.metadata.category;
      const outputDir = join('src', 'prompts', category);
      const outputFile = join(outputDir, `${name}.yaml`);

      // Ensure directory exists
      await mkdir(outputDir, { recursive: true });

      // Write YAML file
      const yamlContent = dump(yamlData, {
        lineWidth: 120,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false
      });

      await writeFile(outputFile, yamlContent, 'utf8');
      
      console.log(`✅ Extracted: ${name} -> ${outputFile}`);
      extracted++;

    } catch (error) {
      const errorMsg = `Failed to extract ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
    }
  }

  // Summary
  console.log('\n📊 Extraction Summary:');
  console.log(`✅ Successfully extracted: ${extracted} prompts`);
  console.log(`❌ Failed: ${errors.length} prompts`);

  if (errors.length > 0) {
    console.log('\n🚫 Errors encountered:');
    errors.forEach(error => console.log(`   - ${error}`));
  }

  // List directory structure
  console.log('\n📁 Created directory structure:');
  const categories = ['containerization', 'orchestration', 'security', 'validation', 'sampling', 'analysis'];
  for (const category of categories) {
    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir(join('src', 'prompts', category));
      console.log(`   src/prompts/${category}/ (${files.length} files)`);
      files.forEach(file => console.log(`     - ${file}`));
    } catch (error) {
      console.log(`   src/prompts/${category}/ (not created or empty)`);
    }
  }

  console.log('\n🎉 Prompt extraction completed!');
}

// Run the extraction
if (require.main === module) {
  extractPrompts().catch(error => {
    console.error('💥 Extraction failed:', error);
    process.exit(1);
  });
}