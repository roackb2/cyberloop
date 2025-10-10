import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import n from "eslint-plugin-n";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import promise from "eslint-plugin-promise";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { ignores: ["eslint.config.*", "dist/**", "node_modules/**"] },

  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    // Base config
    extends: [js.configs.recommended],
    plugins: {
      n,
      "simple-import-sort": simpleImportSort,
      promise,
    },
    rules: {
      // General service ergonomics
      "no-console": "warn",
      "no-implicit-coercion": "warn",
      "no-param-reassign": ["warn", { props: false }],
      "no-underscore-dangle": "off",
      "no-void": ["warn", { allowAsStatement: true }],
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
      curly: ["error", "multi-line"],

      // Import hygiene (keep it simple)
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn",

      // Node plugin (ESM + TS setups often need these relaxed)
      "n/no-missing-import": "off",         // TS resolver handles this
      "n/no-unpublished-import": "off",     // dev deps in TS files are common
      "n/prefer-global/buffer": "off",
      "n/prefer-global/process": "off",
    },
  },

  // TS base + style
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    files: ["**/*.{ts,mts,cts}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/consistent-type-definitions": ["warn", "type"],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        { "ts-expect-error": "allow-with-description" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Type-aware layer
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.{ts,mts,cts}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": ["error", { ignoreIIFE: true }],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/prefer-nullish-coalescing": [
        "warn",
        { ignoreTernaryTests: true },
      ],
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",

      // Promise plugin: small set with high signal
      "promise/no-return-wrap": "error",
      "promise/no-new-statics": "error",
      "promise/no-multiple-resolved": "error",
    },
  },
]);
