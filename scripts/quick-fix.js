#!/usr/bin/env ts-node
"use strict";
/**
 * Quick Fix CLI - Team Charlie
 * Simple CLI wrapper for the fix patterns library
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fix_patterns_library_js_1 = __importDefault(require("./fix-patterns-library.js"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const COLORS = {
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    CYAN: '\x1b[36m',
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m'
};
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        showHelp();
        process.exit(0);
    }
    const options = {
        dryRun: args.includes('--dry-run') || args.includes('-n'),
        backup: args.includes('--backup') || args.includes('-b'),
        verbose: args.includes('--verbose') || args.includes('-v'),
        patterns: [],
        exclude: []
    };
    // Parse patterns
    const patternsIndex = args.findIndex(arg => arg === '--patterns' || arg === '-p');
    if (patternsIndex !== -1 && args[patternsIndex + 1]) {
        options.patterns = args[patternsIndex + 1].split(',');
    }
    // Parse excludes
    const excludeIndex = args.findIndex(arg => arg === '--exclude' || arg === '-e');
    if (excludeIndex !== -1 && args[excludeIndex + 1]) {
        options.exclude = args[excludeIndex + 1].split(',');
    }
    // Get target path
    const targetPath = args.find(arg => !arg.startsWith('-'));
    if (!targetPath) {
        console.error(`${COLORS.RED}Error: No path specified${COLORS.RESET}`);
        process.exit(1);
    }
    const fullPath = path.resolve(targetPath);
    console.log(`${COLORS.BOLD}${COLORS.CYAN}TypeScript Syntax Quick Fix${COLORS.RESET}`);
    console.log(`${COLORS.BLUE}Target: ${fullPath}${COLORS.RESET}`);
    if (options.dryRun) {
        console.log(`${COLORS.YELLOW}Running in DRY RUN mode - no files will be modified${COLORS.RESET}`);
    }
    if (options.backup) {
        console.log(`${COLORS.GREEN}Backup enabled - original files will be preserved${COLORS.RESET}`);
    }
    // Create git stash for safety
    try {
        const stashMessage = `quick-fix-backup-${Date.now()}`;
        (0, child_process_1.execSync)(`git stash push -m "${stashMessage}"`, { stdio: 'pipe', cwd: process.cwd() });
        console.log(`${COLORS.BLUE}Created git stash: ${stashMessage}${COLORS.RESET}`);
    }
    catch {
        // Ignore if not a git repo
    }
    const fixer = new fix_patterns_library_js_1.default();
    // Show available patterns
    if (options.patterns.length === 0) {
        console.log(`\n${COLORS.BOLD}Using all available patterns:${COLORS.RESET}`);
        const registry = fixer.getRegistry();
        for (const pattern of registry.getAll()) {
            console.log(`  • ${pattern.name}: ${pattern.description}`);
        }
    }
    else {
        console.log(`\n${COLORS.BOLD}Using patterns: ${options.patterns.join(', ')}${COLORS.RESET}`);
    }
    console.log('\n' + '─'.repeat(60) + '\n');
    try {
        const startTime = Date.now();
        const results = await fixer.fixDirectory(fullPath, {
            patterns: options.patterns.length > 0 ? options.patterns : undefined,
            dryRun: options.dryRun,
            backup: options.backup,
            exclude: options.exclude
        });
        // Print results
        let totalFixed = 0;
        let totalErrors = 0;
        let totalErrorsReduced = 0;
        for (const [file, result] of results) {
            const relativePath = path.relative(process.cwd(), file);
            if (result.patternsApplied.length > 0) {
                totalFixed++;
                if (options.verbose || result.success) {
                    console.log(`${COLORS.GREEN}✓${COLORS.RESET} ${relativePath}`);
                    if (result.errorsBefore > 0) {
                        const reduction = result.errorsBefore - result.errorsAfter;
                        totalErrorsReduced += reduction;
                        if (reduction > 0) {
                            console.log(`  ${COLORS.YELLOW}Errors: ${result.errorsBefore} → ${result.errorsAfter} (-${reduction})${COLORS.RESET}`);
                        }
                    }
                    if (options.verbose) {
                        console.log(`  Patterns: ${result.patternsApplied.join(', ')}`);
                    }
                }
            }
            else if (options.verbose) {
                console.log(`${COLORS.BLUE}○${COLORS.RESET} ${relativePath} (no patterns matched)`);
            }
            totalErrors += result.errorsAfter;
        }
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
        // Print summary
        console.log('\n' + '─'.repeat(60));
        console.log(`\n${COLORS.BOLD}Summary:${COLORS.RESET}`);
        console.log(`  Files processed: ${results.size}`);
        console.log(`  Files fixed: ${totalFixed}`);
        console.log(`  Total errors reduced: ${totalErrorsReduced}`);
        console.log(`  Remaining errors: ${totalErrors}`);
        console.log(`  Time: ${elapsedTime}s`);
        if (options.dryRun) {
            console.log(`\n${COLORS.YELLOW}This was a dry run. Run without --dry-run to apply fixes.${COLORS.RESET}`);
        }
        process.exit(totalErrors > 0 ? 1 : 0);
    }
    catch (error) {
        console.error(`\n${COLORS.RED}Error: ${error}${COLORS.RESET}`);
        process.exit(1);
    }
}
function showHelp() {
    console.log(`
${COLORS.BOLD}${COLORS.CYAN}TypeScript Syntax Quick Fix - Team Charlie${COLORS.RESET}

${COLORS.BOLD}Usage:${COLORS.RESET}
  ts-node quick-fix.ts [options] <path>

${COLORS.BOLD}Options:${COLORS.RESET}
  -h, --help              Show this help message
  -n, --dry-run           Preview changes without modifying files
  -b, --backup            Create backups of modified files
  -v, --verbose           Show detailed output
  -p, --patterns <list>   Comma-separated list of patterns to apply
  -e, --exclude <list>    Comma-separated list of directories to exclude

${COLORS.BOLD}Available Patterns:${COLORS.RESET}
  double-punctuation      Fix ,; patterns
  semicolon-comma         Fix ;, patterns
  broken-method-chain     Fix broken method chains
  missing-parenthesis     Fix missing closing parentheses
  zod-array              Fix malformed z.array() definitions
  object-property-semicolon Fix object properties with semicolons
  extra-semicolon        Remove extra semicolons
  trailing-comma         Fix trailing comma issues

${COLORS.BOLD}Examples:${COLORS.RESET}
  # Fix all TypeScript files in src/ directory
  ts-node quick-fix.ts src/

  # Dry run to preview changes
  ts-node quick-fix.ts --dry-run src/

  # Fix specific patterns only
  ts-node quick-fix.ts --patterns double-punctuation,broken-method-chain src/

  # Create backups and exclude test files
  ts-node quick-fix.ts --backup --exclude test,__tests__ src/

${COLORS.BOLD}Safety Features:${COLORS.RESET}
  • Automatic git stash creation
  • Backup option for modified files
  • Dry run mode for previewing changes
  • Validation after each fix
  • Only applies fixes that reduce error count
`);
}
// Run the CLI
main().catch(error => {
    console.error(`${COLORS.RED}Fatal error: ${error}${COLORS.RESET}`);
    process.exit(1);
});
