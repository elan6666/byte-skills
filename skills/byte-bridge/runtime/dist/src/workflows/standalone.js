import { digest, sessionKey } from '../protocol/canonical.js';
export function scopeDigest(input) { return digest(input); }
export class StandaloneWorkflow {
    async check(actor, ref, input) {
        const { authority: _authority, ...scope } = input;
        if (ref.workflow !== 'standalone')
            return { state: 'denied', evidence: null, reason: 'Byte authority must use the Byte provider' };
        const granted = ref.owner_session_key === sessionKey(actor.session) && ref.scope_digest === scopeDigest(scope) && actor.scope.project_id === input.source.project_id && sessionKey(actor.session) === sessionKey(input.source);
        return { state: granted ? 'granted' : 'denied', evidence: granted ? 'standalone task scope checked' : null, reason: granted ? undefined : 'Owner or scope digest mismatch' };
    }
}
//# sourceMappingURL=standalone.js.map