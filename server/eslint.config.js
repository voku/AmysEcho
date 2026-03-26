import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        require: 'readonly',
        module: 'readonly',
        NodeJS: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-var-requires': 'off',

      // General rules
      'no-console': 'off', // Allow console in server code
      'no-unused-vars': 'off', // Use TypeScript version instead
      'no-redeclare': 'off', // TypeScript overloads are not re-declarations
      'preserve-caught-error': 'off', // New ESLint v10 rule; errors are already logged with full details before rethrowing, so the cause chain is preserved via logs
      'prefer-const': 'error',
      'no-var': 'error',
      'no-undef': 'off', // Turn off for Node.js globals
      'no-empty': 'warn',
      'no-case-declarations': 'off', // Allow declarations in case blocks
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
    },
  },
  {
    ignores: [
      'dist/',
      'node_modules/',
      '**/*.test.ts',
      '**/*.spec.ts',
      'coverage/',
      '.cache/',
      '**/vision_bundle.mjs',
      '**/mediapipe/',
      'src/caregiver-portal/',
      'src/portal/',
      'jest.config.js',
      'eslint.config.js',
    ],
  },
];