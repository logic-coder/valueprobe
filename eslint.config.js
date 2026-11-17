import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', 'tmp-*'] },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    rules: {
      // The chrome intentionally omits multi-word names and the templates are hand-wrapped.
      'vue/multi-word-component-names': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },

  // Layer guard: lower layers must not import upward (docs/ARCHITECTURE.md).
  {
    files: ['src/lib/**/*.js'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['../store/*', '../api/*', '../components/*', '../pages/*', '../composables/*'] }] },
  },
  {
    files: ['src/data/**/*.js'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['../store/*', '../api/*', '../components/*', '../pages/*', '../composables/*'] }] },
  },
  {
    files: ['src/store/**/*.js'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['../components/*', '../pages/*'] }] },
  },
  {
    files: ['src/components/**/*.{js,vue}'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['../pages/*'] }] },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
]
