import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgliteDb, migrate, type Db } from './db';
import * as repo from './repo';
import { computeStatuses } from '$lib/model/status';
import { buildTree } from '$lib/model/tree';

let db: Db;
let alice: string;
let bob: string;
let spaceId: string;

beforeAll(async () => {
	db = await createPgliteDb();
	await migrate(db);
	await migrate(db); // idempotent
	alice = await repo.createUser(db, 'Alice');
	bob = await repo.createUser(db, 'Bob');
	spaceId = (await repo.createSpace(db, { slug: 'dark-matter', title: 'Dark matter', userId: alice })).id;
}, 60_000);

afterAll(() => db.close());

describe('repo', () => {
	it('refuses a duplicate or malformed slug', async () => {
		await expect(repo.createSpace(db, { slug: 'dark-matter', title: 'x', userId: bob })).rejects.toMatchObject({ code: 'slugTaken' });
		await expect(repo.createSpace(db, { slug: 'Bad Slug', title: 'x', userId: bob })).rejects.toMatchObject({ code: 'badSlug' });
	});

	it('builds X vs Y with branches, arguments and a counter', async () => {
		const q = await repo.createNode(db, { spaceId, kind: 'question', title: 'What explains rotation curves?', userId: alice });
		const x = await repo.createNode(db, { spaceId, kind: 'position', title: 'Particle dark matter', userId: alice, link: { rel: 'answers', to: q } });
		const y = await repo.createNode(db, { spaceId, kind: 'position', title: 'Modified gravity', userId: bob, link: { rel: 'answers', to: q } });
		const xx = await repo.createNode(db, { spaceId, kind: 'position', title: 'WIMPs', userId: alice, link: { rel: 'refines', to: x } });
		const against = await repo.createNode(db, { spaceId, kind: 'evidence', title: 'No WIMP signal in direct detection', userId: bob, link: { rel: 'opposes', to: xx } });
		await repo.createNode(db, { spaceId, kind: 'argument', title: 'Cross-section may be below sensitivity', userId: alice, link: { rel: 'opposes', to: against } });

		await expect(
			repo.createNode(db, { spaceId, kind: 'argument', title: 'nope', userId: bob, link: { rel: 'supports', to: q } })
		).rejects.toMatchObject({ code: 'badLink' });
		await expect(repo.createNode(db, { spaceId, kind: 'position', title: 'orphan', userId: bob })).rejects.toMatchObject({ code: 'needsParent' });

		const roots = await repo.rootQuestions(db, spaceId);
		expect(roots.map((r) => r.id)).toEqual([q]);

		const { nodes, edges } = await repo.loadSubgraph(db, q);
		expect(nodes.size).toBe(6);
		const tree = buildTree(q, nodes, edges)!;
		expect(tree.children.map((c) => c.node.title)).toEqual(['Particle dark matter', 'Modified gravity']);
		expect(computeStatuses([xx], edges).get(xx)!.status).toBe('answered');
		expect(y).toBeTruthy();
	});

	it('revisions belong to the author and mark responses stale', async () => {
		const q = await repo.createNode(db, { spaceId, kind: 'question', title: 'Q2', userId: alice });
		const x = await repo.createNode(db, { spaceId, kind: 'position', title: 'v1', userId: alice, link: { rel: 'answers', to: q } });
		const a = await repo.createNode(db, { spaceId, kind: 'argument', title: 'against v1', userId: bob, link: { rel: 'opposes', to: x } });

		await expect(repo.reviseNode(db, { spaceId, nodeId: x, userId: bob, title: 'hijack' })).rejects.toMatchObject({ code: 'authorOnly' });
		expect(await repo.reviseNode(db, { spaceId, nodeId: x, userId: alice, title: 'v2' })).toBe(2);

		const revs = await repo.listRevisions(db, x);
		expect(revs.map((r) => r.title)).toEqual(['v2', 'v1']);
		const [parent] = await repo.parentsOf(db, a);
		expect(parent).toMatchObject({ toId: x, stale: true, rel: 'opposes' });
	});

	it('inserts a step into an edge without losing the old one', async () => {
		const q = await repo.createNode(db, { spaceId, kind: 'question', title: 'Q3', userId: alice });
		const c = await repo.createNode(db, { spaceId, kind: 'position', title: 'C', userId: alice, link: { rel: 'answers', to: q } });
		const a = await repo.createNode(db, { spaceId, kind: 'evidence', title: 'A', userId: bob, link: { rel: 'opposes', to: c } });
		const [edge] = await repo.parentsOf(db, a);

		const b = await repo.insertBetween(db, { spaceId, edgeId: edge.edgeId, userId: bob, title: 'B', lowerRel: 'supports' });
		const { edges } = await repo.loadSubgraph(db, c);
		const pairs = edges.map((e) => `${e.from === a ? 'A' : e.from === b ? 'B' : '?'}-${e.rel}-${e.to === c ? 'C' : e.to === b ? 'B' : '?'}`);
		expect(pairs.sort()).toEqual(['A-supports-B', 'B-opposes-C']);

		const [old] = await db.query<{ superseded_by: string | null }>('select superseded_by from edge where id = $1', [edge.edgeId]);
		expect(old.superseded_by).toBeTruthy();
		await expect(
			repo.insertBetween(db, { spaceId, edgeId: edge.edgeId, userId: bob, title: 'again', lowerRel: 'supports' })
		).rejects.toMatchObject({ code: 'notFound' });
	});

	it('reuses one argument for two claims, and synthesizes without deleting', async () => {
		const q = await repo.createNode(db, { spaceId, kind: 'question', title: 'Q4', userId: alice });
		const x = await repo.createNode(db, { spaceId, kind: 'position', title: 'X', userId: alice, link: { rel: 'answers', to: q } });
		const y = await repo.createNode(db, { spaceId, kind: 'position', title: 'Y', userId: bob, link: { rel: 'answers', to: q } });
		const a = await repo.createNode(db, { spaceId, kind: 'argument', title: 'shared', userId: bob, link: { rel: 'supports', to: x } });
		await repo.linkNodes(db, { spaceId, from: a, rel: 'supports', to: y, userId: bob });
		await expect(repo.linkNodes(db, { spaceId, from: a, rel: 'supports', to: y, userId: bob })).rejects.toMatchObject({ code: 'alreadyLinked' });

		const s = await repo.synthesize(db, { spaceId, positionIds: [x, y], questionId: q, title: 'X and Y are two limits of S', userId: alice });
		const parents = await repo.parentsOf(db, s);
		expect(parents.map((p) => `${p.rel}:${p.toTitle}`).sort()).toEqual(['answers:Q4', 'synthesizes:X', 'synthesizes:Y']);

		await repo.setInquiryStatus(db, { spaceId, nodeId: x, userId: alice, status: 'concluded', note: 'absorbed', absorbedInto: s });
		const { nodes } = await repo.loadSubgraph(db, q);
		expect(nodes.size).toBe(5);
		expect(nodes.get(x)).toMatchObject({ inquiryStatus: 'concluded', absorbedInto: s });
		await expect(repo.setInquiryStatus(db, { spaceId, nodeId: y, userId: alice, status: 'deadEnd', note: 'x' })).rejects.toMatchObject({ code: 'authorOnly' });
		await expect(repo.setInquiryStatus(db, { spaceId, nodeId: y, userId: bob, status: 'deadEnd' })).rejects.toMatchObject({ code: 'noteRequired' });
	});

	it('stances are private unless published', async () => {
		const q = await repo.createNode(db, { spaceId, kind: 'question', title: 'Q5', userId: alice });
		await repo.setStance(db, { userId: alice, nodeId: q, value: 'agree', public: false });
		await repo.setStance(db, { userId: bob, nodeId: q, value: 'unsure', public: true });
		const s = await repo.getStances(db, q, alice);
		expect(s.mine).toEqual({ value: 'agree', public: false });
		expect(s.published).toEqual([{ name: 'Bob', value: 'unsure' }]);
		await repo.setStance(db, { userId: alice, nodeId: q, value: null, public: false });
		expect((await repo.getStances(db, q, alice)).mine).toBeNull();
	});
});
