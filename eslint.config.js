// eslint.config.js
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import n from "eslint-plugin-n";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import promise from "eslint-plugin-promise";
import { defineConfig } from "eslint/config";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  // 0) Ignore build & tool configs
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      ".tsbuild-ignore/**",
      "eslint.config.*",
      "vitest.config.*",
      "**/*.config.*",
    ],
  },

  // 1) Base JS rules + plugins (applies to JS & TS files)
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    plugins: {
      n,
      "simple-import-sort": simpleImportSort,
      promise,
    },
    extends: [js.configs.recommended],
    rules: {
      // hygiene + ergonomics
      "no-console": "off",
      "no-implicit-coercion": "warn",
      "no-param-reassign": ["warn", { props: false }],
      "no-underscore-dangle": "off",
      "no-void": ["warn", { allowAsStatement: true }],
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
      curly: ["error", "multi-line"],

      // plugin:n (Node)
      "n/no-missing-import": "off",      // TS handles this
      "n/no-unpublished-import": "off",  // OK in dev
      "n/prefer-global/process": "off",
      "n/prefer-global/buffer": "off",

      // simple-import-sort
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn",

      // promise
      "promise/no-return-wrap": "error",
      "promise/no-new-statics": "error",
      "promise/no-multiple-resolved": "error",
    },
  },

  // 2) TS base & stylistic — only for TS files
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    files: ["**/*.{ts,mts,cts}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": ["warn", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/ban-ts-comment": ["warn", { "ts-expect-error": "allow-with-description" }],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // 3) Type-aware TS rules — only for TS files, with a project
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["src/**/*.{ts,mts,cts}", "tests/**/*.{ts,mts,cts}"],
    ignores: ["**/*.config.*", "eslint.config.*"], // prevent config files from using typed rules
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.test.json"],
        tsconfigRootDir,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": ["error", { ignoreIIFE: true }],
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      "@typescript-eslint/prefer-nullish-coalescing": ["warn", { ignoreTernaryTests: true }],
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/require-await": "warn",
    },
  },
]);
