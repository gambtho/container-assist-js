/**
 * Fix Patterns Library
 * Reusable patterns and utilities for fixing TypeScript syntax errors
 */

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

export interface FixResult {
  success: boolean;
  originalContent: string;
  fixedContent: string;
  patternsApplied: string[];
  errorsBefore: number;
  errorsAfter: number;
  message?: string;
}

export interface FixContext {
  filePath: string;
  content: string;
  sourceFile?: ts.SourceFile;
  diagnostics?: ts.Diagnostic[];
}

export abstract class FixPattern {
  abstract name: string;
  abstract description: string;
  
  abstract detect(context: FixContext): boolean;
  abstract apply(context: FixContext): string;
  
  validate(original: string, fixed: string): boolean {
    // Default validation - check that something changed
    return original !== fixed;
  }
}

// Concrete fix pattern implementations
export class DoublePunctuationFix extends FixPattern {
  name = 'double-punctuation';
  description = 'Fix ,; patterns at end of lines';
  
  detect(context: FixContext): boolean {
    return /,\s*;/g.test(context.content);
  }
  
  apply(context: FixContext): string {
    return context.content.replace(/,\s*;/g, ',');
  }
  
  validate(original: string, fixed: string): boolean {
    return !/,\s*;/.test(fixed);
  }
}

export class SemicolonCommaFix extends FixPattern {
  name = 'semicolon-comma';
  description = 'Fix ;, patterns';
  
  detect(context: FixContext): boolean {
    return /;\s*,/g.test(context.content);
  }
  
  apply(context: FixContext): string {
    return context.content.replace(/;\s*,/g, ',');
  }
}

export class BrokenMethodChainFix extends FixPattern {
  name = 'broken-method-chain';
  description = 'Fix method chains broken by semicolons';
  
  detect(context: FixContext): boolean {
    return /;\s*\n\s*\./gm.test(context.content);
  }
  
  apply(context: FixContext): string {
    let fixed = context.content;
    
    // Fix semicolon before dot on new line
    fixed = fixed.replace(/;\s*\n\s*\./gm, '\n  .');
    
    // Fix parenthesis-semicolon before dot
    fixed = fixed.replace(/\);\s*\n\s*\./gm, ')\n  .');
    
    return fixed;
  }
}

export class MissingParenthesisFix extends FixPattern {
  name = 'missing-parenthesis';
  description = 'Fix missing closing parentheses';
  
  detect(context: FixContext): boolean {
    // Check for common patterns with missing parens
    const patterns = [
      /fileURLToPath\(import\.meta\.url\)[\s\n]*;/,
      /dirname\([^)]+\)[\s\n]*;/,
      /\([^)]*\)[^)]*;$/gm
    ];
    
    return patterns.some(pattern => pattern.test(context.content));
  }
  
  apply(context: FixContext): string {
    let fixed = context.content;
    
    // Fix import.meta.url pattern
    fixed = fixed.replace(
      /const\s+__dirname\s*=\s*dirname\(fileURLToPath\(import\.meta\.url\)\s*;/g,
      'const __dirname = dirname(fileURLToPath(import.meta.url));'
    );
    
    // Fix other fileURLToPath patterns
    fixed = fixed.replace(
      /fileURLToPath\(import\.meta\.url\)(\s*);/g,
      'fileURLToPath(import.meta.url));'
    );
    
    return fixed;
  }
}

export class ZodArrayFix extends FixPattern {
  name = 'zod-array';
  description = 'Fix malformed z.array() definitions';
  
  detect(context: FixContext): boolean {
    return /z\.array\([^)]*,;/g.test(context.content);
  }
  
  apply(context: FixContext): string {
    return context.content.replace(/z\.array\(([^)]*),;/g, 'z.array($1),');
  }
}

export class ObjectPropertySemicolonFix extends FixPattern {
  name = 'object-property-semicolon';
  description = 'Fix object properties ending with semicolon instead of comma';
  
