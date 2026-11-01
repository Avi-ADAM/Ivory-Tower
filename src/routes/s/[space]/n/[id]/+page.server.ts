import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import * as repo from '$lib/server/repo';
import { attempt, requireUser, str } from '$lib/server/session';
import { BLOCK_KINDS, childOptions, insertBetweenPlan } from '$lib/model/rules';
import { parseQuote } from '$lib/anchor/quote';
import type { GraphEdge, GraphNode } from '$lib/model/types';
import type { DocBlock, DocResponse } from '$lib/model/doc';
import { computeStatuses, type NodeStatus } from '$lib/model/status';
import { buildTree, childrenIndex } from '$lib/model/tree';
import { isInquiryStatus, isNodeKind, isRel, isStanceValue, RELS, type Rel } from '$lib/model/types';

export const load: PageServerLoad = async ({ params, parent, url, locals }) => {
	const { space } = await parent();
	const db = await getDb();
	const node = await repo.getNode(db, space.id, params.id);
	if (!node) error(404, { message: 'Node not found' });

	const [parents, { nodes, edges }, stances] = await Promise.all([
		repo.parentsOf(db, node.id),
		repo.loadSubgraph(db, node.id),
		repo.getStances(db, node.id, locals.user?.id ?? null)
	]);
	const statusMap = computeStatuses(nodes.keys(), edges);
	const statuses: Record<string, NodeStatus> = Object.fromEntries(statusMap);

	// Direct responses, grouped by relation, each with how it may be split.
	const direct = childrenIndex(edges).get(node.id) ?? [];
	const groups: { rel: Rel; items: { edgeId: string; anchor: GraphEdge["anchor"]; child: NonNullable<ReturnType<typeof nodes.get>>; stale: boolean; insert: ReturnType<typeof insertBetweenPlan> }[] }[] = [];
	for (const rel of RELS) {
		const items = direct
			.filter((e) => e.rel === rel && nodes.has(e.from))
			.map((e) => {
				const child = nodes.get(e.from)!;
				return {
					edgeId: e.id,
					anchor: e.anchor ?? null,
					child,
					stale: e.toRev !== null && e.toRev < node.currentRev,
					insert: insertBetweenPlan(e.rel, child.kind, node.kind)
				};
			});
		if (items.length) groups.push({ rel, items });
	}

	// A document: its blocks in order, and around each block everything that answers it.
	let doc: DocBlock[] | null = null;
	if (node.kind === 'document') {
		const idx = childrenIndex(edges);
		const blocks = (idx.get(node.id) ?? []).filter((e) => e.rel === 'partOf' && nodes.has(e.from));
		const responses = (target: GraphNode): DocResponse[] =>
			(idx.get(target.id) ?? [])
				.filter((e) => e.rel !== 'partOf' && nodes.has(e.from))
				.map((e) => ({
					edgeId: e.id,
					rel: e.rel,
					anchor: e.anchor ?? null,
					stale: e.toRev !== null && e.toRev < target.currentRev,
					child: nodes.get(e.from)!
				}));
		const shaped = blocks.map((e) => {
			const block = nodes.get(e.from)!;
			const resp = responses(block);
			return { edgeId: e.id, block, responses: resp, alternatives: resp.filter((r) => r.rel === 'alternativeTo').map((r) => ({ node: r.child, responses: responses(r.child) })) };
		});
		const ids = shaped.flatMap((b) => [b.block.id, ...b.alternatives.map((a) => a.node.id)]);
		const bodies = await repo.getBodies(db, ids);
		doc = shaped.map((b) => ({
			...b,
			body: bodies[b.block.id]?.body ?? '',
			source: bodies[b.block.id]?.source ?? null,
			alternatives: b.alternatives.map((a) => ({ ...a, body: bodies[a.node.id]?.body ?? '' }))
		}));
	}

	const view = url.searchParams.get('view') === 'tree' ? 'tree' : 'node';
	return {
		node,
		parents,
		groups,
		statuses,
		stances,
		options: childOptions(node.kind),
		tree: view === 'tree' ? buildTree(node.id, nodes, edges) : null,
		view,
		isAuthor: locals.user?.id === node.createdBy,
		doc,
		blockKinds: BLOCK_KINDS.filter((k) => k !== 'synthesis')
	};
};



async function ctx(locals: App.Locals, params: { space: string; id: string }) {
	const db = await getDb();
	const space = await repo.getSpace(db, params.space);
	if (!space) error(404, { message: 'Space not found' });
	return { db, space, userId: locals.user!.id, base: `/s/${space.slug}` };
}

