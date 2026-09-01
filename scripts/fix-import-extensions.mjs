#!/usr/bin/env node
/**
 * Rewrite extensionless relative imports under src/ to name a real file.
 *
 * Vite resolves `./kraken` happily, but `node --test` does not: Node's ESM
 * resolver requires an exact specifier, so a single extensionless import
 * anywhere in a module's graph makes the whole test file fail to load with
 * ERR_MODULE_NOT_FOUND. That is how charts.test.ts, indicators.test.ts and
 * trade-toast.test.ts were silently absent from the suite.
 *
 * Every specifier is resolved against the filesystem rather than guessed, so
 * `./venues` becomes `./venues/index.ts` and `./gate-session.server` becomes
 * `./gate-session.server.ts`. tsconfig already sets allowImportingTsExtensions
 * with bundler resolution, so tsc and Vite accept the explicit form.
 *
 * Run with --check to fail instead of writing (used by `npm run lint:imports`).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const CHECK = process.argv.includes("--check");

/** Extensions that are already explicit and must be left alone. */
const EXPLICIT = [".ts", ".tsx", ".mjs", ".cjs", ".js", ".jsx", ".json", ".css", ".svg", ".png"];
/** Candidate suffixes to try, in the order a bundler would. */
const CANDIDATES = [".ts", ".tsx", ".mjs", ".js", ".jsx"];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function exists(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Resolve a relative specifier to the specifier that names its actual file. */
function resolveSpecifier(fromFile, spec) {
  // `../styles.css?url` and friends are Vite resource queries, not modules.
  if (spec.includes("?")) return null;
  if (EXPLICIT.some((ext) => spec.endsWith(ext))) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const ext of CANDIDATES) if (exists(base + ext)) return spec + ext;
  for (const ext of CANDIDATES) if (exists(join(base, `index${ext}`))) return `${spec}/index${ext}`;
  return undefined; // unresolvable — report, do not rewrite
}

// Matches the specifier in `from "x"`, `import("x")` and `export ... from "x"`.
const SPEC_RE = /(\bfrom\s*|\bimport\s*\(\s*)"(\.[^"]*)"/g;

const changed = [];
const unresolved = [];

for (const file of walk(SRC)) {
  const before = readFileSync(file, "utf8");
  let hits = 0;
  const after = before.replace(SPEC_RE, (match, lead, spec) => {
    const next = resolveSpecifier(file, spec);
    if (next === null) return match;
    if (next === undefined) {
      unresolved.push(`${relative(ROOT, file)}: ${spec}`);
      return match;
    }
    hits += 1;
    return `${lead}"${next}"`;
  });
  if (hits > 0) {
    changed.push(`${relative(ROOT, file)} (${hits})`);
    if (!CHECK) writeFileSync(file, after);
  }
}

if (unresolved.length > 0) {
  console.error(`Could not resolve ${unresolved.length} specifier(s):`);
  for (const line of unresolved) console.error(`  ${line}`);
}

if (CHECK) {
  if (changed.length > 0) {
    console.error(`${changed.length} file(s) have extensionless relative imports:`);
    for (const line of changed) console.error(`  ${line}`);
    console.error("Run `node scripts/fix-import-extensions.mjs` to fix.");
  } else {
    console.log("All relative imports under src/ name a real file.");
  }
  process.exit(changed.length > 0 || unresolved.length > 0 ? 1 : 0);
}

console.log(`Rewrote imports in ${changed.length} file(s).`);
for (const line of changed) console.log(`  ${line}`);
process.exit(unresolved.length > 0 ? 1 : 0);
