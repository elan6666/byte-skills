import { createHash } from 'node:crypto';
function normalize(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return value;
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (Array.isArray(value))
        return value.map(normalize);
    if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
    }
    throw new TypeError('Only finite JSON values can be hashed');
}
export function canonical(value) { return JSON.stringify(normalize(value)); }
export function digest(value) { return createHash('sha256').update(canonical(value), 'utf8').digest('hex'); }
export function sessionKey(identity) { return digest(identity); }
//# sourceMappingURL=canonical.js.map