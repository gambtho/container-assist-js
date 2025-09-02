module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking'
  ],
  rules: {
    // TypeScript-specific rules
    '@typescript-eslint/explicit-function-return-type': ['error', {
      allowExpressions: true,
      allowTypedFunctionExpressions: true
    }],
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'error',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/prefer-as-const': 'error',
    
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
    'comma-dangle': ['error', 'never'],
    'quotes': ['error', 'single', { 
      avoidEscape: true,
      allowTemplateLiterals: true 
    }],
    'semi': ['error', 'always'],
    'indent': ['error', 2, { 
      SwitchCase: 1,
      ignoredNodes: ['TemplateLiteral']
    }],
    'max-len': ['warn', { 
      code: 100,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true
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
    'docs'
  ],
  env: {
    node: true,
    es2022: true
  }
};