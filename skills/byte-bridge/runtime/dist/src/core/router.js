export function chooseRoute(context) {
    // Single-machine hub: one host may talk to any enrolled session. Project ids are labels.
    if (context.source.host_id !== context.target.identity.host_id)
        return { kind: 'blocked', route_id: 'blocked', reason: 'Cross-machine route is outside this scope' };
    if (context.native?.tool_name && context.native.evidence && context.source.harness === context.target.identity.harness)
        return { kind: 'native', route_id: 'native:' + context.native.tool_name };
    if (context.adapter_id && context.target.mode !== 'manual')
        return { kind: 'adapter', route_id: 'adapter:' + context.adapter_id };
    return { kind: 'blocked', route_id: 'blocked', reason: 'No reachable native tool or registered adapter' };
}
//# sourceMappingURL=router.js.map