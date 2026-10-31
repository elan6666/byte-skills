export class AdapterRegistry {
    adapters = new Map();
    register(harness, adapter) { this.adapters.set(harness, adapter); }
    get(harness) { return this.adapters.get(harness); }
}
//# sourceMappingURL=registry.js.map