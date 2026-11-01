import { fail, type Cookies } from '@sveltejs/kit';
import { DomainError } from './repo';

/**
 * MVP identity: a display name and an unguessable user id in an httpOnly
 * cookie. No passwords. To be replaced by sign-in with a 1lev1 account (OIDC).
 */
export const USER_COOKIE = 'it_uid';
export const LOCALE_COOKIE = 'it_lang';
const YEAR = 60 * 60 * 24 * 365;

export function setUserCookie(cookies: Cookies, id: string): void {
	cookies.set(USER_COOKIE, id, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: YEAR });
}

export function setLocaleCookie(cookies: Cookies, locale: string): void {
	cookies.set(LOCALE_COOKIE, locale, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: YEAR });
}

export function str(form: FormData, key: string): string {
	const v = form.get(key);
	return typeof v === 'string' ? v : '';
}

/** Run a write; a DomainError becomes a 400 whose `error` is an i18n key under `error.`. */
export async function attempt<T>(fn: () => Promise<T>) {
	try {
		return { ok: true as const, value: await fn() };
	} catch (e) {
		if (e instanceof DomainError) return { ok: false as const, failure: fail(400, { error: e.code }) };
		throw e;
	}
}

export function requireUser(locals: App.Locals) {
	return locals.user ? null : fail(401, { error: 'signIn' });
}
