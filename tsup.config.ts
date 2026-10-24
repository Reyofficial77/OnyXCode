import { defineConfig } from "tsup";

export default defineConfig({
  entry: { "cli/main": "src/cli/main.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  banner: { js: "#!/usr/bin/env node" },
  external: ["@opentui/core"],
  noExternal: [/^(commander|zod|diff|ignore|marked)(\/.*)?$/],
});
