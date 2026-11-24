#!/usr/bin/env node
// Activate the workbench display for the current project and exact participants.
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { readBoard, sessionKey, writeBoard } from '../../byte-plan/scripts/workboard.mjs';

function checkout(path) {
  const root = realpathSync(path);
  try {
    const git = (...args) => execFileSync('git', ['-C', root, 'rev-parse', ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return {
      root: realpathSync(git('--show-toplevel')),
      common: realpathSync(git('--path-format=absolute', '--git-common-dir')),
    };
  } catch {
    return { root, common: null };
  }
}

function projectRoot(workspace, explicit) {
  const current = checkout(workspace);
  if (explicit) {
    const selected = checkout(explicit);
    if (selected.root !== current.root && (!current.common || selected.common !== current.common))
      throw new Error('Display project and current workspace have different repository identities');
    return selected.root;
  }
  if (current.common && basename(current.common) === '.git') {
    const primary = dirname(current.common);
    if (existsSync(join(primary, '.byte-os', 'workboard.json')))
      return primary;
  }
  return current.root;
}

function sessionRef(value) {
  if (!value) return null;
  const match = /^(codex|claude|dsh|zcode|hermes|antigravity|opencode|pi|kimi):([\w.-]{1,180})$/u.exec(value);
  if (!match) throw new Error('Use an exact harness:native-id session reference');
  return { harness: match[1], nativeId: match[2] };
}

const { values } = parseArgs({ options: {
  project: { type: 'string' },
  session: { type: 'string' },
  'task-id': { type: 'string' },
} });

const project = projectRoot(process.cwd(), values.project);
const native = process.env.CODEX_THREAD_ID;
const current = sessionRef(values.session || (native && `codex:${native}`));
if (native && current && sessionKey(current) !== `codex:${native}`)
  throw new Error('Explicit session differs from the current native Codex thread');
if (!existsSync(join(project, '.byte-os', 'workboard.json'))) {
  console.log(JSON.stringify({ project, status: 'workbench_not_enabled', registered: [] }));
} else if (!current) {
  console.log(JSON.stringify({ project, status: 'native_session_unverified', registered: [] }));
} else {
  const readSelection = (board) => {
    const task = values['task-id'] && board.items.find(item => item.id === values['task-id']);
    if (values['task-id'] && !task) throw new Error('Unknown workboard task');
    const actual = task && ['in_progress', 'review', 'blocked'].includes(task.status)
      && task.participants.some(member => sessionKey(member) === sessionKey(current));
    const candidates = new Map([current, ...(actual ? task.participants : [])]
      .map(member => [sessionKey(member), { harness: member.harness, nativeId: member.nativeId }]));
    return [...candidates.values()].filter(member => !board.displaySessions
      .some(existing => sessionKey(existing) === sessionKey(member)));
  };
  let board = readBoard(project);
  let added = readSelection(board);
  if (added.length) {
    try {
      board = writeBoard(project, board.revision, draft => { draft.displaySessions.push(...added); });
    } catch (error) {
      if (error.status !== 409) throw error;
      board = readBoard(project);
      added = readSelection(board);
      if (added.length)
        board = writeBoard(project, board.revision, draft => { draft.displaySessions.push(...added); });
    }
  }
  console.log(JSON.stringify({
    project, status: added.length ? 'registered' : 'already_registered',
    current, registered: added, revision: board.revision,
  }));
}
