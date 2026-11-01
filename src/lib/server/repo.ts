import type { Db } from './db';
import { canLink, insertBetweenPlan } from '$lib/model/rules';
import type { GraphEdge, GraphNode, InquiryStatus, NodeKind, Rel, StanceValue } from '$lib/model/types';
import type { TextQuote } from '$lib/anchor/quote';

/** A refusal the UI can explain: `code` is an i18n key under `error.`. */
export class DomainError extends Error {
	constructor(public code: string) {
		super(code);
	}
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

// ── users ────────────────────────────────────────────────────────────────

export async function createUser(db: Db, name: string): Promise<string> {
	const clean = name.trim().slice(0, 80);
	if (!clean) throw new DomainError('nameRequired');
	const [row] = await db.query<{ id: string }>('insert into app_user (name) values ($1) returning id', [clean]);
	return row.id;
}

/** The local user for a 1lev1 member, created on first visit; the name follows 1lev1. */
export async function upsertLevUser(db: Db, levId: string, name: string): Promise<{ id: string; name: string }> {
	const [row] = await db.query<{ id: string; name: string }>(
		`insert into app_user (lev_user_id, name) values ($1, $2)
		 on conflict (lev_user_id) do update set name = excluded.name
		 returning id, name`,
		[levId, name.trim().slice(0, 80) || `#${levId}`]
	);
	return row;
}

export async function getUser(db: Db, id: string): Promise<{ id: string; name: string } | null> {
	if (!isUuid(id)) return null;
	const [row] = await db.query<{ id: string; name: string }>('select id, name from app_user where id = $1', [id]);
	return row ?? null;
}

// ── spaces ───────────────────────────────────────────────────────────────

export interface Space {
	id: string;
	slug: string;
	title: string;
	description: string;
	license: string;
	ownerRikmaId: string | null;
	nodeCount?: number;
}

const spaceCols = `s.id, s.slug, s.title, s.description, s.license, s.owner_rikma_id as "ownerRikmaId"`;

export async function createSpace(
	db: Db,
	p: { slug: string; title: string; description?: string; userId: string }
): Promise<Space> {
	const slug = p.slug.trim().toLowerCase();
	if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) throw new DomainError('badSlug');
	if (!p.title.trim()) throw new DomainError('titleRequired');
	const [exists] = await db.query('select 1 from space where slug = $1', [slug]);
	if (exists) throw new DomainError('slugTaken');
	const [row] = await db.query<Space>(
		`insert into space as s (slug, title, description, created_by) values ($1, $2, $3, $4) returning ${spaceCols}`,
		[slug, p.title.trim(), (p.description ?? '').trim(), p.userId]
	);
	return row;
}

export async function listSpaces(db: Db): Promise<Space[]> {
	return db.query<Space>(
		`select ${spaceCols}, (select count(*)::int from node n where n.space_id = s.id) as "nodeCount"
		   from space s where s.visibility = 'public' order by s.created_at desc`
	);
}

export async function getSpace(db: Db, slug: string): Promise<Space | null> {
	const [row] = await db.query<Space>(`select ${spaceCols} from space s where s.slug = $1`, [slug]);
	return row ?? null;
}

// ── nodes ────────────────────────────────────────────────────────────────

const nodeCols = `n.id, n.kind, r.title, n.current_rev as "currentRev", n.inquiry_status as "inquiryStatus",
  n.absorbed_into as "absorbedInto", n.attributed_to as "attributedTo", n.created_by as "createdBy",
  u.name as "authorName"`;
const nodeFrom = `from node n
  join node_rev r on r.node_id = n.id and r.rev = n.current_rev
  join app_user u on u.id = n.created_by`;

export interface NodeDetail extends GraphNode {
	spaceId: string;
	body: string;
	source: string | null;
	inquiryNote: string | null;
	createdAt: string;
}

export async function getNode(db: Db, spaceId: string, id: string): Promise<NodeDetail | null> {
	if (!isUuid(id)) return null;
	const [row] = await db.query<NodeDetail>(
		`select ${nodeCols}, n.space_id as "spaceId", r.body, r.source, n.inquiry_note as "inquiryNote",
		        n.created_at as "createdAt"
		   ${nodeFrom} where n.id = $1 and n.space_id = $2`,
		[id, spaceId]
	);
	return row ?? null;
}

