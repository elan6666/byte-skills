import { digest } from '../protocol/canonical.js';
export function runEventId(leaseId, proof) { return digest({ lease_id: leaseId, identity: proof.identity, status: proof.status, exit_code: proof.exit_code, artifacts: proof.artifacts }); }
//# sourceMappingURL=events.js.map