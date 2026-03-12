import { spawn } from 'child_process';
import fs from 'fs';

const p = spawn('npx.cmd', ['tsx', 'check_insights.js']);

let out = '';
p.stdout.on('data', d => out += d.toString());
p.stderr.on('data', d => out += d.toString());

p.on('close', () => {
  fs.writeFileSync('playwright_log.txt', out);
  console.log('Done');
});