async function nodeKind(
	db: Db,
	spaceId: string,
	id: string
): Promise<{ kind: NodeKind; currentRev: number; createdBy: string }> {
	if (!isUuid(id)) throw new DomainError('notFound');
	const [row] = await db.query<{ kind: NodeKind; currentRev: number; createdBy: string }>(
		'select kind, current_rev as "currentRev", created_by as "createdBy" from node where id = $1 and space_id = $2',
		[id, spaceId]
	);
	if (!row) throw new DomainError('notFound');
	return row;
}

export interface NodeInput {
	spaceId: string;
	kind: NodeKind;
	title: string;
	body?: string;
	source?: string | null;
	attributedTo?: string | null;
	userId: string;
	/** What this node responds to — optionally one passage of it. Required for everything but a question or a document. */
	link?: { rel: Rel; to: string; anchor?: TextQuote | null };
}

/** The one place edges are written; a `partOf` edge goes to the end of its document. */
async function insertEdge(
	db: Db,
	e: { spaceId: string; rel: Rel; from: string; to: string; toRev: number | null; anchor?: TextQuote | null; userId: string }
): Promise<string> {
	const [row] = await db.query<{ id: string }>(
		`insert into edge (space_id, rel, from_node, to_node, to_rev, anchor, ord, created_by)
		 values ($1, $2, $3, $4, $5, $6::jsonb,
		         case when $2 = 'partOf' then
		           (select coalesce(max(ord), 0) + 1 from edge where to_node = $4 and rel = 'partOf' and superseded_by is null)
		         end,
		         $7)
		 returning id`,
		[e.spaceId, e.rel, e.from, e.to, e.toRev, e.anchor ? JSON.stringify(e.anchor) : null, e.userId]
	);
	return row.id;
}

export async function createNode(db: Db, p: NodeInput): Promise<string> {
	const title = p.title.trim();
	if (!title) throw new DomainError('titleRequired');
	if (title.length > 300) throw new DomainError('titleTooLong');
	if (!p.link && p.kind !== 'question' && p.kind !== 'document') throw new DomainError('needsParent');

	return db.transaction(async (tx) => {
		let parentRev: number | null = null;
		if (p.link) {
			const parent = await nodeKind(tx, p.spaceId, p.link.to);
			if (!canLink(p.kind, p.link.rel, parent.kind)) throw new DomainError('badLink');
			if (p.link.rel === 'partOf' && parent.createdBy !== p.userId) throw new DomainError('authorOnly');
			parentRev = parent.currentRev;
		}
		const [n] = await tx.query<{ id: string }>(
			`insert into node (space_id, kind, attributed_to, created_by) values ($1, $2, $3, $4) returning id`,
			[p.spaceId, p.kind, p.attributedTo?.trim() || null, p.userId]
		);
		await tx.query(
			`insert into node_rev (node_id, rev, title, body, source, author_id) values ($1, 1, $2, $3, $4, $5)`,
			[n.id, title, (p.body ?? '').trim(), p.source?.trim() || null, p.userId]
		);
		if (p.link) {
			await insertEdge(tx, {
				spaceId: p.spaceId,
				rel: p.link.rel,
				from: n.id,
				to: p.link.to,
				toRev: parentRev,
				anchor: p.link.anchor ?? null,
				userId: p.userId
			});
		}
		return n.id;
	});
}

/** Only the author issues a new revision; everyone else answers with a node of their own. */
export async function reviseNode(
	db: Db,
	p: { spaceId: string; nodeId: string; userId: string; title: string; body?: string; source?: string | null }
): Promise<number> {
	const title = p.title.trim();
	if (!title) throw new DomainError('titleRequired');
	return db.transaction(async (tx) => {
		const [n] = await tx.query<{ createdBy: string; currentRev: number }>(
			'select created_by as "createdBy", current_rev as "currentRev" from node where id = $1 and space_id = $2 for update',
			[p.nodeId, p.spaceId]
		);
		if (!n) throw new DomainError('notFound');
		if (n.createdBy !== p.userId) throw new DomainError('authorOnly');
		const rev = n.currentRev + 1;
		await tx.query(
			`insert into node_rev (node_id, rev, title, body, source, author_id) values ($1, $2, $3, $4, $5, $6)`,
			[p.nodeId, rev, title, (p.body ?? '').trim(), p.source?.trim() || null, p.userId]
		);
		await tx.query('update node set current_rev = $2 where id = $1', [p.nodeId, rev]);
		return rev;
	});
}

