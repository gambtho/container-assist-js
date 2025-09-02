#!/usr/bin/env node

/**
 * TypeScript Syntax Fixer
 * AST-based tool to fix syntax errors in TypeScript files
 * Uses TypeScript Compiler API for safe, targeted fixes
 */

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Color codes for terminal output
const COLORS = {
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m'
};

// Fix pattern types
interface FixPattern {
  name: string;
  description: string;
  detector: (content: string) => boolean;
  fixer: (content: string) => string;
  validator?: (fixed: string) => boolean;
}

// Rollback manager to track changes
class RollbackManager {
  private backups: Map<string, string> = new Map();
  private gitStash: string | null = null;

  async createBackup(filePath: string, content: string): Promise<void> {
    this.backups.set(filePath, content);
  }

  async rollback(filePath: string): Promise<boolean> {
    const backup = this.backups.get(filePath);
    if (backup) {
      fs.writeFileSync(filePath, backup, 'utf-8');
      console.log(`${COLORS.YELLOW}↺ Rolled back: ${filePath}${COLORS.RESET}`);
      return true;
    }
    return false;
  }

  async createGitStash(): Promise<void> {
    try {
      const stashMessage = `typescript-fixer-backup-${Date.now()}`;
      execSync(`git stash push -m "${stashMessage}"`, { stdio: 'pipe' });
      this.gitStash = stashMessage;
      console.log(`${COLORS.BLUE}📦 Created git stash: ${stashMessage}${COLORS.RESET}`);
    } catch (error) {
      console.log(`${COLORS.YELLOW}⚠ Could not create git stash (may not be a git repo)${COLORS.RESET}`);
    }
  }

  async rollbackAll(): Promise<void> {
    for (const [filePath] of this.backups) {
      await this.rollback(filePath);
    }
    
    if (this.gitStash) {
      console.log(`${COLORS.BLUE}To restore git stash: git stash apply stash^{/${this.gitStash}}${COLORS.RESET}`);
    }
  }
}

// Fix patterns for common syntax errors
const FIX_PATTERNS: FixPattern[] = [
  {
    name: 'double-punctuation',
    description: 'Fix double punctuation (,; patterns)',
    detector: (content) => /,\s*;/g.test(content),
    fixer: (content) => content.replace(/,\s*;/g, ','),
    validator: (fixed) => !/,\s*;/.test(fixed)
  },
  {
    name: 'semicolon-comma',
    description: 'Fix semicolon followed by comma (;, patterns)',
    detector: (content) => /;\s*,/g.test(content),
    fixer: (content) => content.replace(/;\s*,/g, ','),
    validator: (fixed) => !/;\s*,/.test(fixed)
  },
  {
    name: 'trailing-comma-semicolon',
    description: 'Fix trailing ,; at end of lines',
    detector: (content) => /,;$/gm.test(content),
    fixer: (content) => content.replace(/,;$/gm, ','),
    validator: (fixed) => !/,;$/m.test(fixed)
  },
  {
    name: 'broken-method-chains',
    description: 'Fix broken method chains with semicolons',
    detector: (content) => /;\s*\n\s*\./gm.test(content),
    fixer: (content) => content.replace(/;\s*\n\s*\./gm, '\n  .'),
    validator: (fixed) => !/;\s*\n\s*\./.test(fixed)
  },
  {
    name: 'array-closing-paren',
    description: 'Fix missing closing parenthesis in array definitions',
    detector: (content) => /z\.array\([^)]*,;/g.test(content),
    fixer: (content) => content.replace(/z\.array\(([^)]*),;/g, 'z.array($1),'),
    validator: (fixed) => !/z\.array\([^)]*,;/.test(fixed)
  },
  {
    name: 'object-property-semicolon',
    description: 'Fix object properties ending with semicolon',
    detector: (content) => /^\s*\w+:\s*[^,\n]+;$/gm.test(content),
    fixer: (content) => {
      // More careful pattern to only fix object properties
      return content.replace(/^(\s*)(\w+):\s*([^,\n]+);$/gm, (match, indent, key, value) => {
        // Check if this looks like an object property (not a type definition)
        if (indent.length > 0 && !value.includes('=>') && !value.includes('function')) {
          return `${indent}${key}: ${value},`;
        }
        return match;
      });
    }
  },
  {
    name: 'import-missing-paren',
    description: 'Fix missing closing parenthesis in import statements',
    detector: (content) => /import\.meta\.url\);?[\s\n]*;/g.test(content),
    fixer: (content) => content.replace(/import\.meta\.url\);?([\s\n]*);/g, 'import.meta.url));'),
    validator: (fixed) => {
      const importMatches = fixed.match(/import\.meta\.url/g) || [];
      const closeParenAfter = fixed.match(/import\.meta\.url\)\)/g) || [];
      return importMatches.length === closeParenAfter.length;
    }
  },
  {
    name: 'missing-function-paren',
    description: 'Fix missing closing parenthesis in function calls',
    detector: (content) => /fileURLToPath\(import\.meta\.url\)[\s\n]*;/g.test(content),
    fixer: (content) => content.replace(/fileURLToPath\(import\.meta\.url\)([\s\n]*);/g, 'fileURLToPath(import.meta.url));'),
  }
];

