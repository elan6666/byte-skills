import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { join } from 'node:path';

const maxFrame = 16 * 1024 * 1024;
type Frame = Record<string, unknown>;
type Reply = { resultType: string; method?: string; result?: unknown; error?: unknown; handledByClientId?: string };

export interface DesktopReturnOwner {
 send(messageId: string, text: string): Promise<string>;
 close(): void;
}

function field(value: unknown, key: string): unknown {
 return value && typeof value === 'object' ? (value as Frame)[key] : undefined;
}

export async function openDesktopReturnOwner(home: string, threadId: string, cwd: string): Promise<DesktopReturnOwner | null> {
 if (process.platform !== 'darwin') return null;
 const path = join(home, 'ipc', 'ipc.sock');
 const entry = await lstat(path).catch(() => null);
 if (!entry?.isSocket() || entry.uid !== process.getuid?.() || (entry.mode & 0o077) !== 0) return null;
 const socket = createConnection(path);
 let clientId = 'initializing-client';
 let buffer = Buffer.alloc(0);
 let pending: { id: string; finish: (reply?: Reply) => void } | undefined;
 const write = (frame: Frame) => {
  const body = Buffer.from(JSON.stringify(frame));
  if (body.length > maxFrame) throw new Error('Desktop IPC request exceeds frame limit');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  socket.write(Buffer.concat([header, body]));
 };
 socket.on('error', () => pending?.finish());
 socket.on('close', () => pending?.finish());
 socket.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  try {
   while (buffer.length >= 4) {
    const size = buffer.readUInt32LE(0);
    if (size === 0 || size > maxFrame) throw new Error('Invalid desktop IPC frame size');
    if (buffer.length < 4 + size) break;
    const frame = JSON.parse(buffer.subarray(4, 4 + size).toString()) as Frame;
    buffer = buffer.subarray(4 + size);
    if (frame.type === 'client-discovery-request') {
     write({ type: 'client-discovery-response', requestId: frame.requestId, response: { canHandle: false } });
    } else if (frame.type === 'response' && pending?.id === frame.requestId) {
     pending?.finish(frame as Reply);
    }
   }
  } catch { socket.destroy(); }
 });

 function request(method: string, version: number, params: Frame, targetClientId?: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
   if (pending || socket.destroyed) { reject(new Error('Desktop IPC connection unavailable')); return; }
   const id = randomUUID();
   const finish = (reply?: Reply) => {
    clearTimeout(timer);
    pending = undefined;
    if (reply) resolve(reply);
    else reject(new Error('Desktop IPC response unavailable'));
   };
   const timer = setTimeout(finish, 8000);
   pending = { id, finish };
   try { write({ type: 'request', requestId: id, sourceClientId: clientId, version, method, params, targetClientId, timeoutMs: 7500 }); }
   catch { finish(); }
  });
 }

 try {
  const init = await request('initialize', 1, { clientType: 'byte-bridge' });
  const assigned = field(init.result, 'clientId');
  if (init.resultType !== 'success' || typeof assigned !== 'string' || !assigned) { socket.destroy(); return null; }
  clientId = assigned;
  const discovery = await request('thread-owner-discovery', 1, { hostId: 'local', conversationId: threadId });
  const owner = discovery.handledByClientId;
  if (discovery.resultType !== 'success' || typeof owner !== 'string' || !owner || field(discovery.result, 'supportsUntrustedAppInput') !== true) {
   socket.destroy();
   return null;
  }
  return {
   close: () => socket.destroy(),
   async send(messageId, text) {
    const input = [{ type: 'text', text, text_elements: [] }];
    const steer = 'thread-follower-steer-turn';
    const start = 'thread-follower-start-turn';
    let method = steer;
    const restoreMessage = { id: messageId, cwd, text, createdAt: Date.now(), context: { prompt: text, workspaceRoots: [cwd] } };
    let reply = await request(steer, 1, { conversationId: threadId, input, clientUserMessageId: messageId, restoreMessage, attachments: [] }, owner);
    const inactive = `Cannot steer conversation ${threadId} because its active turn already ended`;
    const sameOwner = reply.handledByClientId === undefined || reply.handledByClientId === owner;
    if (sameOwner && reply.resultType === 'error' && (reply.error === inactive || reply.error === `Error: ${inactive}`)) {
     method = start;
     reply = await request(start, 2, { conversationId: threadId, turnStart: {
      request: { threadId, input, clientUserMessageId: messageId }, context: { inheritThreadSettings: true },
     } }, owner);
    }
    if (reply.resultType !== 'success' || reply.handledByClientId !== owner || reply.method !== method) {
     throw new Error(`Desktop owner did not confirm ${method}; reconcile the same message ID`);
    }
    return `desktop:${method === steer ? 'steer' : 'start'}:${messageId}`;
   },
  };
 } catch {
  socket.destroy();
  return null;
 }
}
