module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // Prefer explicit types — no implicit any
    '@typescript-eslint/no-explicit-any': 'error',
    // Require return types on exported functions
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // React 18 + react-jsx transform — no need to import React
    'react/react-in-jsx-scope': 'off',
    // Unused vars handled by TypeScript compiler
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // Hooks rules
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  env: {
    browser: true,
    es2020: true,
  },
  ignorePatterns: ['dist/', 'dist-pkg/', 'node_modules/', 'webpack.config.js', 'jest.config.js'],
};
