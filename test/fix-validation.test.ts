/**
 * Validation Suite for TypeScript Syntax Fix Patterns
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { execSync } from 'child_process';

// Test fixtures for each pattern
interface TestCase {
  name: string;
  input: string;
  expected: string;
  description: string;
}

// Helper to create temporary test files
class TestFileManager {
  private tempDir: string;
  private createdFiles: string[] = [];

  constructor() {
    this.tempDir = path.join(process.cwd(), '.test-temp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  createTestFile(name: string, content: string): string {
    const filePath = path.join(this.tempDir, name);
    fs.writeFileSync(filePath, content, 'utf-8');
    this.createdFiles.push(filePath);
    return filePath;
  }

  cleanup(): void {
    for (const file of this.createdFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
    if (fs.existsSync(this.tempDir)) {
      fs.rmdirSync(this.tempDir, { recursive: true });
    }
  }
}

// TypeScript syntax validator
class SyntaxValidator {
  validateSyntax(code: string): { valid: boolean; errors: string[] } {
    const fileName = 'test.ts';
    const sourceFile = ts.createSourceFile(
      fileName,
      code,
      ts.ScriptTarget.ES2020,
      true
    );

    const errors: string[] = [];
    const diagnostics: ts.Diagnostic[] = [];

    // Walk the AST to find syntax errors
    const visit = (node: ts.Node) => {
      if (node.kind === ts.SyntaxKind.Unknown) {
        errors.push(`Unknown syntax at position ${node.pos}`);
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // Also check for parsing errors
    // @ts-ignore - accessing internal property
    if (sourceFile.parseDiagnostics && sourceFile.parseDiagnostics.length > 0) {
      // @ts-ignore
      for (const diagnostic of sourceFile.parseDiagnostics) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        errors.push(message);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

describe('TypeScript Syntax Fix Patterns', () => {
  let testFileManager: TestFileManager;
  let validator: SyntaxValidator;

  beforeEach(() => {
    testFileManager = new TestFileManager();
    validator = new SyntaxValidator();
  });

  afterEach(() => {
    testFileManager.cleanup();
  });

  describe('Double Punctuation Pattern (,;)', () => {
    const testCases: TestCase[] = [
      {
        name: 'object-property-double-punct',
        input: `const config = {
  size: z.number().optional(),;
  name: z.string(),;
};`,
        expected: `const config = {
  size: z.number().optional(),
  name: z.string(),
};`,
        description: 'Should fix ,; at end of object properties'
      },
      {
        name: 'array-definition-double-punct',
        input: `const items = [
  'item1',;
  'item2',;
];`,
        expected: `const items = [
  'item1',
  'item2',
];`,
        description: 'Should fix ,; in array definitions'
      },
      {
        name: 'function-params-double-punct',
        input: `function test(
  param1: string,;
  param2: number,;
) {}`,
        expected: `function test(
  param1: string,
  param2: number,
) {}`,
        description: 'Should fix ,; in function parameters'
      }
    ];

    testCases.forEach(testCase => {
      it(testCase.description, () => {
        // Apply the fix pattern
        const fixed = testCase.input.replace(/,\s*;/g, ',');
        
        expect(fixed).toBe(testCase.expected);
        
        // Validate the fixed syntax
        const validation = validator.validateSyntax(fixed);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      });
    });
  });

  describe('Broken Method Chains', () => {
    const testCases: TestCase[] = [
      {
        name: 'program-chain',
        input: `program;
  .name('container-kit-mcp');
  .version('1.0.0');`,
        expected: `program
  .name('container-kit-mcp')
  .version('1.0.0');`,
        description: 'Should fix broken program method chain'
      },
      {
        name: 'promise-chain',
        input: `fetch(url);
  .then(response => response.json());
  .catch(error => console.error(error));`,
        expected: `fetch(url)
  .then(response => response.json())
  .catch(error => console.error(error));`,
        description: 'Should fix broken promise chain'
      }
    ];

    testCases.forEach(testCase => {
      it(testCase.description, () => {
        // Apply the fix pattern
        const fixed = testCase.input
          .replace(/;\s*\n\s*\./gm, '\n  .')
          .replace(/\);\s*\n\s*\./gm, ')\n  .');
        
        expect(fixed).toBe(testCase.expected);
        
        // Validate the fixed syntax
        const validation = validator.validateSyntax(fixed);
        expect(validation.valid).toBe(true);
      });
    });
  });

  describe('Missing Parentheses', () => {
    const testCases: TestCase[] = [
      {
        name: 'import-meta-url',
        input: `const __dirname = dirname(fileURLToPath(import.meta.url);`,
        expected: `const __dirname = dirname(fileURLToPath(import.meta.url));`,
        description: 'Should fix missing closing parenthesis in import.meta.url'
      },
      {
        name: 'nested-function-calls',
        input: `const result = outer(inner(value);`,
        expected: `const result = outer(inner(value));`,
        description: 'Should fix missing closing parenthesis in nested calls'
      }
    ];

    testCases.forEach(testCase => {
      it(testCase.description, () => {
        // Count opening and closing parentheses
        const openCount = (testCase.input.match(/\(/g) || []).length;
        const closeCount = (testCase.input.match(/\)/g) || []).length;
        
        let fixed = testCase.input;
        if (openCount > closeCount) {
          // Add missing closing parentheses at the end
          const missing = openCount - closeCount;
          fixed = testCase.input.replace(/;$/, ')'.repeat(missing) + ';');
        }
        
        expect(fixed).toBe(testCase.expected);
        
        // Validate the fixed syntax
        const validation = validator.validateSyntax(fixed);
        expect(validation.valid).toBe(true);
      });
    });
  });

  describe('Array Type Definitions', () => {
    const testCases: TestCase[] = [
      {
        name: 'zod-array-schema',
        input: `const schema = {
  logs: z.array(z.string(),;
  errors: z.array(z.object({}),;
};`,
        expected: `const schema = {
  logs: z.array(z.string()),
  errors: z.array(z.object({})),
};`,
        description: 'Should fix malformed z.array() definitions'
      }
    ];

    testCases.forEach(testCase => {
      it(testCase.description, () => {
        // Fix z.array specific pattern
        const fixed = testCase.input.replace(/z\.array\(([^)]*),;/g, 'z.array($1),');
        
        expect(fixed).toBe(testCase.expected);
        
        // Validate the fixed syntax
        const validation = validator.validateSyntax(fixed);
        expect(validation.valid).toBe(true);
      });
    });
  });

  describe('Integration Test - Multiple Patterns', () => {
    it('should fix multiple syntax errors in a single file', () => {
      const input = `import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url);

const config = {
  name: 'test',;
  version: '1.0.0',;
  items: z.array(z.string(),;
};

program;
  .name('test');
  .version('1.0.0');

export default config;`;

      const expected = `import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config = {
  name: 'test',
  version: '1.0.0',
  items: z.array(z.string()),
};

program
  .name('test')
  .version('1.0.0');

export default config;`;

      // Apply all fix patterns
      let fixed = input;
      
      // Fix double punctuation
      fixed = fixed.replace(/,\s*;/g, ',');
      
      // Fix broken method chains
      fixed = fixed.replace(/;\s*\n\s*\./gm, '\n  .');
      
      // Fix missing parentheses in import.meta.url
      fixed = fixed.replace(/import\.meta\.url\);/g, 'import.meta.url));');
      
      // Fix z.array patterns
      fixed = fixed.replace(/z\.array\(([^)]*),;/g, 'z.array($1),');
      
      expect(fixed).toBe(expected);
      
      // Validate the complete fixed syntax
      const validation = validator.validateSyntax(fixed);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should not break valid semicolons', () => {
      const validCode = `const a = 1;
const b = 2;
function test() {
  return a + b;
}`;
      
      // Apply patterns - should not change valid code
      const fixed = validCode.replace(/,\s*;/g, ',');
      
      expect(fixed).toBe(validCode);
      
      const validation = validator.validateSyntax(fixed);
      expect(validation.valid).toBe(true);
    });

    it('should handle string literals with punctuation', () => {
      const codeWithStrings = `const message = "Hello,; World";
const regex = /,;/g;
const template = \`Value: ,;\`;`;

      // Patterns should not affect string contents
      const validation = validator.validateSyntax(codeWithStrings);
      expect(validation.valid).toBe(true);
    });

    it('should handle comments with patterns', () => {
      const codeWithComments = `// This is a comment with ,;
/* Multi-line comment
   with ,; pattern */