export interface Revision {
	rev: number;
	title: string;
	body: string;
	source: string | null;
	authorName: string;
	createdAt: string;
}

export async function listRevisions(db: Db, nodeId: string): Promise<Revision[]> {
	return db.query<Revision>(
		`select r.rev, r.title, r.body, r.source, u.name as "authorName", r.created_at as "createdAt"
		   from node_rev r join app_user u on u.id = r.author_id where r.node_id = $1 order by r.rev desc`,
		[nodeId]
	);
}

// ── edges ────────────────────────────────────────────────────────────────

/** Link two existing nodes: the same argument may serve many claims. */
export async function linkNodes(
	db: Db,
	p: { spaceId: string; from: string; rel: Rel; to: string; userId: string }
): Promise<string> {
	if (p.from === p.to) throw new DomainError('selfLink');
	return db.transaction(async (tx) => {
		const from = await nodeKind(tx, p.spaceId, p.from);
		const to = await nodeKind(tx, p.spaceId, p.to);
		if (!canLink(from.kind, p.rel, to.kind)) throw new DomainError('badLink');
		if (p.rel === 'partOf' && to.createdBy !== p.userId) throw new DomainError('authorOnly');
		const [dup] = await tx.query(
			'select 1 from edge where from_node = $1 and to_node = $2 and rel = $3 and superseded_by is null',
			[p.from, p.to, p.rel]
		);
		if (dup) throw new DomainError('alreadyLinked');
		return insertEdge(tx, { spaceId: p.spaceId, rel: p.rel, from: p.from, to: p.to, toRev: to.currentRev, userId: p.userId });
	});
}

/**
 * A —rel→ C becomes A —lowerRel→ B —rel→ C. The old edge is kept and marked
 * superseded, so whoever argued A→C can see that a step was added.
 */
export async function insertBetween(
	db: Db,
	p: { spaceId: string; edgeId: string; userId: string; title: string; body?: string; lowerRel: Rel }
): Promise<string> {
	if (!isUuid(p.edgeId)) throw new DomainError('notFound');
	return db.transaction(async (tx) => {
		const [e] = await tx.query<{ rel: Rel; from: string; to: string }>(
			`select rel, from_node as "from", to_node as "to" from edge
			  where id = $1 and space_id = $2 and superseded_by is null`,
			[p.edgeId, p.spaceId]
		);
		if (!e) throw new DomainError('notFound');
		const from = await nodeKind(tx, p.spaceId, e.from);
		const to = await nodeKind(tx, p.spaceId, e.to);
		const plan = insertBetweenPlan(e.rel, from.kind, to.kind);
		if (!plan || !plan.lowerRels.includes(p.lowerRel)) throw new DomainError('badLink');

		const middle = await createNode(tx, {
			spaceId: p.spaceId,
			kind: plan.middleKind,
			title: p.title,
			body: p.body,
			userId: p.userId,
			link: { rel: e.rel, to: e.to }
		});
		const [lower] = await tx.query<{ id: string }>(
			`insert into edge (space_id, rel, from_node, to_node, to_rev, created_by) values ($1, $2, $3, $4, 1, $5) returning id`,
			[p.spaceId, p.lowerRel, e.from, middle, p.userId]
		);
		await tx.query('update edge set superseded_by = $2 where id = $1', [p.edgeId, lower.id]);
		return middle;
	});
}

/** The edges leaving a node: what it responds to. */
export interface ParentLink {
	edgeId: string;
	rel: Rel;
	toId: string;
	toKind: NodeKind;
	toTitle: string;
	stale: boolean;
	anchor: TextQuote | null;
}

export async function parentsOf(db: Db, nodeId: string): Promise<ParentLink[]> {
	return db.query<ParentLink>(
		`select e.id as "edgeId", e.rel, n.id as "toId", n.kind as "toKind", r.title as "toTitle", e.anchor,
		        (e.to_rev is not null and e.to_rev < n.current_rev) as stale
		   from edge e
		   join node n on n.id = e.to_node
		   join node_rev r on r.node_id = n.id and r.rev = n.current_rev
		  where e.from_node = $1 and e.superseded_by is null
		  order by e.created_at`,
		[nodeId]
	);
}

