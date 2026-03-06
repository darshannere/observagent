#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

program
  .name('observagent')
  .description('ObservAgent — Claude Code agent observability')
  .version(version);

program
  .command('init')
  .description('Configure Claude Code hooks in ~/.claude/settings.json')
  .action(async () => {
    const { runInit } = await import('../lib/cmd-init.js');
    await runInit();
  });

program
  .command('start')
  .description('Start the ObservAgent server and open the dashboard')
  .option('-p, --port <number>', 'Port to listen on', '4999')
  .action(async (options) => {
    const { runStart } = await import('../lib/cmd-start.js');
    await runStart(options);
  });

program
  .command('doctor')
  .description('Check ObservAgent setup health')
  .option('--fix', 'Auto-repair all failing checks')
  .option('-p, --port <number>', 'Port to check', '4999')
  .action(async (options) => {
    const { runDoctor } = await import('../lib/cmd-doctor.js');
    await runDoctor(options);
  });

program.parse();
