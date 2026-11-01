import type { GraphEdge, GraphNode, Rel } from './types';

/**
 * The map is a graph; a tree is one reader's view of it from a chosen root.
 * A node reachable along two paths appears under both; the second time it
 * is marked `repeat` and not expanded, so cycles and diamonds stay finite.
 */
export interface TreeItem {
	node: GraphNode;
	/** The edge that led here from the parent; null for the root. */
	via: GraphEdge | null;
	/** The parent's revision moved on since this edge was made. */
	stale: boolean;
	repeat: boolean;
	children: TreeItem[];
}

/** Display order of children: answers and branches first, then for, against, the rest. */
const REL_ORDER: Record<Rel, number> = {
	partOf: -1,
	answers: 0,
	alternativeTo: 1,
	synthesizes: 1,
	refines: 2,
	supports: 3,
	opposes: 4,
	premise: 5,
	arisesFrom: 6
};

export function childrenIndex(edges: readonly GraphEdge[]): Map<string, GraphEdge[]> {
	const idx = new Map<string, GraphEdge[]>();
	for (const e of edges) {
		const list = idx.get(e.to) ?? [];
		list.push(e);
		idx.set(e.to, list);
	}
	for (const list of idx.values()) {
		list.sort((a, b) => REL_ORDER[a.rel] - REL_ORDER[b.rel] || (a.ord ?? 0) - (b.ord ?? 0));
	}
	return idx;
}

export function buildTree(
	rootId: string,
	nodes: ReadonlyMap<string, GraphNode>,
	edges: readonly GraphEdge[],
	maxDepth = 12
): TreeItem | null {
	const root = nodes.get(rootId);
	if (!root) return null;
	const idx = childrenIndex(edges);
	const seen = new Set<string>();

	const walk = (node: GraphNode, via: GraphEdge | null, parent: GraphNode | null, depth: number): TreeItem => {
		const repeat = seen.has(node.id);
		seen.add(node.id);
		const stale = !!(via && parent && via.toRev !== null && via.toRev < parent.currentRev);
		const children: TreeItem[] = [];
		if (!repeat && depth < maxDepth) {
			for (const e of idx.get(node.id) ?? []) {
				const child = nodes.get(e.from);
				if (child) children.push(walk(child, e, node, depth + 1));
			}
		}
		return { node, via, stale, repeat, children };
	};

	return walk(root, null, null, 0);
}

/** Positions that answer the same question are sibling paths; count them for the summary line. */
export function countByRel(children: readonly GraphEdge[]): Partial<Record<Rel, number>> {
	const out: Partial<Record<Rel, number>> = {};
	for (const e of children) out[e.rel] = (out[e.rel] ?? 0) + 1;
	return out;
}
