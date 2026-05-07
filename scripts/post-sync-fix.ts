#!/usr/bin/env tsx
/**
 * Post Template Sync Fix Script
 *
 * This script runs after template sync to restore app-specific values
 * that should not be overwritten by the template.
 *
 * Usage:
 *   pnpm run post-sync-fix
 *
 * What it fixes:
 *   - Restores app name in package.json from .setup-config.json
 *   - Restores database port in drizzle.config.ts
 *   - Restores ports and service names in docker-compose.yml
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// UTILITIES
// ============================================================================

function readSetupConfig(): any {
  const configPath = path.join(process.cwd(), '.setup-config.json');
  if (!fs.existsSync(configPath)) {
    console.log('⚠️  No .setup-config.json found. Run `pnpm run setup` first.');
    return null;
  }

  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function replaceInFile(filePath: string, replacements: Array<{ from: string | RegExp; to: string }>) {
  const fullPath = path.join(process.cwd(), filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  Skipping ${filePath} (file not found)`);
    return false;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');

  for (const { from, to } of replacements) {
    if (typeof from === 'string') {
      content = content.split(from).join(to);
    } else {
      content = content.replace(from, to);
    }
  }

  fs.writeFileSync(fullPath, content, 'utf-8');
  return true;
}

// ============================================================================
// MAIN
// ============================================================================

async function postSyncFix() {
  console.log('\n🔧 Post-Sync Fix Script');
  console.log('═'.repeat(50));
  console.log('Restoring app-specific values...');
  console.log('');

  // Read setup config
  const config = readSetupConfig();
  if (!config) {
    console.log('❌ Cannot proceed without setup config.');
    console.log('   Run `pnpm run setup` to create it.');
    process.exit(1);
  }

  const { appName, dockerServiceName, dbPort, nodePort, databaseUrl } = config;

  console.log('📋 Restoring from setup config:');
  console.log(`   App Name:        ${appName}`);
  console.log(`   Docker Service:  ${dockerServiceName}`);
  console.log(`   Database Port:   ${dbPort}`);
  console.log(`   Node Port:       ${nodePort}`);
  console.log('');

  let filesFixed = 0;

  // Fix package.json
  console.log('📝 Fixing package.json...');
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    if (packageJson.name !== appName) {
      packageJson.name = appName;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
      console.log(`   ✓ Restored app name: ${appName}`);
      filesFixed++;
    } else {
      console.log(`   ✓ Already correct`);
    }
  }

  // Fix docker-compose.yml
  console.log('📝 Fixing docker-compose.yml...');
  const dockerChanged = replaceInFile('docker-compose.yml', [
    { from: /node-template:/g, to: `${dockerServiceName}:` },
    { from: /container_name: node-template-database/g, to: `container_name: ${dockerServiceName}-database` },
    { from: /- 5441:5432/g, to: `- ${dbPort}:5432` },
  ]);
  if (dockerChanged) {
    console.log(`   ✓ Restored docker service: ${dockerServiceName}`);
    filesFixed++;
  }

  // Fix drizzle.config.ts
  console.log('📝 Fixing drizzle.config.ts...');
  const drizzleChanged = replaceInFile('drizzle.config.ts', [
    { from: /"postgresql:\/\/postgres:example@localhost:5441\/postgres"/g, to: `"${databaseUrl}"` },
  ]);
  if (drizzleChanged) {
    console.log(`   ✓ Restored database URL: ${databaseUrl}`);
    filesFixed++;
  }

  // Fix .env
  console.log('📝 Fixing .env...');
  const envChanged = replaceInFile('.env', [
    { from: /DATABASE_URL=postgresql:\/\/postgres:example@localhost:5441\/postgres/g, to: `DATABASE_URL=${databaseUrl}` },
    { from: /NODE_PORT="8102"/g, to: `NODE_PORT="${nodePort}"` },
  ]);
  if (envChanged) {
    console.log(`   ✓ Restored ports in .env`);
    filesFixed++;
  }

  console.log('');
  console.log('═'.repeat(50));
  console.log(`✅ Post-sync fix completed! (${filesFixed} files restored)`);
  console.log('═'.repeat(50));
  console.log('');
}

// ============================================================================
// RUN
// ============================================================================

postSyncFix().catch((error) => {
  console.error('❌ Post-sync fix failed:', error);
  process.exit(1);
});
