import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      // Listed first so pruning it leaves no dangling comma. // chassis:template
      // Template-only: `web` has its own eslint config. // chassis:template
      'web', // chassis:template
      'dist',
      'coverage',
      'node_modules'
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly'
      }
    }
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  }
);
