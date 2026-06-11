// Strip the dangling `//# sourceMappingURL` reference from @duckdb/duckdb-wasm's
// worker bundles. Those bundles ship sourcemaps whose `sources` point outside
// the package (a malformed `../../apache-arrow/io/whatwg/io/whatwg/...` path),
// which makes Vite's dev server warn on every start. The maps are broken
// upstream and unusable for debugging, so we drop the reference rather than
// mask the warning. Idempotent; runs from `postinstall`.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "..", "node_modules", "@duckdb", "duckdb-wasm", "dist");

if (!existsSync(dist)) {
  // Dependency not installed (e.g. partial install) — nothing to do.
  process.exit(0);
}

const SOURCEMAP_RE = /\n?\/\/# sourceMappingURL=.*\.map\s*$/;
let stripped = 0;

for (const file of readdirSync(dist)) {
  if (!file.endsWith(".worker.js")) continue;
  const path = join(dist, file);
  const code = readFileSync(path, "utf8");
  if (!SOURCEMAP_RE.test(code)) continue;
  writeFileSync(path, code.replace(SOURCEMAP_RE, "\n"));
  stripped++;
}

if (stripped > 0) {
  console.log(`[strip-duckdb-sourcemaps] removed broken sourcemap refs from ${stripped} worker file(s)`);
}
