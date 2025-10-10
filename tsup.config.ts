import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm", "cjs"],       // dual outputs
  dts: true,                    // generate .d.ts
  sourcemap: true,
  clean: true,
  target: "node20",             // or "es2022"
  splitting: false,
  shims: false,
  treeshake: true,
  // Handle your @ alias at build time:
  // (esbuild alias – avoids needing tsc-alias)
  // @ts-ignore
  alias: { "@": "./src" },
  // Mark external deps so they aren't bundled
  external: [],                 // add deps you want to keep external
});
