"use strict";
/**
 * Fix Patterns Library - Team Charlie
 * Reusable patterns and utilities for fixing TypeScript syntax errors
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeScriptFixer = exports.TypeScriptAnalyzer = exports.PatternRegistry = exports.TrailingCommaFix = exports.ExtraSemicolonFix = exports.ObjectPropertySemicolonFix = exports.ZodArrayFix = exports.MissingParenthesisFix = exports.BrokenMethodChainFix = exports.SemicolonCommaFix = exports.DoublePunctuationFix = exports.FixPattern = void 0;
const ts = __importStar(require("typescript"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class FixPattern {
    validate(original, fixed) {
        // Default validation - check that something changed
        return original !== fixed;
    }
}
exports.FixPattern = FixPattern;
// Concrete fix pattern implementations
class DoublePunctuationFix extends FixPattern {
    constructor() {
        super(...arguments);
        this.name = 'double-punctuation';
        this.description = 'Fix ,; patterns at end of lines';
    }
    detect(context) {
        return /,\s*;/g.test(context.content);
    }
    apply(context) {
        return context.content.replace(/,\s*;/g, ',');
    }
    validate(original, fixed) {
        return !/,\s*;/.test(fixed);
    }
}
exports.DoublePunctuationFix = DoublePunctuationFix;
class SemicolonCommaFix extends FixPattern {
    constructor() {
        super(...arguments);
        this.name = 'semicolon-comma';
        this.description = 'Fix ;, patterns';
    }
    detect(context) {
        return /;\s*,/g.test(context.content);
    }
    apply(context) {
        return context.content.replace(/;\s*,/g, ',');
    }
}
exports.SemicolonCommaFix = SemicolonCommaFix;
class BrokenMethodChainFix extends FixPattern {
    constructor() {
        super(...arguments);
        this.name = 'broken-method-chain';
        this.description = 'Fix method chains broken by semicolons';
    }
    detect(context) {
        return /;\s*\n\s*\./gm.test(context.content);
    }
    apply(context) {
        let fixed = context.content;
        // Fix semicolon before dot on new line
        fixed = fixed.replace(/;\s*\n\s*\./gm, '\n  .');
        // Fix parenthesis-semicolon before dot
        fixed = fixed.replace(/\);\s*\n\s*\./gm, ')\n  .');
        return fixed;
    }
}
exports.BrokenMethodChainFix = BrokenMethodChainFix;
class MissingParenthesisFix extends FixPattern {
    constructor() {
        super(...arguments);
        this.name = 'missing-parenthesis';
        this.description = 'Fix missing closing parentheses';
    }
    detect(context) {
        // Check for common patterns with missing parens
        const patterns = [
            /fileURLToPath\(import\.meta\.url\)[\s\n]*;/,
            /dirname\([^)]+\)[\s\n]*;/,
            /\([^)]*\)[^)]*;$/gm
        ];
        return patterns.some(pattern => pattern.test(context.content));
    }
    apply(context) {
        let fixed = context.content;
        // Fix import.meta.url pattern
        fixed = fixed.replace(/const\s+__dirname\s*=\s*dirname\(fileURLToPath\(import\.meta\.url\)\s*;/g, 'const __dirname = dirname(fileURLToPath(import.meta.url));');
        // Fix other fileURLToPath patterns
        fixed = fixed.replace(/fileURLToPath\(import\.meta\.url\)(\s*);/g, 'fileURLToPath(import.meta.url));');
        return fixed;
    }
}
exports.MissingParenthesisFix = MissingParenthesisFix;
class ZodArrayFix extends FixPattern {
    constructor() {
        super(...arguments);
        this.name = 'zod-array';
        this.description = 'Fix malformed z.array() definitions';
    }
    detect(context) {
        return /z\.array\([^)]*,;/g.test(context.content);
    }
    apply(context) {
        return context.content.replace(/z\.array\(([^)]*),;/g, 'z.array($1),');
    }
}
exports.ZodArrayFix = ZodArrayFix;
class ObjectPropertySemicolonFix extends FixPattern {
    constructor() {
        super(...arguments);
        this.name = 'object-property-semicolon';
        this.description = 'Fix object properties ending with semicolon instead of comma';
    }
    detect(context) {
        // Look for object property patterns ending with semicolon
        return /^\s{2,}\w+:\s*[^,\n]+;$/gm.test(context.content);
    }
    apply(context) {
        return context.content.replace(/^(\s{2,})(\w+):\s*([^,\n]+);$/gm, (match, indent, key, value) => {
            // Don't fix if it looks like a type definition or statement
            if (value.includes('=>') || value.includes('function') || value.includes('class')) {
                return match;
            }
            // Don't fix if it's the last property before closing brace
            const nextLineMatch = context.content.substring(context.content.indexOf(match) + match.length).match(/^\s*}/m);
            if (nextLineMatch) {
                return `${indent}${key}: ${value}`; // No comma for last property
            }
            return `${indent}${key}: ${value},`;
        });
    }
}
exports.ObjectPropertySemicolonFix = ObjectPropertySemicolonFix;
class ExtraSemicolonFix extends FixPattern {
    constructor() {
        super(...arguments);
        this.name = 'extra-semicolon';
        this.description = 'Remove extra semicolons';
    }
    detect(context) {
        return /;;+/g.test(context.content);
    }
    apply(context) {
        return context.content.replace(/;;+/g, ';');
    }
}
exports.ExtraSemicolonFix = ExtraSemicolonFix;
class TrailingCommaFix extends FixPattern {
    constructor() {
        super(...arguments);
        this.name = 'trailing-comma';
        this.description = 'Fix trailing comma issues';
    }
    detect(context) {
        // Detect comma before closing brackets/braces
        return /,\s*[}\]]/g.test(context.content);
    }
    apply(context) {
        // This is actually often valid in TypeScript, so be careful
        // Only fix if it's causing an error
        if (context.diagnostics) {
            const hasTrailingCommaError = context.diagnostics.some(d => d.code === 1109 && context.content.substring(d.start, d.start + 10).includes(','));
            if (hasTrailingCommaError) {
                return context.content.replace(/,(\s*[}\]])/g, '$1');
            }
        }
        return context.content;
    }
}
exports.TrailingCommaFix = TrailingCommaFix;
// Pattern registry
class PatternRegistry {
    constructor() {
        this.patterns = new Map();
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
    register(pattern) {
        this.patterns.set(pattern.name, pattern);
    }
    get(name) {
        return this.patterns.get(name);
    }
    getAll() {
        return Array.from(this.patterns.values());
    }
    getByNames(names) {
        return names
            .map(name => this.patterns.get(name))
            .filter((p) => p !== undefined);
    }
}
exports.PatternRegistry = PatternRegistry;
// AST-based analyzer
class TypeScriptAnalyzer {
    constructor() {
        this.program = null;
    }
    analyze(filePath, content) {
        const actualContent = content || fs.readFileSync(filePath, 'utf-8');
        const compilerOptions = {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
            esModuleInterop: true,
            skipLibCheck: true,
            noEmit: true
        };
        // Create a source file
        const sourceFile = ts.createSourceFile(filePath, actualContent, ts.ScriptTarget.ES2020, true);
        // Create a program for more detailed analysis
        this.program = ts.createProgram([filePath], compilerOptions, {
            getSourceFile: (fileName) => {
                if (fileName === filePath) {
                    return sourceFile;
                }
                return undefined;
            },
            writeFile: () => { },
            getCurrentDirectory: () => process.cwd(),
            getDirectories: () => [],
            fileExists: (fileName) => fileName === filePath,
            readFile: (fileName) => fileName === filePath ? actualContent : undefined,
            getCanonicalFileName: (fileName) => fileName,
            useCaseSensitiveFileNames: () => true,
            getNewLine: () => '\n',
            getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options)
        });
        const diagnostics = this.program.getSyntacticDiagnostics(sourceFile);
        return {
            filePath,
            content: actualContent,
            sourceFile,
            diagnostics: Array.from(diagnostics)
        };
    }
    getErrorCount(context) {
        return context.diagnostics?.length || 0;
    }
    getErrorSummary(context) {
        const summary = new Map();
        if (context.diagnostics) {
            for (const diagnostic of context.diagnostics) {
                const count = summary.get(diagnostic.code) || 0;
                summary.set(diagnostic.code, count + 1);
            }
        }
        return summary;
    }
}
exports.TypeScriptAnalyzer = TypeScriptAnalyzer;
// Main fixer class that orchestrates everything
class TypeScriptFixer {
    constructor() {
        this.registry = new PatternRegistry();
        this.analyzer = new TypeScriptAnalyzer();
    }
    async fixFile(filePath, options = {}) {
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
        const appliedPatterns = [];
        for (const pattern of patterns) {
            const context = {
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
    async fixDirectory(dirPath, options = {}) {
        const results = new Map();
        const files = this.getTypeScriptFiles(dirPath, options.exclude);
        for (const file of files) {
            const result = await this.fixFile(file, options);
            results.set(file, result);
        }
        return results;
    }
    getTypeScriptFiles(dirPath, exclude = []) {
        const files = [];
        const excludeSet = new Set([...exclude, 'node_modules', '.git', 'dist', 'build']);
        const walk = (dir) => {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                if (excludeSet.has(item))
                    continue;
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    walk(fullPath);
                }
                else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.tsx'))) {
                    files.push(fullPath);
                }
            }
        };
        walk(dirPath);
        return files;
    }
    getRegistry() {
        return this.registry;
    }
}
exports.TypeScriptFixer = TypeScriptFixer;
// Export everything
exports.default = TypeScriptFixer;
