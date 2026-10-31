export async function listSessions(service, selector) { return (await service.resolve(selector)).map(({ endpoint_ref: _private, ...record }) => record); }
//# sourceMappingURL=sessions.js.map