/**
 * The vocabulary of the map. See docs/MODEL.md.
 *
 * Every edge points from the CHILD to the PARENT it responds to:
 * an argument `opposes` the position it attacks, a position `answers`
 * its question. "Children of N" are therefore the edges whose `to` is N.
 */

export const NODE_KINDS = ['question', 'position', 'argument', 'evidence', 'synthesis'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const RELS = [
	'answers', // position|synthesis → question
	'refines', // position → position|synthesis   (a branch: X.x under X)
	'supports', // argument|evidence → claim       (for)
	'opposes', // argument|evidence → claim        (against)
	'premise', // argument → argument              (an assumption the argument rests on)
	'synthesizes', // synthesis → position|synthesis (a merge that keeps both sides)
	'arisesFrom' // question → any node            (a question this node raises)
] as const;
export type Rel = (typeof RELS)[number];

export const INQUIRY_STATUSES = ['exploring', 'concluded', 'deadEnd', 'parked'] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const STANCE_VALUES = ['agree', 'disagree', 'unsure'] as const;
export type StanceValue = (typeof STANCE_VALUES)[number];

export interface GraphNode {
	id: string;
	kind: NodeKind;
	title: string;
	currentRev: number;
	inquiryStatus: InquiryStatus | null;
	absorbedInto: string | null;
	attributedTo: string | null;
	createdBy: string;
	authorName?: string;
}

export interface GraphEdge {
	id: string;
	rel: Rel;
	from: string;
	to: string;
	/** The revision of `to` this edge responded to. */
	toRev: number | null;
}

export function isNodeKind(v: unknown): v is NodeKind {
	return typeof v === 'string' && (NODE_KINDS as readonly string[]).includes(v);
}
export function isRel(v: unknown): v is Rel {
	return typeof v === 'string' && (RELS as readonly string[]).includes(v);
}
export function isInquiryStatus(v: unknown): v is InquiryStatus {
	return typeof v === 'string' && (INQUIRY_STATUSES as readonly string[]).includes(v);
}
export function isStanceValue(v: unknown): v is StanceValue {
	return typeof v === 'string' && (STANCE_VALUES as readonly string[]).includes(v);
}
