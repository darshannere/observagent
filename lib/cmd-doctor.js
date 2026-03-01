import chalk from 'chalk';
import net from 'node:net';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { runInit } from './cmd-init.js';

function isServerRunning(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

async function checkHooksInstalled() {
  try {
    const raw = await readFile(join(homedir(), '.claude', 'settings.json'), 'utf8');
    const settings = JSON.parse(raw);
    const events = ['PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop'];
    for (const event of events) {
      for (const group of settings?.hooks?.[event] ?? []) {
        for (const h of group.hooks ?? []) {
          if (h.command?.includes('relay.py')) return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function checkJsonlFiles() {
  const projectsDir = join(homedir(), '.claude', 'projects');
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const files = await readdir(join(projectsDir, entry.name));
        if (files.some(f => f.endsWith('.jsonl'))) return true;
      } catch {
        continue;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function runDoctor({ fix = false, port = '4999' } = {}) {
  const portNum = parseInt(port, 10);

  const checks = [
    {
      label: `Server running at http://localhost:${portNum}`,
      run: () => isServerRunning(portNum),
      fixCmd: 'observagent start',
      autoFixable: false, // foreground server cannot be auto-started from doctor
    },
    {
      label: 'Hooks installed in ~/.claude/settings.json',
      run: checkHooksInstalled,
      fixCmd: 'observagent init',
      autoFixable: true,
      autoFix: runInit,
    },
    {
      label: 'JSONL session files found in ~/.claude/projects/',
      run: checkJsonlFiles,
      fixCmd: 'Start a Claude Code session to generate session data',
      autoFixable: false,
    },
  ];

  let anyFailed = false;

  for (const check of checks) {
    const pass = await check.run();
    const icon = pass ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${icon}  ${check.label}`);

    if (!pass) {
      anyFailed = true;
      if (fix && check.autoFixable) {
        console.log(`     Fixing...`);
        await check.autoFix();
      } else {
        console.log(`     Fix: ${chalk.yellow(check.fixCmd)}`);
      }
    }
  }

  process.exit(anyFailed ? 1 : 0);
}
