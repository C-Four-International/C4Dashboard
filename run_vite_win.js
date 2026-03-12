import { spawn } from 'child_process';

const child = spawn('npx.cmd', ['vite', '--port', '5178'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true
});

let output = '';

child.stdout.on('data', (data) => {
  output += data.toString();
});

child.stderr.on('data', (data) => {
  output += data.toString();
});

child.on('close', (code) => {
  const lines = output.split('\n');
  const errIndex = lines.findIndex(l => l.includes('TypeError'));
  if (errIndex !== -1) {
    console.log(lines.slice(Math.max(0, errIndex - 2), errIndex + 10).join('\n'));
  } else {
    console.log("No TypeError found in output");
    console.log("Last 20 lines:", lines.slice(-20).join('\n'));
  }
});
