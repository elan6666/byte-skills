import { DatabaseSync } from 'node:sqlite';
import { BridgeError } from '../protocol/errors.js';
export class FakeAdapter {
    db;
    constructor(path) { this.db = new DatabaseSync(path); this.db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS queue(id INTEGER PRIMARY KEY AUTOINCREMENT,envelope_json TEXT NOT NULL);'); }
    get enqueueCount() { return Number(this.db.prepare('SELECT count(*) n FROM queue').get()?.n); }
    async probe() { return { harness: 'fake', version: 'test', modes: { attached: { supported: true, evidence: 'test transport only', constraints: ['Not a real harness'] } }, capabilities: [] }; }
    async discover() { return []; }
    async enroll(_context) { throw new BridgeError('unsupported', 'Fake transport cannot enroll real sessions', 'Use an actual host connector', 3); }
    async deliver(envelope) { const row = this.db.prepare('INSERT INTO queue(envelope_json) VALUES (?)').run(JSON.stringify(envelope)); return { state: 'confirmed', native_receipt: String(row.lastInsertRowid) }; }
    async reconcile(envelope) { return this.db.prepare('SELECT * FROM queue').all().filter(row => JSON.parse(String(row.envelope_json)).message_id === envelope.message_id).map(row => ({ state: 'accepted', message_id: envelope.message_id, session: envelope.target, native_receipt: String(row.id), artifacts: [] })); }
    async *observe(_binding, _signal) { return; }
    async disconnect(_bindingId) { this.db.close(); }
}
//# sourceMappingURL=fake.js.map