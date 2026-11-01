import { describe, expect, it, vi } from 'vitest';
import { levConfig, levLoginHref, resolveLevUser } from './levAuth';

const cfg = { strapiUrl: 'https://api.example', gateKey: 'g', loginUrl: 'https://1lev1.com/login' };
const res = (status: number, body?: unknown) =>
	({ ok: status < 300, status, json: async () => body }) as Response;

describe('levAuth', () => {
	it('is off without STRAPI_URL', () => {
		expect(levConfig({})).toBeNull();
		expect(levConfig({ STRAPI_URL: 'https://x/' })?.strapiUrl).toBe('https://x');
	});

	it('asks Strapi who the token is, with the gate header, and caches it', async () => {
		const f = vi.fn(async () => res(200, { id: 7, username: 'avi' }));
		expect(await resolveLevUser(cfg, 't1', f as never, 0)).toEqual({ levId: '7', name: 'avi' });
		expect(await resolveLevUser(cfg, 't1', f as never, 1000)).toEqual({ levId: '7', name: 'avi' });
		expect(f).toHaveBeenCalledTimes(1);
		const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
		expect(url).toBe('https://api.example/api/users/me');
		expect(init.headers).toMatchObject({ authorization: 'Bearer t1', 'x-strapi-gate': 'g' });
	});

	it('a rejected token is nobody; an outage is not cached', async () => {
		expect(await resolveLevUser(cfg, 't2', (async () => res(401)) as never, 0)).toBeNull();
		const down = vi.fn(async () => res(502));
		expect(await resolveLevUser(cfg, 't3', down as never, 0)).toBeNull();
		expect(await resolveLevUser(cfg, 't3', down as never, 1)).toBeNull();
		expect(down).toHaveBeenCalledTimes(2);
	});

	it('sends the reader to 1lev1 with a way back', () => {
		expect(levLoginHref(cfg, 'https://tower.1lev1.com/s/x')).toBe(
			'https://1lev1.com/login?from=https%3A%2F%2Ftower.1lev1.com%2Fs%2Fx'
		);
	});
});
