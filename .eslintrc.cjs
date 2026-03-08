module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'security'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:security/recommended-legacy',
  ],
  env: {
    node: true,
    browser: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
    // Too noisy for game code with frequent array/map bracket access
    'security/detect-object-injection': 'off',
  },
  ignorePatterns: ['dist', 'node_modules', '*.js', '!.eslintrc.cjs'],
  overrides: [
    {
      files: ['e2e/**/*.ts'],
      rules: {
        // E2E tests use page.evaluate() which returns untyped browser-context data
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