  detect(context: FixContext): boolean {
    // Look for object property patterns ending with semicolon
    return /^\s{2,}\w+:\s*[^,\n]+;$/gm.test(context.content);
  }
  
  apply(context: FixContext): string {
    return context.content.replace(
      /^(\s{2,})(\w+):\s*([^,\n]+);$/gm,
      (match, indent, key, value) => {
        // Don't fix if it looks like a type definition or statement
        if (value.includes('=>') || value.includes('function') || value.includes('class')) {
          return match;
        }
        // Don't fix if it's the last property before closing brace
        const nextLineMatch = context.content.substring(
          context.content.indexOf(match) + match.length
        ).match(/^\s*}/m);
        
        if (nextLineMatch) {
          return `${indent}${key}: ${value}`; // No comma for last property
        }
        
        return `${indent}${key}: ${value},`;
      }
    );
  }
}

export class ExtraSemicolonFix extends FixPattern {
  name = 'extra-semicolon';
  description = 'Remove extra semicolons';
  
  detect(context: FixContext): boolean {
    return /;;+/g.test(context.content);
  }
  
  apply(context: FixContext): string {
    return context.content.replace(/;;+/g, ';');
  }
}

export class TrailingCommaFix extends FixPattern {
  name = 'trailing-comma';
  description = 'Fix trailing comma issues';
  
  detect(context: FixContext): boolean {
    // Detect comma before closing brackets/braces
    return /,\s*[}\]]/g.test(context.content);
  }
  
  apply(context: FixContext): string {
    // This is actually often valid in TypeScript, so be careful
    // Only fix if it's causing an error
    if (context.diagnostics) {
      const hasTrailingCommaError = context.diagnostics.some(d => 
        d.code === 1109 && context.content.substring(d.start!, d.start! + 10).includes(',')
      );
      
      if (hasTrailingCommaError) {
        return context.content.replace(/,(\s*[}\]])/g, '$1');
      }
    }
    
    return context.content;
  }
}

// Pattern registry
export class PatternRegistry {
  private patterns: Map<string, FixPattern> = new Map();
  
  constructor() {
    // Register default patterns
    this.register(new DoublePunctuationFix());
    this.register(new SemicolonCommaFix());
    this.register(new BrokenMethodChainFix());
    this.register(new MissingParenthesisFix());
    this.register(new ZodArrayFix());
    this.register(new ObjectPropertySemicolonFix());
    this.register(new ExtraSemicolonFix());
    this.register(new TrailingCommaFix());
  }
  
  register(pattern: FixPattern): void {
    this.patterns.set(pattern.name, pattern);
  }
  
  get(name: string): FixPattern | undefined {
    return this.patterns.get(name);
  }
  
  getAll(): FixPattern[] {
    return Array.from(this.patterns.values());
  }
  
  getByNames(names: string[]): FixPattern[] {
    return names
      .map(name => this.patterns.get(name))
      .filter((p): p is FixPattern => p !== undefined);
  }
}

// AST-based analyzer
export class TypeScriptAnalyzer {
  private program: ts.Program | null = null;
  
  analyze(filePath: string, content?: string): FixContext {
    const actualContent = content || fs.readFileSync(filePath, 'utf-8');
    
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Node,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true
    };
    
    // Create a source file
    const sourceFile = ts.createSourceFile(
      filePath,
      actualContent,
      ts.ScriptTarget.ES2020,
      true
    );
    
    // Create a program for more detailed analysis
    this.program = ts.createProgram([filePath], compilerOptions, {
      getSourceFile: (fileName) => {
        if (fileName === filePath) {
          return sourceFile;
        }
        return undefined;
      },
      writeFile: () => {},
      getCurrentDirectory: () => process.cwd(),
      getDirectories: () => [],
      fileExists: (fileName) => fileName === filePath,
      readFile: (fileName) => fileName === filePath ? actualContent : undefined,
      getCanonicalFileName: (fileName) => fileName,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n'
    });
    
    const diagnostics = this.program.getSyntacticDiagnostics(sourceFile);
    