// ── the graph around a node ──────────────────────────────────────────────

/** Everything that (transitively) responds to `rootId`, in one recursive query. */
export async function loadSubgraph(
	db: Db,
	rootId: string
): Promise<{ nodes: Map<string, GraphNode>; edges: GraphEdge[] }> {
	const ids = await db.query<{ id: string }>(
		`with recursive sub(id) as (
		   select $1::uuid
		   union
		   select e.from_node from edge e join sub on e.to_node = sub.id where e.superseded_by is null
		 ) select id from sub`,
		[rootId]
	);
	const idList = ids.map((r) => r.id);
	if (idList.length === 0) return { nodes: new Map(), edges: [] };
	const nodes = await db.query<GraphNode>(`select ${nodeCols} ${nodeFrom} where n.id = any($1::uuid[])`, [idList]);
	const edges = await db.query<GraphEdge>(
		`select id, rel, from_node as "from", to_node as "to", to_rev as "toRev", anchor, ord from edge
		  where superseded_by is null and to_node = any($1::uuid[]) and from_node = any($1::uuid[])
		  order by created_at`,
		[idList]
	);
	return { nodes: new Map(nodes.map((n) => [n.id, n])), edges };
}

/** Body and source of the current revision of several nodes (a document's blocks and their alternatives). */
export async function getBodies(db: Db, ids: string[]): Promise<Record<string, { body: string; source: string | null }>> {
	if (ids.length === 0) return {};
	const rows = await db.query<{ id: string; body: string; source: string | null }>(
		`select n.id, r.body, r.source from node n join node_rev r on r.node_id = n.id and r.rev = n.current_rev
		  where n.id = any($1::uuid[])`,
		[ids]
	);
	return Object.fromEntries(rows.map((r) => [r.id, { body: r.body, source: r.source }]));
}

/** Swap a block with its neighbour. Only the document's author arranges it. */
export async function moveBlock(
	db: Db,
	p: { spaceId: string; docId: string; edgeId: string; dir: 'up' | 'down'; userId: string }
): Promise<void> {
	await db.transaction(async (tx) => {
		const doc = await nodeKind(tx, p.spaceId, p.docId);
		if (doc.kind !== 'document') throw new DomainError('notFound');
		if (doc.createdBy !== p.userId) throw new DomainError('authorOnly');
		const blocks = await tx.query<{ id: string; ord: number }>(
			`select id, ord from edge where to_node = $1 and rel = 'partOf' and superseded_by is null order by ord, created_at`,
			[p.docId]
		);
		const i = blocks.findIndex((b) => b.id === p.edgeId);
		if (i === -1) throw new DomainError('notFound');
		const j = p.dir === 'up' ? i - 1 : i + 1;
		if (j < 0 || j >= blocks.length) return;
		await tx.query('update edge set ord = $2 where id = $1', [blocks[i].id, blocks[j].ord]);
		await tx.query('update edge set ord = $2 where id = $1', [blocks[j].id, blocks[i].ord]);
	});
}

export async function listDocuments(db: Db, spaceId: string): Promise<(GraphNode & { blockCount: number })[]> {
	return db.query(
		`select ${nodeCols},
		        (select count(*)::int from edge c where c.to_node = n.id and c.rel = 'partOf' and c.superseded_by is null) as "blockCount"
		   ${nodeFrom}
		  where n.space_id = $1 and n.kind = 'document'
		  order by n.created_at desc`,
		[spaceId]
	);
}

/** Questions that respond to nothing: the entry points of a space. */
export async function rootQuestions(db: Db, spaceId: string): Promise<(GraphNode & { childCount: number })[]> {
	return db.query(
		`select ${nodeCols},
		        (select count(*)::int from edge c where c.to_node = n.id and c.superseded_by is null) as "childCount"
		   ${nodeFrom}
		  where n.space_id = $1 and n.kind = 'question'
		    and not exists (select 1 from edge e where e.from_node = n.id and e.superseded_by is null)
		  order by n.created_at desc`,
		[spaceId]
	);
}

