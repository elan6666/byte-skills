import { BridgeError } from '../../protocol/errors.js';
import { requireMinimumVersion } from '../version-policy.js';
/** Historical regression versions, not an exclusive allowlist. */
export const SUPPORTED_ZCODE_VERSIONS = ['0.17.0', '0.17.1'];
export const MINIMUM_ZCODE_VERSION = '0.17.0';
export const REQUIRED_ZCODE_CAPABILITIES = ['sessionLifecycleWorkspace', 'sessionWorkspaceRouting', 'historyFirst', 'sessionDirectorySource'];
/** Newer versions, prereleases and development labels use native capability checks. */
export function checkZCodeVersion(version) {
    requireMinimumVersion('ZCode', version, MINIMUM_ZCODE_VERSION);
}
export function checkZCodeCapabilities(version, sha256, raw) {
    checkZCodeVersion(version);
    const flags = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const missing = REQUIRED_ZCODE_CAPABILITIES.filter(name => flags[name] !== true);
    if (missing.length)
        throw new BridgeError('zcode_capability_missing', 'ZCode compatibility probe missing: ' + missing.join(', '), 'Use a runtime exposing the required workspace, history and source interfaces; no session was created', 3);
    const known = Object.entries(ZCODE_NATIVE_ARTIFACTS).some(([v, hash]) => v === version && hash === sha256);
    return { version, binary_sha256: sha256, state: known ? 'verified_build' : 'capability_checked', capabilities: REQUIRED_ZCODE_CAPABILITIES };
}
/** Original-session source proof additionally pins the actual desktop artifact. */
export const ZCODE_NATIVE_ARTIFACTS = {
    '0.17.0': '97490d0f06a7a225d54d47817acf4b4859cdb268b59f2490caaeda982bef063a',
    '0.17.1': '9afd565a104d660259e6bdeeaa5cb8abc74a908559e21aa3c5f6a06f2a9da6c6',
};
export function isKnownZCodeArtifact(sha256) { return Object.values(ZCODE_NATIVE_ARTIFACTS).some(hash => hash === sha256); }
//# sourceMappingURL=version.js.map