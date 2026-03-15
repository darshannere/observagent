import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop'];
const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
const RELAY_DEST_DIR = join(homedir(), '.claude', 'observagent');
const RELAY_DEST = join(RELAY_DEST_DIR, 'relay.py');
const RELAY_SRC = join(__dirname, '..', 'hooks', 'relay.py');

function isHookInstalled(settings) {
  for (const event of HOOK_EVENTS) {
    const groups = settings?.hooks?.[event] ?? [];
    for (const group of groups) {
      for (const h of group.hooks ?? []) {
        if (h.command?.includes('relay.py')) return true;
      }
    }
  }
  return false;
}

export async function runInit() {
  // Always copy relay.py to stable absolute path (overwrite on upgrade)
  await mkdir(RELAY_DEST_DIR, { recursive: true });
  await copyFile(RELAY_SRC, RELAY_DEST);

  // Read existing settings.json (or start fresh)
  let settings = {};
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf8');
    settings = JSON.parse(raw);
  } catch {
    // File missing or invalid JSON — start fresh, no existing config to preserve
  }

  // Idempotency check
  if (isHookInstalled(settings)) {
    console.log('✓ ObservAgent already configured');
    console.log('\nNext steps:');
    console.log('  1. Start the server:   npx observagent start');
    console.log('  2. Trigger a session:  open Claude Code and run any task');
    console.log('  3. View dashboard:     http://localhost:4999');
    return;
  }

  // Merge: append ObservAgent hook group to each event array
  settings.hooks ??= {};
  const OBSERVAGENT_HOOK = {
    hooks: [{ type: 'command', command: `python3 ${RELAY_DEST}` }]
  };
  for (const event of HOOK_EVENTS) {
    settings.hooks[event] ??= [];
    settings.hooks[event].push(OBSERVAGENT_HOOK);
  }

  // Atomic write
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');

  console.log('✓ ObservAgent hooks installed');
  console.log('\nNext steps:');
  console.log('  1. Start the server:   npx observagent start');
  console.log('  2. Trigger a session:  open Claude Code and run any task');
  console.log('  3. View dashboard:     http://localhost:4999');
}
