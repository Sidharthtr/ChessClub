module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier', // must be last — disables rules that conflict with Prettier
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    // ── TypeScript ──────────────────────────────────────────────────────────
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-non-null-assertion': 'off', // used intentionally throughout (middleware-guaranteed, definitive assignment)
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    '@typescript-eslint/no-require-imports': 'error',

    // ── General ─────────────────────────────────────────────────────────────
    'no-console': 'warn', // use the Pino logger, not console
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    'object-shorthand': 'error',
  },
  ignorePatterns: ['dist/', 'node_modules/', 'prisma/migrations/'],
};
