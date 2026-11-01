import type { NodeKind, Rel } from './types';

/**
 * Which (child kind, rel) pairs may attach to a parent of a given kind.
 * The single source of truth for both the server validation and the
 * "what can I add here" menu.
 */
const ALLOWED: Record<Rel, { from: readonly NodeKind[]; to: readonly NodeKind[] }> = {
	answers: { from: ['position', 'synthesis'], to: ['question'] },
	refines: { from: ['position'], to: ['position', 'synthesis'] },
	supports: { from: ['argument', 'evidence'], to: ['position', 'argument', 'evidence', 'synthesis'] },
	opposes: { from: ['argument', 'evidence'], to: ['position', 'argument', 'evidence', 'synthesis'] },
	premise: { from: ['argument'], to: ['argument'] },
	synthesizes: { from: ['synthesis'], to: ['position', 'synthesis'] },
	arisesFrom: { from: ['question'], to: ['question', 'position', 'argument', 'evidence', 'synthesis'] }
};

export function canLink(fromKind: NodeKind, rel: Rel, toKind: NodeKind): boolean {
	const r = ALLOWED[rel];
	return r.from.includes(fromKind) && r.to.includes(toKind);
}

export interface ChildOption {
	kind: NodeKind;
	rel: Rel;
	/** i18n key under `add.` */
	key: string;
}

/** The menu of things a reader can add under a node, in display order. */
export function childOptions(parent: NodeKind): ChildOption[] {
	const all: ChildOption[] = [
		{ kind: 'position', rel: 'answers', key: 'answer' },
		{ kind: 'position', rel: 'refines', key: 'branch' },
		{ kind: 'argument', rel: 'supports', key: 'argumentFor' },
		{ kind: 'argument', rel: 'opposes', key: 'argumentAgainst' },
		{ kind: 'evidence', rel: 'supports', key: 'evidenceFor' },
		{ kind: 'evidence', rel: 'opposes', key: 'evidenceAgainst' },
		{ kind: 'argument', rel: 'premise', key: 'premise' },
		{ kind: 'question', rel: 'arisesFrom', key: 'question' }
	];
	return all.filter((o) => canLink(o.kind, o.rel, parent));
}

/**
 * Inserting B into the edge A —rel→ C yields A —lower→ B —rel→ C.
 * Returns the kind B must have and the rels allowed for the lower edge,
 * or null when the edge cannot be split.
 */
export function insertBetweenPlan(
	rel: Rel,
	fromKind: NodeKind,
	toKind: NodeKind
): { middleKind: NodeKind; lowerRels: Rel[] } | null {
	if (rel === 'supports' || rel === 'opposes') {
		const lowerRels = (['supports', 'opposes'] as Rel[]).filter((r) => canLink(fromKind, r, 'argument'));
		if (!canLink('argument', rel, toKind) || lowerRels.length === 0) return null;
		return { middleKind: 'argument', lowerRels };
	}
	if (rel === 'refines') {
		if (!canLink('position', 'refines', toKind) || !canLink(fromKind, 'refines', 'position')) return null;
		return { middleKind: 'position', lowerRels: ['refines'] };
	}
	return null;
}
