import { defineConfig } from "tsdown";

// Bundle the pi extension for npm distribution.
//
// pi loads the entry declared in package.json `pi.extensions` via jiti, which
// handles bundled ESM .js. The three runtime-provided packages MUST stay
// external: pi's loader shims them through VIRTUAL_MODULES, and typebox schema
// identity has to match pi's own instance (tool param schemas are built with
// Type.Object and interpreted by pi's tool registry using the same copy).
export default defineConfig({
  entry: ["extensions/index.ts"],
  outDir: "dist",
  format: "esm",
  platform: "node",
  // Follow package.json "type": "module" → emit .js (not .mjs).
  fixedExtension: false,
  deps: {
    neverBundle: [
      "@earendil-works/pi-coding-agent",
      "@earendil-works/pi-ai",
      "typebox", // keep pi's instance — schema identity matters
    ],
  },
  clean: true,
});