export const actions: Actions = {
	add: async ({ request, locals, params }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const { db, space, userId, base } = await ctx(locals, params);
		const form = await request.formData();
		const [kind, rel] = str(form, 'what').split(':');
		if (!isNodeKind(kind) || !isRel(rel)) return { error: 'badLink' };
		const r = await attempt(() =>
			repo.createNode(db, {
				spaceId: space.id,
				kind,
				title: str(form, 'title'),
				body: str(form, 'body'),
				source: str(form, 'source'),
				attributedTo: str(form, 'attributedTo'),
				userId,
				link: { rel, to: params.id }
			})
		);
		if (!r.ok) return r.failure;
		redirect(303, `${base}/n/${params.id}#n-${r.value}`);
	},

	/** Answer one passage of a node (from a document or a node page). */
	respond: async ({ request, locals, params, url }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const { db, space, userId, base } = await ctx(locals, params);
		const form = await request.formData();
		const [kind, rel] = str(form, 'what').split(':');
		if (!isNodeKind(kind) || !isRel(rel) || rel === 'partOf') return { error: 'badLink' };
		const anchor = parseQuote(str(form, 'anchor'));
		if (!anchor) return { error: 'badAnchor' };
		const target = str(form, 'target');
		const r = await attempt(() =>
			repo.createNode(db, {
				spaceId: space.id,
				kind,
				title: str(form, 'title'),
				body: str(form, 'body'),
				userId,
				link: { rel, to: target, anchor }
			})
		);
		if (!r.ok) return r.failure;
		redirect(303, `${base}/n/${params.id}${url.search}#note-${r.value}`);
	},

	addBlock: async ({ request, locals, params }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const { db, space, userId, base } = await ctx(locals, params);
		const form = await request.formData();
		const kind = str(form, 'kind');
		if (!isNodeKind(kind)) return { error: 'badLink' };
		const r = await attempt(() =>
			repo.createNode(db, {
				spaceId: space.id,
				kind,
				title: str(form, 'title'),
				body: str(form, 'body'),
				source: str(form, 'source'),
				attributedTo: str(form, 'attributedTo'),
				userId,
				link: { rel: 'partOf', to: params.id }
			})
		);
		if (!r.ok) return r.failure;
		redirect(303, `${base}/n/${params.id}#block-${r.value}`);
	},

	moveBlock: async ({ request, locals, params }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const { db, space, userId } = await ctx(locals, params);
		const form = await request.formData();
		const dir = str(form, 'dir') === 'up' ? 'up' : 'down';
		const r = await attempt(() => repo.moveBlock(db, { spaceId: space.id, docId: params.id, edgeId: str(form, 'edgeId'), dir, userId }));
		return r.ok ? { done: 'move' } : r.failure;
	},

	link: async ({ request, locals, params }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const { db, space, userId } = await ctx(locals, params);
		const form = await request.formData();
		const rel = str(form, 'rel');
		// Accept a bare id or a pasted URL ending in /n/<id>.
		const from = str(form, 'from').trim().split('/').pop()?.split(/[?#]/)[0] ?? '';
		if (!isRel(rel)) return { error: 'badLink' };
		const r = await attempt(() => repo.linkNodes(db, { spaceId: space.id, from, rel, to: params.id, userId }));
		return r.ok ? { done: 'link' } : r.failure;
	},

	insert: async ({ request, locals, params }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const { db, space, userId, base } = await ctx(locals, params);
		const form = await request.formData();
		const lowerRel = str(form, 'lowerRel');
		if (!isRel(lowerRel)) return { error: 'badLink' };
		const r = await attempt(() =>
			repo.insertBetween(db, {
				spaceId: space.id,
				edgeId: str(form, 'edgeId'),
				userId,
				title: str(form, 'title'),
				body: str(form, 'body'),
				lowerRel
			})
		);
		if (!r.ok) return r.failure;
		redirect(303, `${base}/n/${r.value}`);
	},

	synth: async ({ request, locals, params }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const { db, space, userId, base } = await ctx(locals, params);
		const form = await request.formData();
		const positionIds = form.getAll('positions').filter((v): v is string => typeof v === 'string');
		const r = await attempt(() =>
			repo.synthesize(db, {
				spaceId: space.id,
				positionIds,
				questionId: params.id,
				title: str(form, 'title'),
				body: str(form, 'body'),
				userId
			})
		);
		if (!r.ok) return r.failure;
		redirect(303, `${base}/n/${r.value}`);
	},

	stance: async ({ request, locals, params }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const { db, userId } = await ctx(locals, params);
		const form = await request.formData();
		const value = str(form, 'value');
		await repo.setStance(db, {
			userId,
			nodeId: params.id,
			value: isStanceValue(value) ? value : null,
			public: form.get('public') === 'on'
		});
		return { done: 'stance' };
	},

	inquiry: async ({ request, locals, params }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const { db, space, userId } = await ctx(locals, params);
		const form = await request.formData();
		const status = str(form, 'status');
		const absorbed = str(form, 'absorbedInto').trim().split('/').pop()?.split(/[?#]/)[0] ?? '';
		const r = await attempt(() =>
			repo.setInquiryStatus(db, {
				spaceId: space.id,
				nodeId: params.id,
				userId,
				status: isInquiryStatus(status) ? status : null,
				note: str(form, 'note'),
				absorbedInto: absorbed || null
			})
		);
		return r.ok ? { done: 'inquiry' } : r.failure;
	}
};