export async function recentNodes(db: Db, spaceId: string, limit = 12): Promise<(GraphNode & { createdAt: string })[]> {
	return db.query(
		`select ${nodeCols}, n.created_at as "createdAt" ${nodeFrom}
		  where n.space_id = $1 order by n.created_at desc limit $2`,
		[spaceId, limit]
	);
}

// ── inquiry status & synthesis ───────────────────────────────────────────

export async function setInquiryStatus(
	db: Db,
	p: {
		spaceId: string;
		nodeId: string;
		userId: string;
		status: InquiryStatus | null;
		note?: string;
		absorbedInto?: string | null;
	}
): Promise<void> {
	const [n] = await db.query<{ createdBy: string }>(
		'select created_by as "createdBy" from node where id = $1 and space_id = $2',
		[p.nodeId, p.spaceId]
	);
	if (!n) throw new DomainError('notFound');
	if (n.createdBy !== p.userId) throw new DomainError('authorOnly');
	const note = (p.note ?? '').trim();
	if (p.status && p.status !== 'exploring' && !note) throw new DomainError('noteRequired');
	if (p.absorbedInto) {
		if (p.absorbedInto === p.nodeId) throw new DomainError('selfLink');
		await nodeKind(db, p.spaceId, p.absorbedInto);
	}
	await db.query(
		'update node set inquiry_status = $2, inquiry_note = $3, absorbed_into = $4 where id = $1',
		[p.nodeId, p.status, note || null, p.absorbedInto || null]
	);
}

/**
 * Merge without deleting: a synthesis node that points at every position it
 * unites (and answers their question, if given). The positions stay on the map.
 */
export async function synthesize(
	db: Db,
	p: { spaceId: string; positionIds: string[]; questionId?: string | null; title: string; body?: string; userId: string }
): Promise<string> {
	const ids = [...new Set(p.positionIds)];
	if (ids.length < 2) throw new DomainError('synthesisNeedsTwo');
	return db.transaction(async (tx) => {
		for (const id of ids) {
			const k = await nodeKind(tx, p.spaceId, id);
			if (!canLink('synthesis', 'synthesizes', k.kind)) throw new DomainError('badLink');
		}
		const id = await createNode(tx, {
			spaceId: p.spaceId,
			kind: 'synthesis',
			title: p.title,
			body: p.body,
			userId: p.userId,
			link: p.questionId ? { rel: 'answers', to: p.questionId } : { rel: 'synthesizes', to: ids[0] }
		});
		for (const pid of p.questionId ? ids : ids.slice(1)) {
			await linkNodes(tx, { spaceId: p.spaceId, from: id, rel: 'synthesizes', to: pid, userId: p.userId });
		}
		return id;
	});
}

// ── stances ──────────────────────────────────────────────────────────────

export async function setStance(
	db: Db,
	p: { userId: string; nodeId: string; value: StanceValue | null; public: boolean }
): Promise<void> {
	if (p.value === null) {
		await db.query('delete from stance where user_id = $1 and node_id = $2', [p.userId, p.nodeId]);
		return;
	}
	await db.query(
		`insert into stance (user_id, node_id, value, public) values ($1, $2, $3, $4)
		 on conflict (user_id, node_id) do update set value = excluded.value, public = excluded.public, updated_at = now()`,
		[p.userId, p.nodeId, p.value, p.public]
	);
}

export interface Stances {
	mine: { value: StanceValue; public: boolean } | null;
	/** Only stances their holders chose to publish. Never a tally that decides anything. */
	published: { name: string; value: StanceValue }[];
}

export async function getStances(db: Db, nodeId: string, userId: string | null): Promise<Stances> {
	const published = await db.query<{ name: string; value: StanceValue }>(
		`select u.name, s.value from stance s join app_user u on u.id = s.user_id
		  where s.node_id = $1 and s.public order by s.updated_at desc`,
		[nodeId]
	);
	let mine: Stances['mine'] = null;
	if (userId) {
		const [row] = await db.query<{ value: StanceValue; public: boolean }>(
			'select value, public from stance where user_id = $1 and node_id = $2',
			[userId, nodeId]
		);
		mine = row ?? null;
	}
	return { mine, published };
}