// AST-based syntax validator
class ASTValidator {
  private program: ts.Program;
  private checker: ts.TypeChecker;

  constructor(filePaths: string[]) {
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Node,
      esModuleInterop: true,
      skipLibCheck: true,
      allowJs: false,
      strict: false,
      noEmit: true
    };

    this.program = ts.createProgram(filePaths, compilerOptions);
    this.checker = this.program.getTypeChecker();
  }

  getSyntaxErrors(filePath: string): ts.Diagnostic[] {
    const sourceFile = this.program.getSourceFile(filePath);
    if (!sourceFile) return [];

    const syntaxErrors = this.program.getSyntacticDiagnostics(sourceFile);
    return syntaxErrors;
  }

  validateFile(filePath: string): { valid: boolean; errors: string[] } {
    const errors = this.getSyntaxErrors(filePath);
    
    if (errors.length === 0) {
      return { valid: true, errors: [] };
    }

    const errorMessages = errors.map(diagnostic => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      const { line, character } = diagnostic.file!.getLineAndCharacterOfPosition(diagnostic.start!);
      return `Line ${line + 1}:${character + 1} - ${message}`;
    });

    return { valid: false, errors: errorMessages };
  }
}

// Main fixer class
class TypeScriptSyntaxFixer {
  private rollbackManager = new RollbackManager();
  private fixStats = {
    filesProcessed: 0,
    filesFixed: 0,
    patternsApplied: new Map<string, number>(),
    errors: [] as string[]
  };

  async fixFile(filePath: string, patterns: FixPattern[], dryRun: boolean = false): Promise<boolean> {
    console.log(`\n${COLORS.BLUE}Processing: ${filePath}${COLORS.RESET}`);
    
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      console.error(`${COLORS.RED}✗ Failed to read file: ${error}${COLORS.RESET}`);
      this.fixStats.errors.push(`Failed to read ${filePath}: ${error}`);
      return false;
    }

    // Create backup
    await this.rollbackManager.createBackup(filePath, content);

    let modified = false;
    let fixedContent = content;

    // Apply each pattern
    for (const pattern of patterns) {
      if (pattern.detector(fixedContent)) {
        console.log(`  ${COLORS.YELLOW}→ Applying: ${pattern.description}${COLORS.RESET}`);
        
        const beforeFix = fixedContent;
        fixedContent = pattern.fixer(fixedContent);
        
        if (pattern.validator && !pattern.validator(fixedContent)) {
          console.log(`  ${COLORS.RED}✗ Validation failed for ${pattern.name}${COLORS.RESET}`);
          fixedContent = beforeFix; // Rollback this specific fix
        } else {
          modified = true;
          const count = this.fixStats.patternsApplied.get(pattern.name) || 0;
          this.fixStats.patternsApplied.set(pattern.name, count + 1);
        }
      }
    }

    if (modified) {
      if (dryRun) {
        console.log(`  ${COLORS.GREEN}✓ Would fix file (dry run)${COLORS.RESET}`);
      } else {
        // Validate with TypeScript compiler before writing
        const tempFile = filePath + '.tmp';
        fs.writeFileSync(tempFile, fixedContent, 'utf-8');
        
        const validator = new ASTValidator([tempFile]);
        const validation = validator.validateFile(tempFile);
        
        if (validation.errors.length > 0) {
          // Check if we reduced the error count
          const originalValidator = new ASTValidator([filePath]);
          const originalValidation = originalValidator.validateFile(filePath);
          
          if (validation.errors.length < originalValidation.errors.length) {
            console.log(`  ${COLORS.GREEN}✓ Reduced errors from ${originalValidation.errors.length} to ${validation.errors.length}${COLORS.RESET}`);
            fs.writeFileSync(filePath, fixedContent, 'utf-8');
            this.fixStats.filesFixed++;
          } else {
            console.log(`  ${COLORS.YELLOW}⚠ No improvement in error count, skipping${COLORS.RESET}`);
            await this.rollbackManager.rollback(filePath);
          }
        } else {
          console.log(`  ${COLORS.GREEN}✓ Fixed successfully - no syntax errors!${COLORS.RESET}`);
          fs.writeFileSync(filePath, fixedContent, 'utf-8');
          this.fixStats.filesFixed++;
        }
        
        // Clean up temp file
        fs.unlinkSync(tempFile);
      }
    } else {
      console.log(`  ${COLORS.BLUE}ℹ No patterns matched${COLORS.RESET}`);
    }

