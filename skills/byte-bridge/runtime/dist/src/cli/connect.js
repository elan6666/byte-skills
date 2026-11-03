import { harnessGuidance } from '../adapters/guidance.js';
export function connectionInstructions(harness) {
    const route = harnessGuidance(harness);
    return { harness, state: 'needs_setup', steps: [route.activation, route.tool, route.limit,
            ...(route.managed ? [`Before a dedicated managed worker, describe --query cli.host.${harness} --json; provide its isolated profile, native permissions and authorized lifetime.`] : []),
            'Run preflight for only the selected clients, then verify context from the actual original native source. Installation is not connection or execution.',
            'A blocked native route stays in Bridge: no CUA, typing, clipboard or direct chat-message fallback; never select the latest session or borrow another connection.'] };
}
//# sourceMappingURL=connect.js.map