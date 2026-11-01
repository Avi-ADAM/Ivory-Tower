import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { createUser } from '$lib/server/repo';
import { USER_COOKIE, attempt, setUserCookie, str } from '$lib/server/session';
import { LEV_AUTH_COOKIES, levConfig, levCookieScopes, levLoginHref } from '$lib/server/levAuth';

const safeBack = (v: string | null) => (v && v.startsWith('/') && !v.startsWith('//') ? v : '/');
const lev = levConfig();

export const load: PageServerLoad = ({ locals, url }) => {
	const back = safeBack(url.searchParams.get('back'));
	if (locals.user) redirect(303, back);
	// With 1lev1 sign-in on, there is no local login: 1lev1 signs you in and sends you back.
	if (lev) redirect(303, levLoginHref(lev, new URL(back, url.origin).href));
	return {};
};

export const actions: Actions = {
	signin: async ({ request, cookies, url }) => {
		if (lev) error(404, { message: 'Sign in through 1lev1' });
		const form = await request.formData();
		const r = await attempt(async () => createUser(await getDb(), str(form, 'name')));
		if (!r.ok) return r.failure;
		setUserCookie(cookies, r.value);
		redirect(303, safeBack(url.searchParams.get('back')));
	},
	logout: async ({ cookies, url }) => {
		cookies.delete(USER_COOKIE, { path: '/' });
		if (lev) {
			// One session across 1lev1's sites: signing out here signs out there too.
			for (const scope of levCookieScopes(url.hostname)) {
				for (const name of LEV_AUTH_COOKIES) cookies.delete(name, scope);
			}
		}
		redirect(303, '/');
	}
};
