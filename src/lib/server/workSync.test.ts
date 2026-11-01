import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPgliteDb, migrate, type Db } from './db';
import * as repo from './repo';
import { REFRESH_AFTER_MS, refreshWorkStatus } from './workSync';

let db: Db;
let node: string;
let userId: string;
const session = { jwt: 'tok', levUserId: '42' };
const answer = (pendms: unknown[]) =>
	({ ok: true, status: 200, json: async () => ({ data: { project: { data: { id: '7', attributes: { pendms: { data: pendms }, open_missions: { data: [] } } } } } }) }) as Response;

beforeAll(async () => {
	process.env.STRAPI_URL = 'https://strapi.test';
	process.env.LEV_URL = 'https://lev.test';
	db = await createPgliteDb();
	await migrate(db);
	userId = await repo.createUser(db, 'Avi');
	const space = await repo.createSpace(db, { slug: 'ws', title: 'ws', userId });
	node = await repo.createNode(db, { spaceId: space.id, kind: 'question', title: 'Q', userId });
	await repo.addRikmaLink(db, { spaceId: space.id, nodeId: node, rikma: { id: '7', name: 'Lab' }, kind: 'mission', externalType: 'pendm', externalId: '99', title: 'Run it', userId, status: 'proposed' });
	await repo.addRikmaLink(db, { spaceId: space.id, nodeId: node, rikma: { id: '7', name: 'Lab' }, kind: 'process', externalType: 'process', externalId: '5', title: 'Ask EEG lab', userId });
}, 60_000);

afterAll(() => {
	delete process.env.STRAPI_URL;
	delete process.env.LEV_URL;
	return db.close();
});

describe('refreshWorkStatus', () => {
	it('a fresh state is not asked again, and a non-member never asks', async () => {
		const links = await repo.listRikmaLinks(db, node);
		const f = vi.fn();
		await refreshWorkStatus(db, links, { session, rikmaIds: ['7'] }, Date.now(), f as never);
		await refreshWorkStatus(db, links, { session, rikmaIds: [] }, Date.now() + REFRESH_AFTER_MS * 10, f as never);
		await refreshWorkStatus(db, links, { session: null, rikmaIds: ['7'] }, Date.now() + REFRESH_AFTER_MS * 10, f as never);
		expect(f).not.toHaveBeenCalled();
	});

	it("a member's visit after the window records what 1lev1 says now", async () => {
		const later = Date.now() + REFRESH_AFTER_MS + 1000;
		const f = vi.fn(async () => answer([{ id: 99, attributes: { archived: true, open_mission: { data: { id: 5, attributes: { archived: false, mesimabetahaliches: { data: [] } } } } } }]));
		const out = await refreshWorkStatus(db, await repo.listRikmaLinks(db, node), { session, rikmaIds: ['7'] }, later, f as never);
		expect(f).toHaveBeenCalledTimes(1);
		expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).data.arg).toEqual({ pid: '7', pmIds: ['99'], omIds: [] });
		expect(out.find((l) => l.externalId === '99')).toMatchObject({ status: 'open', openMissionId: '5' });
		expect(out.find((l) => l.kind === 'process')?.status).toBeNull();
		const stored = (await repo.listRikmaLinks(db, node)).find((l) => l.externalId === '99')!;
		expect(stored).toMatchObject({ status: 'open', openMissionId: '5' });
	});

	it('an outage keeps the last known state', async () => {
		const later = Date.now() + REFRESH_AFTER_MS * 5;
		const out = await refreshWorkStatus(db, await repo.listRikmaLinks(db, node), { session, rikmaIds: ['7'] }, later, (async () => { throw new Error('down'); }) as never);
		expect(out.find((l) => l.externalId === '99')?.status).toBe('open');
		expect((await repo.listRikmaLinks(db, node)).find((l) => l.externalId === '99')?.status).toBe('open');
	});
});
