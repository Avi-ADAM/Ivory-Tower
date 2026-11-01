import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRikmaCache, describeForRikma, fetchWorkStatus, listMyRikmas, openMission, requireMembership, startProcess, workUrl } from './levBridge';

const cfg = { strapiUrl: 'https://api.x', gateKey: '', loginUrl: 'https://lev/login', levUrl: 'https://lev' };
const s = { jwt: 'tok', levUserId: '42' };
const res = (status: number, body?: unknown) => ({ ok: status < 300, status, json: async () => body }) as Response;
const projects = (rows: { id: number; name: string }[]) =>
	res(200, { data: { usersPermissionsUser: { data: { attributes: { projects_1s: { data: rows.map((r) => ({ id: r.id, attributes: { projectName: r.name } })) } } } } } });

beforeEach(() => clearRikmaCache());

describe('levBridge', () => {
	it("asks 1lev1 for the member's own rikmas, as the member, and caches the answer", async () => {
		const f = vi.fn(async () => projects([{ id: 7, name: 'מעבדה' }]));
		expect(await listMyRikmas(cfg, s, f as never, 0)).toEqual([{ id: '7', name: 'מעבדה' }]);
		await listMyRikmas(cfg, s, f as never, 1000);
		expect(f).toHaveBeenCalledTimes(1);
		const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://lev/api/send');
		expect((init.headers as Record<string, string>).cookie).toBe('jwt=tok');
		expect(JSON.parse(String(init.body))).toEqual({ data: { queId: '64getUserProjectList', arg: { uid: '42' } } });
	});

	it('membership is whatever 1lev1 lists', async () => {
		const f = async () => projects([{ id: 7, name: 'a' }]);
		expect(await requireMembership(cfg, s, '7', f as never)).toEqual({ id: '7', name: 'a' });
		await expect(requireMembership(cfg, s, '8', f as never)).rejects.toMatchObject({ code: 'notRikmaMember' });
	});

	it('opens a mission through createMission and reports what 1lev1 made', async () => {
		const f = vi.fn(async () => res(200, { success: true, data: { missionId: 3, createdEntityId: 99, createdEntityType: 'pendm' } }));
		expect(await openMission(cfg, s, { rikmaId: '7', name: 'Run the experiment', descripHtml: '<p>x</p>' }, f as never)).toEqual({
			externalId: '99',
			externalType: 'pendm',
			missionId: '3'
		});
		const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://lev/api/action');
		expect(JSON.parse(String(init.body))).toEqual({
			actionKey: 'createMission',
			params: { projectId: '7', missionName: 'Run the experiment', descrip: '<p>x</p>' }
		});
	});

	it('starts a process through createProcess', async () => {
		const f = async () => res(200, { success: true, data: { processId: 5 } });
		expect(await startProcess(cfg, s, { rikmaId: '7', name: 'n', description: 'd' }, f as never)).toEqual({ externalId: '5', externalType: 'process' });
	});

	it('maps 1lev1 refusals and outages to errors the reader can act on', async () => {
		const p = { rikmaId: '7', name: 'n', descripHtml: '' };
		await expect(openMission(cfg, s, p, (async () => res(403)) as never)).rejects.toMatchObject({ code: 'levForbidden' });
		await expect(openMission(cfg, s, p, (async () => res(502)) as never)).rejects.toMatchObject({ code: 'levUnavailable' });
		await expect(openMission(cfg, s, p, (async () => { throw new Error('net'); }) as never)).rejects.toMatchObject({ code: 'levUnavailable' });
		await expect(openMission(cfg, s, p, (async () => res(200, { success: false })) as never)).rejects.toMatchObject({ code: 'levRefused' });
	});

	it('the description escapes member text and links home', () => {
		const d = describeForRikma({ title: '<b>X</b>', body: 'a\nb', url: 'https://t/s/x/n/1', linkLabel: 'back' });
		expect(d.html).toBe('<p>&lt;b&gt;X&lt;/b&gt;</p><p>a<br>b</p><p><a href="https://t/s/x/n/1">back</a></p>');
		expect(d.text).toContain('back: https://t/s/x/n/1');
	});

	it('asks ivoryWorkStatus for one rikma and reads states, following a matured pendm', async () => {
		const f = vi.fn(async () =>
			res(200, { data: { project: { data: { id: '7', attributes: {
				pendms: { data: [
					{ id: 99, attributes: { archived: false, open_mission: { data: null } } },
					{ id: 98, attributes: { archived: true, open_mission: { data: { id: 5, attributes: { archived: false, lifecycle: null, mesimabetahaliches: { data: [] } } } } } },
					{ id: 97, attributes: { archived: true, open_mission: { data: null } } }
				] },
				open_missions: { data: [{ id: 6, attributes: { archived: false, lifecycle: null, mesimabetahaliches: { data: [{ id: 1 }] } } }] }
			} } } } })
		);
		const m = await fetchWorkStatus(cfg, s, { rikmaId: '7', pendmIds: ['99', '98', '97'], openMissionIds: ['6'] }, f as never);
		expect(Object.fromEntries(m)).toEqual({
			'pendm:99': { state: 'proposed', openMissionId: null },
			'pendm:98': { state: 'open', openMissionId: '5' },
			'pendm:97': { state: 'notApproved', openMissionId: null },
			'openMission:6': { state: 'taken', openMissionId: '6' }
		});
		const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://lev/api/send');
		expect((init.headers as Record<string, string>).cookie).toBe('jwt=tok');
		expect(JSON.parse(String(init.body))).toEqual({ data: { queId: 'ivoryWorkStatus', arg: { pid: '7', pmIds: ['99', '98', '97'], omIds: ['6'] } } });
	});

	it('asks nothing when there is nothing to ask, and fails loudly on an empty answer', async () => {
		const f = vi.fn();
		expect((await fetchWorkStatus(cfg, s, { rikmaId: '7', pendmIds: [], openMissionIds: [] }, f as never)).size).toBe(0);
		expect(f).not.toHaveBeenCalled();
		await expect(fetchWorkStatus(cfg, s, { rikmaId: '7', pendmIds: ['1'], openMissionIds: [] }, (async () => res(200, { data: { project: { data: null } } })) as never)).rejects.toMatchObject({ code: 'levUnavailable' });
		await expect(fetchWorkStatus(cfg, s, { rikmaId: '7', pendmIds: ['1'], openMissionIds: [] }, (async () => res(403)) as never)).rejects.toMatchObject({ code: 'levForbidden' });
	});

	it('links a waiting proposal to its vote page, anything else to the rikma', () => {
		const l = { rikmaId: '7', externalType: 'pendm', externalId: '99' };
		expect(workUrl(cfg, { ...l, status: 'proposed' })).toBe('https://lev/moach/7/votes/pendm/99');
		expect(workUrl(cfg, { ...l, status: 'open' })).toBe('https://lev/moach/7');
		expect(workUrl(cfg, { rikmaId: '7', externalType: 'process', externalId: '5', status: null })).toBe('https://lev/moach/7');
	});
});
