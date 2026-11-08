import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { initProject } from '../cli/init.js';

/**
 * Single machine-wide Bridge home. One hub replaces the old per-project daemon:
 * "project" is only a label on a session, never a routing boundary.
 */
export function hubRoot(): string {
 const configured = process.env.BYTE_BRIDGE_HOME;
 return configured ? resolve(configured) : join(homedir(), '.byte-bridge');
}

/** Create the hub state directory on first use; idempotent. */
export async function ensureHubRoot(): Promise<string> {
 const root = hubRoot();
 mkdirSync(root, { recursive: true, mode: 0o700 });
 if (!existsSync(join(root, '.session-bridge', 'project.json'))) await initProject(root, { dryRun: false });
 return root;
}
