/**
 * Sign-in through 1lev1. Served from a *.1lev1.com subdomain, the browser
 * already sends the `jwt` cookie that 1lev1 scopes to `.1lev1.com`; we ask
 * Strapi who it belongs to (`/api/users/me`) and remember the answer briefly.
 * Strapi stays the only authority on whether a token is valid.
 *
 * Off unless STRAPI_URL is set; then the dev display-name login is used.
 */

export const LEV_JWT_COOKIE = 'jwt';
/** The cookies 1lev1's /login writes; signing out here clears them everywhere. */
export const LEV_AUTH_COOKIES = ['jwt', 'id', 'un', 'when'];

export interface LevConfig {
	strapiUrl: string;
	gateKey: string;
	loginUrl: string;
	/** 1lev1 itself (its /api/send and /api/action), for the rikma bridge. */
	levUrl: string;
}

export function levConfig(env: Record<string, string | undefined> = process.env): LevConfig | null {
	const strapiUrl = env.STRAPI_URL?.replace(/\/+$/, '');
	if (!strapiUrl) return null;
	return {
		strapiUrl,
		gateKey: env.STRAPI_GATE_KEY ?? '',
		loginUrl: env.LEV_LOGIN_URL || 'https://1lev1.com/login',
		levUrl: (env.LEV_URL || 'https://1lev1.com').replace(/\/+$/, '')
	};
}

export interface LevUser {
	levId: string;
	name: string;
}

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { user: LevUser | null; until: number }>();

export async function resolveLevUser(
	cfg: LevConfig,
	jwt: string,
	fetchFn: typeof fetch = fetch,
	now = Date.now()
): Promise<LevUser | null> {
	const hit = cache.get(jwt);
	if (hit && hit.until > now) return hit.user;

	let user: LevUser | null = null;
	try {
		const headers: Record<string, string> = { authorization: `Bearer ${jwt}` };
		if (cfg.gateKey) headers['x-strapi-gate'] = cfg.gateKey;
		const res = await fetchFn(`${cfg.strapiUrl}/api/users/me`, { headers });
		if (res.ok) {
			const me = (await res.json()) as { id?: number | string; username?: string };
			if (me?.id !== undefined && me.id !== null) {
				user = { levId: String(me.id), name: (me.username || `#${me.id}`).slice(0, 80) };
			}
		} else if (res.status !== 401 && res.status !== 403) {
			return null; // a Strapi hiccup is not an answer; do not cache it
		}
	} catch {
		return null;
	}
	if (cache.size > 5000) cache.clear();
	cache.set(jwt, { user, until: now + TTL_MS });
	return user;
}

/** Where to send someone to sign in, so 1lev1 brings them back here. */
export function levLoginHref(cfg: LevConfig, returnTo: string): string {
	const u = new URL(cfg.loginUrl);
	u.searchParams.set('from', returnTo);
	return u.href;
}

/** The scopes 1lev1 may have written its cookies to, for a clean sign-out. */
export function levCookieScopes(hostname: string): { path: string; domain?: string }[] {
	const own = hostname === '1lev1.com' || hostname.endsWith('.1lev1.com');
	return [{ path: '/' }, ...(own ? [{ path: '/', domain: '.1lev1.com' }] : [])];
}
