import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.{test,spec}.{ts,js}"],
    setupFiles: ["tests/setup.ts"],   // create this file if you need global hooks
    globals: true,                    // allows using `describe/it/expect` without imports
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "html", "lcov"],
      exclude: ["**/dist/**", "**/tests/**"],
    },
    pool: "threads",                  // speed via worker threads
  },
  plugins: [tsconfigPaths({ projects: ["./tsconfig.json", "./tsconfig.test.json"] })]
});
