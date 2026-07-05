import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import a11y from 'eslint-plugin-vuejs-accessibility';
import betterTailwind from 'eslint-plugin-better-tailwindcss';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'src-tauri/target/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  ...a11y.configs['flat/recommended'],

  // TypeScript inside <script setup lang="ts"> of .vue files
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },

  // Tailwind class linting (v4: point at the CSS entry that has @import "tailwindcss")
  {
    files: ['**/*.{vue,ts}'],
    plugins: { 'better-tailwindcss': betterTailwind },
    settings: { 'better-tailwindcss': { entryPoint: 'src/assets/styles.css' } },
    rules: {
      ...betterTailwind.configs.recommended.rules,
      // Intentional non-Tailwind classes: Leaflet-injected marker DOM (mm-*/leaflet-*)
      // and the scoped keyframe loader in LoadingRoute (trace-*). Not typos.
      'better-tailwindcss/no-unknown-classes': ['error', { ignore: ['^mm-', '^leaflet-', '^trace-'] }],
    },
  },

  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // Standard for TS projects — the TS compiler resolves identifiers/types (core rule
      // false-positives on type-only references like `BlobPart`). Per typescript-eslint docs.
      'no-undef': 'off',
      // Only wrap a tag onto multiple lines once it has more than 3 attributes.
      'vue/max-attributes-per-line': ['warn', { singleline: { max: 3 }, multiline: { max: 1 } }],
    },
  },
);