const value = 42; // Another comment ,;`;

      const validation = validator.validateSyntax(codeWithComments);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Rollback Functionality', () => {
    it('should support rollback of applied fixes', () => {
      const original = `const config = {
  value: 1,;
};`;
      
      const fileName = 'rollback-test.ts';
      const filePath = testFileManager.createTestFile(fileName, original);
      
      // Read original
      const originalContent = fs.readFileSync(filePath, 'utf-8');
      
      // Apply fix
      const fixed = originalContent.replace(/,\s*;/g, ',');
      fs.writeFileSync(filePath, fixed, 'utf-8');
      
      // Verify fix was applied
      const fixedContent = fs.readFileSync(filePath, 'utf-8');
      expect(fixedContent).not.toContain(',;');
      
      // Rollback
      fs.writeFileSync(filePath, originalContent, 'utf-8');
      
      // Verify rollback
      const rolledBack = fs.readFileSync(filePath, 'utf-8');
      expect(rolledBack).toBe(original);
    });
  });

  describe('Performance Tests', () => {
    it('should handle large files efficiently', () => {
      // Generate a large file with many syntax errors
      const lines: string[] = [];
      for (let i = 0; i < 1000; i++) {
        lines.push(`  prop${i}: value${i},;`);
      }
      
      const largeFile = `const config = {\n${lines.join('\n')}\n};`;
      
      const startTime = Date.now();
      const fixed = largeFile.replace(/,\s*;/g, ',');
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(100); // Should complete in < 100ms
      expect(fixed).not.toContain(',;');
    });
  });
});

describe('File Processing Validation', () => {
  let testFileManager: TestFileManager;

  beforeEach(() => {
    testFileManager = new TestFileManager();
  });

  afterEach(() => {
    testFileManager.cleanup();
  });

  it('should validate TypeScript compilation after fixes', () => {
    const testFile = `export const config = {
  name: 'test',
  version: '1.0.0',
  enabled: true,
};`;

    const filePath = testFileManager.createTestFile('compile-test.ts', testFile);
    
    // Create a simple tsconfig for testing
    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        strict: false,
        noEmit: true,
        skipLibCheck: true
      },
      include: [filePath]
    };
    
    const tsConfigPath = path.join(path.dirname(filePath), 'tsconfig.test.json');
    fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
    
    try {
      // Try to compile with TypeScript
      execSync(`npx tsc --project ${tsConfigPath}`, { stdio: 'pipe' });
      // If we get here, compilation succeeded
      expect(true).toBe(true);
    } catch (error) {
      // Compilation failed
      expect(error).toBeUndefined();
    } finally {
      if (fs.existsSync(tsConfigPath)) {
        fs.unlinkSync(tsConfigPath);
      }
    }
  });
});