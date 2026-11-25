import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Socket } from 'node:net';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { openDesktopReturnOwner } from '../../src/adapters/codex/desktop-return.js';

const thread = 'test-thread';
const message = 'test-message';
const owner = 'desktop-owner';
const steer = 'thread-follower-steer-turn';
const start = 'thread-follower-start-turn';

async function desktop(t: TestContext, mode: 'active' | 'idle' | 'reject' | 'wrong-owner') {
 const home = await mkdtemp('/tmp/byte-return-');
 const ipc = join(home, 'ipc');
 await mkdir(ipc, { mode: 0o700 });
 const path = join(ipc, 'ipc.sock');
 const requests: Record<string, unknown>[] = [];
 const sockets = new Set<Socket>();
 const server = createServer(socket => {
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
  let buffer = Buffer.alloc(0);
  socket.on('data', chunk => {
   buffer = Buffer.concat([buffer, chunk]);
   while (buffer.length >= 4) {
    const size = buffer.readUInt32LE(0);
    if (buffer.length < 4 + size) return;
    const req = JSON.parse(buffer.subarray(4, size + 4).toString());
    buffer = buffer.subarray(size + 4);
    requests.push(req);
    const answer: Record<string, unknown> = {
     type: 'response', requestId: req.requestId, method: req.method, resultType: 'success',
     handledByClientId: owner, result: {},
    };
    if (req.method === 'initialize') answer.result = { clientId: 'fixture-client' };
    else if (req.method === 'thread-owner-discovery') answer.result = { supportsUntrustedAppInput: true };
    else if (req.method === steer && mode === 'idle') {
     // The real IPC error frame can omit handledByClientId.
     delete answer.handledByClientId;
     Object.assign(answer, { resultType: 'error', error: `Cannot steer conversation ${thread} because its active turn already ended` });
    } else if (req.method === steer && mode === 'reject') {
     Object.assign(answer, { resultType: 'error', error: 'unexpected write outcome' });
    } else if (req.method === steer && mode === 'wrong-owner') answer.handledByClientId = 'another-client';
    const body = Buffer.from(JSON.stringify(answer));
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length);
    socket.write(header);
    socket.write(body);
   }
  });
 });
 t.after(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await rm(home, { force: true, recursive: true });
 });
 await new Promise<void>((resolve, reject) => server.listen(path, resolve).once('error', reject));
 await chmod(path, 0o600);
 const connection = await openDesktopReturnOwner(home, thread, home);
 assert.ok(connection);
 return { connection, requests, home };
}

for (const mode of ['active', 'idle', 'reject', 'wrong-owner'] as const) {
 test(`desktop result routing: ${mode}`, { skip: process.platform !== 'darwin' }, async t => {
  const { connection, requests, home } = await desktop(t, mode);
  try {
   if (mode === 'active' || mode === 'idle') {
    assert.equal(await connection.send(message, 'immutable result'), `desktop:${mode === 'active' ? 'steer' : 'start'}:${message}`);
   } else {
    await assert.rejects(connection.send(message, 'immutable result'), /did not confirm/);
   }
   assert.deepEqual(requests.map(r => r.method), ['initialize', 'thread-owner-discovery', steer, ...(mode === 'idle' ? [start] : [])]);
   assert.deepEqual(requests[1]?.params, { hostId: 'local', conversationId: thread });
   assert.equal(requests[2]?.targetClientId, owner);
   const steering = requests[2]?.params as { clientUserMessageId: string; restoreMessage: { cwd: string; id: string } };
   assert.equal(steering.clientUserMessageId, message);
   assert.equal(steering.restoreMessage.cwd, home);
   assert.equal(steering.restoreMessage.id, message);
   if (mode === 'idle') {
    assert.equal(requests[3]?.targetClientId, owner);
    assert.deepEqual(requests[3]?.params, { conversationId: thread, turnStart: {
     request: { threadId: thread, input: [{ type: 'text', text: 'immutable result', text_elements: [] }], clientUserMessageId: message },
     context: { inheritThreadSettings: true },
    } });
   }
  } finally { connection.close(); }
 });
}
