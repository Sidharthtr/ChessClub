/**
 * lint-staged config
 *
 * Functions (returning a string instead of accepting files) tell lint-staged
 * to run the command as-is, without appending the matched file list.
 * This is required for workspace-level ESLint, which must lint all project
 * files together for accurate type-aware rules — not just the staged subset.
 *
 * Prettier runs normally (it receives the matched files and formats them).
 */

module.exports = {
  // Backend TypeScript — run full workspace lint
  'backend/**/*.ts': () => 'npm run lint --prefix backend',

  // Frontend TypeScript / TSX — run full workspace lint
  'frontend/**/*.{ts,tsx}': () => 'npm run lint --prefix frontend',

  // Prettier formatting for everything (files passed by lint-staged)
  '**/*.{ts,tsx,js,cjs,mjs,json,css,md}': 'prettier --write --ignore-unknown',
};