    this.fixStats.filesProcessed++;
    return modified;
  }

  async fixDirectory(dirPath: string, patterns: FixPattern[], dryRun: boolean = false): Promise<void> {
    const files = this.getTypeScriptFiles(dirPath);
    
    console.log(`${COLORS.BOLD}Found ${files.length} TypeScript files${COLORS.RESET}`);
    
    // Create git stash for safety
    await this.rollbackManager.createGitStash();
    
    for (const file of files) {
      await this.fixFile(file, patterns, dryRun);
    }
    
    this.printStats();
  }

  private getTypeScriptFiles(dirPath: string): string[] {
    const files: string[] = [];
    
    const walk = (dir: string) => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          walk(fullPath);
        } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.tsx'))) {
          files.push(fullPath);
        }
      }
    };
    
    walk(dirPath);
    return files;
  }

  private printStats(): void {
    console.log(`\n${COLORS.BOLD}=== Fix Statistics ===${COLORS.RESET}`);
    console.log(`Files processed: ${this.fixStats.filesProcessed}`);
    console.log(`Files fixed: ${this.fixStats.filesFixed}`);
    
    if (this.fixStats.patternsApplied.size > 0) {
      console.log(`\n${COLORS.BOLD}Patterns Applied:${COLORS.RESET}`);
      for (const [pattern, count] of this.fixStats.patternsApplied) {
        console.log(`  ${pattern}: ${count} times`);
      }
    }
    
    if (this.fixStats.errors.length > 0) {
      console.log(`\n${COLORS.RED}Errors:${COLORS.RESET}`);
      for (const error of this.fixStats.errors) {
        console.log(`  ${error}`);
      }
    }
  }

  async emergencyRollback(): Promise<void> {
    console.log(`\n${COLORS.YELLOW}${COLORS.BOLD}Emergency Rollback Initiated${COLORS.RESET}`);
    await this.rollbackManager.rollbackAll();
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
${COLORS.BOLD}TypeScript Syntax Fixer${COLORS.RESET}

Usage:
  ts-node typescript-syntax-fixer.ts [options] <path>

Options:
  --dry-run     Show what would be fixed without making changes
  --patterns    Comma-separated list of patterns to apply
  --rollback    Rollback all changes from this session
  --help        Show this help message

Available patterns:
${FIX_PATTERNS.map(p => `  ${p.name}: ${p.description}`).join('\n')}

Examples:
  ts-node typescript-syntax-fixer.ts src/
  ts-node typescript-syntax-fixer.ts --dry-run src/service/
  ts-node typescript-syntax-fixer.ts --patterns double-punctuation,broken-method-chains src/
`);
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const rollback = args.includes('--rollback');
  
  const fixer = new TypeScriptSyntaxFixer();
  
  if (rollback) {
    await fixer.emergencyRollback();
    process.exit(0);
  }

  // Get patterns to apply
  let patternsToApply = FIX_PATTERNS;
  const patternsArg = args.find(arg => arg.startsWith('--patterns='));
  if (patternsArg) {
    const patternNames = patternsArg.split('=')[1].split(',');
    patternsToApply = FIX_PATTERNS.filter(p => patternNames.includes(p.name));
    console.log(`${COLORS.BLUE}Using patterns: ${patternNames.join(', ')}${COLORS.RESET}`);
  }

  // Get path to process
  const targetPath = args.find(arg => !arg.startsWith('--'));
  if (!targetPath) {
    console.error(`${COLORS.RED}Error: No path specified${COLORS.RESET}`);
    process.exit(1);
  }

  const fullPath = path.resolve(targetPath);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`${COLORS.RED}Error: Path does not exist: ${fullPath}${COLORS.RESET}`);
    process.exit(1);
  }

  const stat = fs.statSync(fullPath);
  
  if (stat.isDirectory()) {
    await fixer.fixDirectory(fullPath, patternsToApply, dryRun);
  } else {
    await fixer.fixFile(fullPath, patternsToApply, dryRun);
  }
}

// Run the tool
main().catch(error => {
  console.error(`${COLORS.RED}Fatal error: ${error}${COLORS.RESET}`);
  process.exit(1);
});