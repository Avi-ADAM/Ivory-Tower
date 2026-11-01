import type { GraphEdge } from './types';

/**
 * Structural status: where the inquiry around a node stands. It is computed
 * from the shape of the graph, never from a vote, and it says nothing about
 * who is right — only whether an objection is still waiting for an answer.
 *
 *  - unchallenged: nothing opposes it.
 *  - contested:    at least one opposer is itself still standing.
 *  - answered:     every opposer has been met by a standing counter.
 *
 * "Standing" is the usual grounded rule: a node stands unless some opposer
 * of it stands. On a cycle (A opposes B opposes A) the nodes on the cycle are
 * treated as standing, so a loop can never make an objection disappear.
 */
export type StructuralStatus = 'unchallenged' | 'contested' | 'answered';

export interface NodeStatus {
	status: StructuralStatus;
	/** Has at least one `supports` child. Meaningful for claims, not for questions. */
	supported: boolean;
	openObjections: number;
	answeredObjections: number;
}

export function computeStatuses(nodeIdsIn: Iterable<string>, edges: readonly GraphEdge[]): Map<string, NodeStatus> {
	const nodeIds = [...nodeIdsIn];
	const opposers = new Map<string, string[]>();
	const supported = new Set<string>();
	for (const e of edges) {
		if (e.rel === 'opposes') {
			const list = opposers.get(e.to) ?? [];
			list.push(e.from);
			opposers.set(e.to, list);
		} else if (e.rel === 'supports') {
			supported.add(e.to);
		}
	}

	// Grounded labelling: IN when every opposer is OUT, OUT when some opposer
	// is IN; whatever is left (cycles) is undecided and counts as standing.
	const ids = new Set<string>(nodeIds);
	for (const [to, list] of opposers) {
		ids.add(to);
		for (const f of list) ids.add(f);
	}
	const label = new Map<string, 'in' | 'out'>();
	let changed = true;
	while (changed) {
		changed = false;
		for (const id of ids) {
			if (label.has(id)) continue;
			const ops = opposers.get(id) ?? [];
			if (ops.every((o) => label.get(o) === 'out')) {
				label.set(id, 'in');
				changed = true;
			} else if (ops.some((o) => label.get(o) === 'in')) {
				label.set(id, 'out');
				changed = true;
			}
		}
	}
	const stands = (id: string) => label.get(id) !== 'out';

	const out = new Map<string, NodeStatus>();
	for (const id of nodeIds) {
		const ops = opposers.get(id) ?? [];
		const open = ops.filter((o) => stands(o)).length;
		out.set(id, {
			status: ops.length === 0 ? 'unchallenged' : open > 0 ? 'contested' : 'answered',
			supported: supported.has(id),
			openObjections: open,
			answeredObjections: ops.length - open
		});
	}
	return out;
}
