import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';
import net from 'node:net';
import open from 'open';

const __dirname = dirname(fileURLToPath(import.meta.url));

function isServerRunning(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

async function waitForPort(port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerRunning(port)) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

function getDbPath() {
  if (platform() === 'win32') {
    return join(process.env.APPDATA ?? homedir(), 'observagent', 'observagent.db');
  }
  return join(homedir(), '.local', 'share', 'observagent', 'observagent.db');
}

export async function runStart({ port = '4999' } = {}) {
  const portNum = parseInt(port, 10);
  const url = `http://localhost:${portNum}`;

  if (await isServerRunning(portNum)) {
    console.log(`ObservAgent already running at ${url}`);
    await open(url);
    return;
  }

  const serverPath = join(__dirname, '..', 'server.js');
  const child = spawn(process.execPath, [serverPath], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(portNum),
      OBSERVAGENT_DB_PATH: getDbPath(),
    },
  });

  child.on('error', (err) => {
    console.error('[start] Failed to start server:', err.message);
    process.exit(1);
  });

  try {
    await waitForPort(portNum, 10000);
  } catch (err) {
    console.error('[start]', err.message);
    child.kill();
    process.exit(1);
  }

  await open(url);

  await new Promise((resolve) => {
    child.on('exit', resolve);
    process.on('SIGINT', () => {
      child.kill('SIGINT');
    });
  });
}