    return {
      filePath,
      content: actualContent,
      sourceFile,
      diagnostics: Array.from(diagnostics)
    };
  }
  
  getErrorCount(context: FixContext): number {
    return context.diagnostics?.length || 0;
  }
  
  getErrorSummary(context: FixContext): Map<number, number> {
    const summary = new Map<number, number>();
    
    if (context.diagnostics) {
      for (const diagnostic of context.diagnostics) {
        const count = summary.get(diagnostic.code) || 0;
        summary.set(diagnostic.code, count + 1);
      }
    }
    
    return summary;
  }
}

// Main fixer class that orchestrates everything
export class TypeScriptFixer {
  private registry: PatternRegistry;
  private analyzer: TypeScriptAnalyzer;
  
  constructor() {
    this.registry = new PatternRegistry();
    this.analyzer = new TypeScriptAnalyzer();
  }
  
  async fixFile(
    filePath: string,
    options: {
      patterns?: string[];
      dryRun?: boolean;
      backup?: boolean;
    } = {}
  ): Promise<FixResult> {
    const originalContent = fs.readFileSync(filePath, 'utf-8');
    
    // Create backup if requested
    if (options.backup && !options.dryRun) {
      const backupPath = `${filePath}.backup.${Date.now()}`;
      fs.writeFileSync(backupPath, originalContent, 'utf-8');
    }
    
    // Analyze original file
    const originalContext = this.analyzer.analyze(filePath, originalContent);
    const errorsBefore = this.analyzer.getErrorCount(originalContext);
    
    // Get patterns to apply
    const patterns = options.patterns 
      ? this.registry.getByNames(options.patterns)
      : this.registry.getAll();
    
    // Apply fixes
    let fixedContent = originalContent;
    const appliedPatterns: string[] = [];
    
    for (const pattern of patterns) {
      const context: FixContext = {
        ...originalContext,
        content: fixedContent
      };
      
      if (pattern.detect(context)) {
        const afterFix = pattern.apply(context);
        
        if (pattern.validate(fixedContent, afterFix)) {
          fixedContent = afterFix;
          appliedPatterns.push(pattern.name);
        }
      }
    }
    
    // Analyze fixed content
    const fixedContext = this.analyzer.analyze(filePath, fixedContent);
    const errorsAfter = this.analyzer.getErrorCount(fixedContext);
    
    // Write fixed content if not dry run and there's improvement
    const success = errorsAfter < errorsBefore || (errorsBefore === 0 && appliedPatterns.length > 0);
    
    if (!options.dryRun && success && fixedContent !== originalContent) {
      fs.writeFileSync(filePath, fixedContent, 'utf-8');
    }
    
    return {
      success,
      originalContent,
      fixedContent,
      patternsApplied: appliedPatterns,
      errorsBefore,
      errorsAfter,
      message: options.dryRun 
        ? `[DRY RUN] Would apply ${appliedPatterns.length} patterns`
        : `Applied ${appliedPatterns.length} patterns, reduced errors from ${errorsBefore} to ${errorsAfter}`
    };
  }
  
  async fixDirectory(
    dirPath: string,
    options: {
      patterns?: string[];
      dryRun?: boolean;
      backup?: boolean;
      exclude?: string[];
    } = {}
  ): Promise<Map<string, FixResult>> {
    const results = new Map<string, FixResult>();
    const files = this.getTypeScriptFiles(dirPath, options.exclude);
    
    for (const file of files) {
      const result = await this.fixFile(file, options);
      results.set(file, result);
    }
    
    return results;
  }
  
  private getTypeScriptFiles(dirPath: string, exclude: string[] = []): string[] {
    const files: string[] = [];
    const excludeSet = new Set([...exclude, 'node_modules', '.git', 'dist', 'build']);
    
    const walk = (dir: string) => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        if (excludeSet.has(item)) continue;
        
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.tsx'))) {
          files.push(fullPath);
        }
      }
    };
    
    walk(dirPath);
    return files;
  }
  
  getRegistry(): PatternRegistry {
    return this.registry;
  }
}

// Export everything
export default TypeScriptFixer;