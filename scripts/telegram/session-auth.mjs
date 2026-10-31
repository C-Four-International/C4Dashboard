#!/usr/bin/env node
/**
 * Generate a TELEGRAM_SESSION (GramJS StringSession) for the Telegram OSINT poller.
 *
 * Usage:
 *   npm run telegram:session
 *   or: node scripts/telegram/session-auth.mjs
 *
 * Output:
 *   Prints TELEGRAM_SESSION=... to stdout and updates .env if found.
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

// Automatically resolve and load .env if not already in process.env
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(projectRoot, '.env'),
  '/opt/dashboard/C4Dashboard/.env',
  '/etc/worldmonitor/worldmonitor.env',
  '/var/www/worldmonitor/.env',
  '/opt/worldmonitor/.env',
];

let foundEnvPath = null;
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!(key in process.env)) {
            process.env[key] = val;
          }
        }
      }
      foundEnvPath = envPath;
      break;
    } catch {}
  }
}

const rl = readline.createInterface({ input, output });

try {
  let apiId = parseInt(String(process.env.TELEGRAM_API_ID || ''), 10);
  let apiHash = String(process.env.TELEGRAM_API_HASH || '').trim();

  if (!apiId) {
    const rawId = (await rl.question('Enter TELEGRAM_API_ID (from my.telegram.org): ')).trim();
    apiId = parseInt(rawId, 10);
  }
  if (!apiHash) {
    apiHash = (await rl.question('Enter TELEGRAM_API_HASH (from my.telegram.org): ')).trim();
  }

  if (!apiId || !apiHash) {
    console.error('❌ Missing TELEGRAM_API_ID or TELEGRAM_API_HASH. Get them from https://my.telegram.org/apps');
    process.exit(1);
  }

  console.log(`\nUsing Telegram API ID: ${apiId}`);
  const phoneNumber = (await rl.question('Phone number (with international country code, e.g. +1...): ')).trim();
  const password = (await rl.question('2FA password (press Enter if none): ')).trim();

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 3 });

  await client.start({
    phoneNumber: async () => phoneNumber,
    password: async () => password || undefined,
    phoneCode: async () => (await rl.question('Verification code from Telegram: ')).trim(),
    onError: (err) => console.error(err),
  });

  const session = client.session.save();
  console.log('\n✅ Successfully generated Telegram session:');
  console.log(`TELEGRAM_SESSION=${session}\n`);

  if (foundEnvPath) {
    try {
      let content = fs.readFileSync(foundEnvPath, 'utf8');
      if (content.includes('TELEGRAM_SESSION=')) {
        content = content.replace(/^TELEGRAM_SESSION=.*$/m, `TELEGRAM_SESSION=${session}`);
      } else {
        content += `\nTELEGRAM_SESSION=${session}\n`;
      }
      fs.writeFileSync(foundEnvPath, content, 'utf8');
      console.log(`💾 Automatically updated TELEGRAM_SESSION in ${foundEnvPath}`);
    } catch (e) {
      console.warn(`Could not automatically write to ${foundEnvPath}: ${e.message}`);
    }
  }

  await client.disconnect();
} finally {
  rl.close();
}
