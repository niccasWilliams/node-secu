#!/usr/bin/env tsx
/**
 * Interactive App Setup Script
 *
 * This script helps you quickly setup a new app from the template by:
 * - Setting the app name everywhere (docker-compose, package.json, etc.)
 * - Configuring the database port consistently across all files
 * - Updating the Node.js server port
 * - Initializing app settings in the database
 *
 * Run with: npm run setup
 */

import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';

// ============================================================================
// UTILITIES
// ============================================================================

const readline = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    readline.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
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

function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function validatePort(port: string): boolean {
  const num = parseInt(port, 10);
  return !isNaN(num) && num >= 1024 && num <= 65535;
}

function validateAppName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}

// ============================================================================
// MAIN SETUP
// ============================================================================

async function setup() {
  console.log('\n🚀 Node Template - App Setup');
  console.log('═'.repeat(50));
  console.log('This script will configure your app with:');
  console.log('  • Custom app name');
  console.log('  • Database port');
  console.log('  • Node.js server port');
  console.log('═'.repeat(50));
  console.log('');

  // ============================================================================
  // 1. Get App Name
  // ============================================================================

  let appName = '';
  while (!appName) {
    const input = await question('📝 Enter app name (e.g., "my-api", "shop-backend"): ');
    const normalized = kebabCase(input);

    if (!normalized) {
      console.log('❌ App name cannot be empty');
      continue;
    }

    if (!validateAppName(normalized)) {
      console.log('❌ App name must only contain lowercase letters, numbers, and hyphens');
      continue;
    }

    appName = normalized;
  }

  const appNamePascal = appName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Docker service name with "node-" prefix
  const dockerServiceName = `node-${appName}`;

  console.log(`✓ App name: ${appName}`);
  console.log(`✓ Display name: ${appNamePascal}`);
  console.log(`✓ Docker service: ${dockerServiceName}`);
  console.log('');

  // ============================================================================
  // 2. Get Database Port
  // ============================================================================

  let dbPort = '';
  while (!dbPort) {
    const input = await question('🗄️  Enter database port (default: 5441): ') || '5441';

    if (!validatePort(input)) {
      console.log('❌ Invalid port. Must be between 1024 and 65535');
      continue;
    }

    dbPort = input;
  }

  console.log(`✓ Database port: ${dbPort}`);
  console.log('');

  // ============================================================================
  // 3. Get Node Port
  // ============================================================================

  let nodePort = '';
  while (!nodePort) {
    const input = await question('🌐 Enter Node.js server port (default: 8102): ') || '8102';

    if (!validatePort(input)) {
      console.log('❌ Invalid port. Must be between 1024 and 65535');
      continue;
    }

    if (input === dbPort) {
      console.log('❌ Node port must be different from database port');
      continue;
    }

    nodePort = input;
  }

  console.log(`✓ Node.js port: ${nodePort}`);
  console.log('');

  // ============================================================================
  // 4. Confirm
  // ============================================================================

  console.log('═'.repeat(50));
  console.log('📋 Summary:');
  console.log(`   App Name:        ${appName}`);
  console.log(`   Display Name:    ${appNamePascal}`);
  console.log(`   Docker Service:  ${dockerServiceName}`);
  console.log(`   Database Port:   ${dbPort}`);
  console.log(`   Node Port:       ${nodePort}`);
  console.log('═'.repeat(50));
  console.log('');

  const confirm = await question('✅ Apply these settings? (y/n): ');

  if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
    console.log('❌ Setup cancelled');
    readline.close();
    return;
  }

  console.log('');
  console.log('🔧 Applying settings...');
  console.log('');

  // ============================================================================
  // 5. Update Files
  // ============================================================================

  const databaseUrl = `postgresql://postgres:example@localhost:${dbPort}/postgres`;

  // 5.1 Update docker-compose.yml
  console.log('📝 Updating docker-compose.yml...');
  replaceInFile('docker-compose.yml', [
    { from: /node-[a-z0-9-]+:/g, to: `${dockerServiceName}:` },
    { from: /node-template:/g, to: `${dockerServiceName}:` },
    { from: /container_name: node-[a-z0-9-]+-database/g, to: `container_name: ${dockerServiceName}-database` },
    { from: /container_name: node-template-database/g, to: `container_name: ${dockerServiceName}-database` },
    { from: /- \d+:5432/g, to: `- ${dbPort}:5432` },
  ]);

  // 5.2 Update .env
  console.log('📝 Updating .env...');
  replaceInFile('.env', [
    { from: /DATABASE_URL=postgresql:\/\/postgres:example@localhost:\d+\/postgres/g, to: databaseUrl },
    { from: /NODE_PORT="\d+"/g, to: `NODE_PORT="${nodePort}"` },
  ]);

  // 5.3 Update drizzle.config.ts
  console.log('📝 Updating drizzle.config.ts...');
  replaceInFile('drizzle.config.ts', [
    { from: /url: process\.env\.DATABASE_URL \|\| "postgresql:\/\/postgres:example@localhost:\d+\/postgres"/g,
      to: `url: process.env.DATABASE_URL || "${databaseUrl}"` },
  ]);

  // 5.4 Update package.json
  console.log('📝 Updating package.json...');
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  packageJson.name = appName;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');

  // 5.5 Create setup-complete flag file with app settings
  console.log('📝 Creating setup configuration...');
  const setupConfig = {
    appName,
    appNamePascal,
    dockerServiceName,
    dbPort,
    nodePort,
    databaseUrl,
    setupDate: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(process.cwd(), '.setup-config.json'),
    JSON.stringify(setupConfig, null, 2),
    'utf-8'
  );

  // ============================================================================
  // 6. Instructions
  // ============================================================================

  console.log('');
  console.log('✅ Setup completed successfully!');
  console.log('');
  console.log('═'.repeat(50));
  console.log('📋 Next Steps:');
  console.log('═'.repeat(50));
  console.log('');
  console.log('1. Start the database:');
  console.log('   docker-compose up -d');
  console.log('');
  console.log('2. Run database migrations:');
  console.log('   npm run db:migrate');
  console.log('');
  console.log('3. Seed the database (optional):');
  console.log('   npm run db:seed');
  console.log('');
  console.log(`4. The app name "${appNamePascal}" will be automatically`);
  console.log('   added to app_settings during the first seed.');
  console.log('');
  console.log('5. Start the development server:');
  console.log('   npm run run:dev');
  console.log('');
  console.log('═'.repeat(50));
  console.log(`🌐 Your app will be available at: http://localhost:${nodePort}`);
  console.log(`🗄️  Database runs on port: ${dbPort}`);
  console.log('═'.repeat(50));
  console.log('');

  readline.close();
}

// ============================================================================
// RUN
// ============================================================================

setup().catch((error) => {
  console.error('❌ Setup failed:', error);
  readline.close();
  process.exit(1);
});
