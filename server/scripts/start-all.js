// Starts the three API nodes, two persistence workers, and the reconciler while automatically restarting any
// crashed child and cleaning up on Ctrl+C. The child process name is included in every log line.
const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const children = new Map();
let shuttingDown = false;

function prefixConsole(name, stream, chunk) {
  const text = chunk.toString();
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    console.log(`[${name}] ${line}`);
  }
}

function spawnChild(name, script, extraEnv = {}) {
  const child = spawn(process.execPath, [script], {
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  children.set(name, child);

  child.stdout.on('data', (chunk) => prefixConsole(name, 'stdout', chunk));
  child.stderr.on('data', (chunk) => prefixConsole(name, 'stderr', chunk));

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    console.log(`[${name}] exited with code=${code} signal=${signal || 'none'}; restarting...`);
    setTimeout(() => spawnChild(name, script, extraEnv), 500);
  });

  return child;
}

function shutdown() {
  shuttingDown = true;
  console.log('Stopping all children...');
  for (const [, child] of children.entries()) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => process.exit(0), 1000);
}

function main() {
  const apiPorts = [3001, 3002, 3003];

  for (const port of apiPorts) {
    spawnChild(`api-${port}`, 'src/server.js', { PORT: String(port) });
  }

  spawnChild('persist-w1', 'worker/persist.js', { WORKER_ID: 'w1' });
  spawnChild('persist-w2', 'worker/persist.js', { WORKER_ID: 'w2' });
  spawnChild('reconciler', 'worker/reconciler.js');

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
