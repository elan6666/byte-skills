/** Exact adapted versions; unknown future releases remain blocked. */
export const SUPPORTED_ZCODE_VERSIONS = ['0.17.0', '0.17.1'];
/** Original-session source proof additionally pins the actual desktop artifact. */
export const ZCODE_NATIVE_ARTIFACTS = {
    '0.17.0': '97490d0f06a7a225d54d47817acf4b4859cdb268b59f2490caaeda982bef063a',
    '0.17.1': '9afd565a104d660259e6bdeeaa5cb8abc74a908559e21aa3c5f6a06f2a9da6c6',
};
export function isKnownZCodeArtifact(sha256) { return Object.values(ZCODE_NATIVE_ARTIFACTS).some(hash => hash === sha256); }
//# sourceMappingURL=version.js.map