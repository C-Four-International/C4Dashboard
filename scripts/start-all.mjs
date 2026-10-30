#!/usr/bin/env node
/**
 * WorldMonitor Linux Production Process Supervisor
 *
 * Concurrently manages:
 *   1. Web & API Server (server/standalone.mjs on port 3000)
 *   2. Persistent AIS/OpenSky Relay (scripts/ais-relay.cjs on port 3004)
 *
 * Ensures graceful shutdown, unified logging, and process monitoring.
 *
 * Usage:
 *   node scripts/start-all.mjs
 *   Or: npm run start:all
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const serverScript = path.join(projectRoot, 'server', 'standalone.mjs');
const relayScript = path.join(projectRoot, 'scripts', 'ais-relay.cjs');

// Auto-configure internal relay URL if missing
if (!process.env.WS_RELAY_URL) {
  process.env.WS_RELAY_URL = 'http://127.0.0.1:3004';
}

const runningChildren = [];
let isTerminating = false;

function launchProcess(name, scriptPath, customEnv = {}) {
  const env = {
    ...process.env,
    ...customEnv,
  };

  const child = spawn(process.execPath, [scriptPath], {
    cwd: projectRoot,
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      console.log(`[${name}] ${line}`);
    }
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      console.error(`[${name}] ${line}`);
    }
  });

  child.on('exit', (code, signal) => {
    if (isTerminating) return;
    console.warn(`[Supervisor] ${name} exited with code ${code} (signal: ${signal}).`);
    if (code !== 0 && !isTerminating) {
      console.log(`[Supervisor] Restarting ${name} in 3 seconds...`);
      setTimeout(() => {
        if (!isTerminating) launchProcess(name, scriptPath, customEnv);
      }, 3000);
    }
  });

  runningChildren.push(child);
  return child;
}

console.log('====================================================');
console.log('Starting WorldMonitor Linux Production Environment');
console.log('====================================================');

// Launch Relay
launchProcess('Relay', relayScript, {
  PORT: process.env.RELAY_PORT || '3004',
});

// Launch Standalone Web & API Server
launchProcess('Web', serverScript, {
  PORT: process.env.PORT || '3000',
  RELAY_PORT: process.env.RELAY_PORT || '3004',
});

function gracefulShutdown(signal) {
  if (isTerminating) return;
  isTerminating = true;
  console.log(`\n[Supervisor] Received ${signal}. Terminating all services gracefully...`);

  for (const child of runningChildren) {
    try {
      child.kill(signal);
    } catch {}
  }

  setTimeout(() => {
    console.error('[Supervisor] Force exiting...');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

