module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.eslint.json'
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking'
  ],
  rules: {
    // TypeScript-specific rules
    '@typescript-eslint/explicit-function-return-type': ['warn', {
      allowExpressions: true,
      allowTypedFunctionExpressions: true,
      allowHigherOrderFunctions: true,
      allowDirectConstAssertionInArrowFunctions: true
    }],
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/strict-boolean-expressions': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/require-await': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/prefer-as-const': 'error',
    
    // Relax unsafe any operations to warnings
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    
    // Import rules (strict ESM patterns)
    'no-duplicate-imports': 'error',
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { 
            group: ['@domain/*','@service/*','@infrastructure/*', '@application/*'], 
            message: 'Use relative ESM imports instead of path aliases.' 
          }
        ]
      }
    ],
    '@typescript-eslint/no-floating-promises': 'error',
    
    // General rules
    'no-console': ['warn', { 
      allow: ['warn', 'error', 'info'] 
    }],
    'no-debugger': 'error',
    'no-alert': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error',
    'template-curly-spacing': 'error',
    'arrow-spacing': 'error',
    'comma-dangle': ['error', 'always-multiline'],
    'quotes': ['error', 'single', { 
      avoidEscape: true,
      allowTemplateLiterals: true 
    }],
    'semi': ['error', 'always'],
    // Let Prettier handle indentation
    'indent': 'off',
    'max-len': ['warn', { 
      code: 120,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreComments: true
    }],
    'no-trailing-spaces': 'error',
    'eol-last': 'error'
  },
  ignorePatterns: [
    'dist',
    'node_modules',
    '*.js',
    '*.cjs',
    'coverage',
    'docs',
    '*.json'
  ],
  env: {
    node: true,
    es2022: true
  },
  overrides: [
    {
      // Relax any-related rules for test files since mocks often require them
      files: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
      }
    },
    {
      // Allow 'any' types in lib modules
      // These modules wrap external dependencies (dockerode, scanner services, etc)
      files: ['src/lib/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
      }
    }
  ]
};