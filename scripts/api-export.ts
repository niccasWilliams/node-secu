#!/usr/bin/env tsx
/**
 * api-export.ts — Deterministic, clean export of generated API artifacts
 * to one or more frontend targets.
 *
 * Solves the "stale files" problem: when a route is removed backend-side,
 * the old generated file must not linger in target repos.
 *
 * Process per target:
 *   1. Resolve target directories (CLI args, env var, or defaults)
 *   2. Delete each target `generated/` folder
 *   3. Copy fresh `generated/` + `frontend-types.ts` from source
 *   4. Verify by counting copied files
 *
 * Usage:
 *   pnpm run api:export
 *   pnpm run api:export -- /path/to/frontend-a/generated /path/to/frontend-b/generated
 *   API_EXPORT_TARGETS="/path/a/generated,/path/b/generated" pnpm run api:export
 */

import fs from "fs";
import path from "path";

const SOURCE_GENERATED = path.join(process.cwd(), "generated");
const SOURCE_FRONTEND_TYPES = path.join(process.cwd(), "frontend-types.ts");

const DEFAULT_TARGETS = [
  "/Users/niclaspilz/Documents/dev/nextjs-projects/niccaswilliams/src/lib/node-apps/node-secu/generated",
];

function resolveTargets(): string[] {
  // CLI args take priority
  const cliArgs = process.argv.slice(2).filter(Boolean);
  if (cliArgs.length > 0) {
    return cliArgs.map((arg) => path.resolve(arg));
  }

  // Then env var (comma-separated)
  const envTargets = process.env.API_EXPORT_TARGETS;
  if (envTargets) {
    return envTargets
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => path.resolve(entry));
  }

  // Fallback to defaults
  return DEFAULT_TARGETS.map((target) => path.resolve(target));
}

function cleanDir(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src: string, dest: string) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function countFiles(dir: string): number {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }

  return count;
}

function assertSourceExists() {
  if (!fs.existsSync(SOURCE_GENERATED)) {
    console.error("❌ Source generated/ not found. Run `pnpm run api:generate` first.");
    process.exit(1);
  }
}

function assertTargetsValid(targets: string[]) {
  if (targets.length === 0) {
    console.error("❌ No export targets resolved.");
    process.exit(1);
  }

  for (const target of targets) {
    const targetParent = path.dirname(target);
    if (!fs.existsSync(targetParent)) {
      console.error(`❌ Target parent directory does not exist: ${targetParent}`);
      console.error("   Create it first, or pass valid target paths via CLI / API_EXPORT_TARGETS.");
      process.exit(1);
    }
  }
}

function exportToTarget(target: string) {
  console.log(`\n🧹 Cleaning target: ${target}`);
  cleanDir(target);

  console.log(`📦 Copying generated/ → ${target}`);
  copyRecursive(SOURCE_GENERATED, target);

  if (fs.existsSync(SOURCE_FRONTEND_TYPES)) {
    const destFrontendTypes = path.join(target, "frontend-types.ts");
    fs.copyFileSync(SOURCE_FRONTEND_TYPES, destFrontendTypes);
    console.log(`📦 Copied frontend-types.ts → ${destFrontendTypes}`);
  }

  const fileCount = countFiles(target);
  console.log(`✅ Exported ${fileCount} files to ${target}`);
  console.log("   No stale files possible — target was cleaned before copy.");
}

// ── Main ──

const targets = resolveTargets();

assertSourceExists();
assertTargetsValid(targets);

console.log(`🚀 Exporting API artifacts to ${targets.length} target(s)...`);

for (const target of targets) {
  exportToTarget(target);
}

console.log("\n🎉 Done.");