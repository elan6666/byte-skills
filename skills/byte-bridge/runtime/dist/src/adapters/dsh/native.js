import { sessionKey } from '../../protocol/canonical.js';
import { pluginWireText } from '../plugin-client.js';
// Exact borrowed Agent only. No controller.resolveAgent/create/resume, no steering, no dispose capability.
export function enqueueOnOriginalAgent(env, envelope) {
    if (env.agent.id !== envelope.target.native_session_id || envelope.target.runtime_generation !== env.generation || env.ctx.agents.get(env.sessionId) !== env.agent || !env.ctx.remoteAccess.allows({ kind: 'session', id: env.sessionId }))
        return { state: 'refused', reason: 'Native Agent or access scope changed' };
    const message = env.makeMessage(envelope, pluginWireText(envelope));
    if (message.source.kind !== 'sessionbridge' || message.source.message_id !== envelope.message_id || message.source.sender_session_key !== sessionKey(envelope.sender))
        return { state: 'refused', reason: 'Native message must preserve the external Agent source' };
    env.agent.followup(message);
    const queued = env.agent.inbox.nextTurn.some(item => item.id === message.id);
    return queued ? { state: 'confirmed', native_receipt: 'dsh-native-inbox:' + message.id } : { state: 'uncertain', reason: 'Native follow-up was submitted but is not in the observed inbox; reconcile without resending' };
}
//# sourceMappingURL=native.js.map