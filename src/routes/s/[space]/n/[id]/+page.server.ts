import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { bridgeEnabled, myRikmas, readableSpace, writableSpace } from '$lib/server/access';
import { levConfig } from '$lib/server/levAuth';
import { describeForRikma, openMission, requireMembership, startProcess, workUrl } from '$lib/server/levBridge';
import { refreshWorkStatus } from '$lib/server/workSync';
import { translator } from '$lib/i18n';
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
	const { space, canWrite } = await parent();
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
	// The rikma bridge: what this node already led to, and where it could lead.
	const cfg = levConfig();
	// A member of the rikma asks 1lev1 where the work stands (as themselves); everyone
	// else sees the last answer and when it was given.
	const readerRikmas = await myRikmas(locals);
	const links = (
		await refreshWorkStatus(db, await repo.listRikmaLinks(db, node.id), {
			session: locals.lev,
			rikmaIds: readerRikmas.map((r) => r.id)
		})
	).map((l) => ({ ...l, url: cfg ? workUrl(cfg, l) : null }));
	const bridge = {
		enabled: bridgeEnabled() && !!locals.lev && canWrite && node.kind !== 'document',
		rikmas: node.kind !== 'document' ? readerRikmas : [],
		defaultRikma: space.ownerRikmaId
	};

	return {
		links,
		bridge,
		node,
		parents,
		groups,
		statuses,
		stances,
		options: childOptions(node.kind),
		tree: view === 'tree' ? buildTree(node.id, nodes, edges) : null,
		view,
		// An author who left the rikma of a members-write space reads like everyone else.
		isAuthor: canWrite && locals.user?.id === node.createdBy,
		doc,
		blockKinds: BLOCK_KINDS.filter((k) => k !== 'synthesis')
	};
};



/** Every action's space, checked for contributing — except a stance, which any reader may hold. */
async function ctx(locals: App.Locals, params: { space: string; id: string }, opts: { write: boolean } = { write: true }) {
	const db = await getDb();
	const space = opts.write ? await writableSpace(locals, params.space) : await readableSpace(locals, params.space);
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

	/**
	 * Carry a node into a rikma as an open mission or a process. 1lev1 does the
	 * work, as the member; this side only records the link once 1lev1 said yes.
	 */
	toRikma: async ({ request, locals, params, url }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const cfg = levConfig();
		if (!cfg || !locals.lev) return { error: 'levSignIn' };
		const { db, space, userId, base } = await ctx(locals, params);
		const node = await repo.getNode(db, space.id, params.id);
		if (!node || node.kind === 'document') error(404, { message: 'Node not found' });
		const form = await request.formData();
		const kind = str(form, 'kind') === 'process' ? 'process' : 'mission';
		const name = (str(form, 'name').trim() || node.title).slice(0, 200);
		const t = translator(locals.locale);
		const r = await attempt(async () => {
			const rikma = await requireMembership(cfg, locals.lev!, str(form, 'rikma'));
			const d = describeForRikma({
				title: node.title,
				body: node.body,
				note: str(form, 'note'),
				url: `${url.origin}${base}/n/${node.id}`,
				linkLabel: t('bridge.backLink')
			});
			const made =
				kind === 'mission'
					? await openMission(cfg, locals.lev!, { rikmaId: rikma.id, name, descripHtml: d.html })
					: await startProcess(cfg, locals.lev!, { rikmaId: rikma.id, name, description: d.text });
			return repo.addRikmaLink(db, {
				spaceId: space.id,
				nodeId: node.id,
				rikma,
				kind,
				externalType: made.externalType,
				externalId: made.externalId,
				missionId: 'missionId' in made ? (made.missionId as string | null) : null,
				title: name,
				userId,
				// What 1lev1 just made: a proposal waits for consent; a solo rikma's open mission is open.
				status:
					made.externalType === 'pendm' ? 'proposed'
					: made.externalType === 'openMission' ? 'open'
					: made.externalType === 'mesimabetahalich' ? 'taken'
					: null
			});
		});
		return r.ok ? { done: 'rikma' } : r.failure;
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
		const { db, userId } = await ctx(locals, params, { write: false });
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
