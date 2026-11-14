import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createUserMessage } from '@deepseek-ai/dsh-llm/message';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { locateCore } from './locate.mjs';

export const name = 'sessionbridge';
export const inject = ['agents', 'sessionController', 'remoteAccess', 'sessions', 'tools', 'skills'];
export function apply(ctx, config = {}) {
 const directory = dirname(fileURLToPath(import.meta.url));
 const disposeSkills = ctx.skills.registerProvider(control => new FileSystemSkillProvider(ctx, control, { providerName: 'sessionbridge', includeDefaultRoots: false, customSkillDirs: [join(directory, 'skills')], watch: false }));
 ctx.effect(() => disposeSkills);
 ctx.effect(async () => {
  const selected = config.config_file ? JSON.parse(readFileSync(config.config_file, 'utf8')) : config;
  const core = locateCore(directory);
  const { installDsh } = await import(pathToFileURL(join(core, 'dist/src/adapters/dsh/extension.js')).href);
  const { sessionKey } = await import(pathToFileURL(join(core, 'dist/src/protocol/canonical.js')).href);
  const hubRoot = process.env.BYTE_BRIDGE_HOME ?? (process.env.HOME ? join(process.env.HOME, '.byte-bridge') : join(directory, '..', '..', '.byte-bridge'));
  return installDsh(ctx, { sessions: selected.sessions ?? 'auto', root: hubRoot }, (envelope, text) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'sessionbridge', form: 'relay', message_id: envelope.message_id, sender_session_key: sessionKey(envelope.sender) } }));
 }, 'sessionbridge-native');
}