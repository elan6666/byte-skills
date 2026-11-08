import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseRoute } from '../../src/core/router.js';
import { hubRoot } from '../../src/core/hub.js';
import type { BindingRecord, SessionIdentity } from '../../src/protocol/types.js';

const identity = (overrides: Partial<SessionIdentity> = {}): SessionIdentity => ({
 harness: 'codex', host_id: 'host-a', profile_id: 'profile', native_session_id: 'native-1', project_id: 'project-a', runtime_generation: 'gen-1', ...overrides
});
const record = (overrides: Partial<SessionIdentity> = {}): BindingRecord => ({
 binding_id: 'binding-1', alias: 'worker', mode: 'native', endpoint_ref: 'endpoint', expires_at: '2099-01-01T00:00:00Z',
 identity: identity(overrides), capabilities: [], native_key: 'key', session_key: 'session', active: true
} as unknown as BindingRecord);

test('hub root honors BYTE_BRIDGE_HOME', () => {
 const previous = process.env.BYTE_BRIDGE_HOME;
 process.env.BYTE_BRIDGE_HOME = '/tmp/byte-bridge-test-home';
 try { assert.equal(hubRoot(), '/tmp/byte-bridge-test-home'); } finally {
  if (previous === undefined) delete process.env.BYTE_BRIDGE_HOME; else process.env.BYTE_BRIDGE_HOME = previous;
 }
});

test('cross-project route is allowed on the same host', () => {
 const route = chooseRoute({ source: identity({ project_id: 'project-a' }), target: record({ project_id: 'project-b' }), adapter_id: 'codex' });
 assert.equal(route.kind, 'adapter');
});

test('cross-machine route stays blocked', () => {
 const route = chooseRoute({ source: identity({ host_id: 'host-a' }), target: record({ host_id: 'host-b' }), adapter_id: 'codex' });
 assert.equal(route.kind, 'blocked');
});
