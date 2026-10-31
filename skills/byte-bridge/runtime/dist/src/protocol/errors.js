export class BridgeError extends Error {
    code;
    recovery;
    exitCode;
    constructor(code, message, recovery, exitCode = 2) {
        super(message);
        this.code = code;
        this.recovery = recovery;
        this.exitCode = exitCode;
        this.name = 'BridgeError';
    }
}
//# sourceMappingURL=errors.js.map