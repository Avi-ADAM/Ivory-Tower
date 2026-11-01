import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import * as repo from '$lib/server/repo';
import { attempt, requireUser, str } from '$lib/server/session';
import { childOptions, insertBetweenPlan } from '$lib/model/rules';
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
	const groups: { rel: Rel; items: { edgeId: string; child: NonNullable<ReturnType<typeof nodes.get>>; stale: boolean; insert: ReturnType<typeof insertBetweenPlan> }[] }[] = [];
	for (const rel of RELS) {
		const items = direct
			.filter((e) => e.rel === rel && nodes.has(e.from))
			.map((e) => {
				const child = nodes.get(e.from)!;
				return {
					edgeId: e.id,
					child,
					stale: e.toRev !== null && e.toRev < node.currentRev,
					insert: insertBetweenPlan(e.rel, child.kind, node.kind)
				};
			});
		if (items.length) groups.push({ rel, items });
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
		isAuthor: locals.user?.id === node.createdBy
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
