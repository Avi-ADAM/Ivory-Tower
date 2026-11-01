import type { Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getUser, upsertLevUser } from '$lib/server/repo';
import { DEFAULT_LOCALE, RTL, isLocale } from '$lib/i18n';
import { USER_COOKIE, LOCALE_COOKIE } from '$lib/server/session';
import { LEV_JWT_COOKIE, levConfig, resolveLevUser } from '$lib/server/levAuth';

const lev = levConfig();

export const handle: Handle = async ({ event, resolve }) => {
	const db = await getDb();
	event.locals.user = null;
	event.locals.lev = null;
	if (lev) {
		// Signed in through 1lev1: the shared .1lev1.com session is the only one.
		const jwt = event.cookies.get(LEV_JWT_COOKIE);
		const member = jwt ? await resolveLevUser(lev, jwt) : null;
		if (jwt && member) {
			event.locals.user = await upsertLevUser(db, member.levId, member.name);
			event.locals.lev = { jwt, levUserId: member.levId };
		}
	} else {
		const uid = event.cookies.get(USER_COOKIE);
		event.locals.user = uid ? await getUser(db, uid) : null;
	}

	const fromCookie = event.cookies.get(LOCALE_COOKIE);
	const fromHeader = event.request.headers.get('accept-language')?.slice(0, 2);
	event.locals.locale = isLocale(fromCookie) ? fromCookie : isLocale(fromHeader) ? fromHeader : DEFAULT_LOCALE;

	const locale = event.locals.locale;
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%lang%', locale).replace('%dir%', RTL.has(locale) ? 'rtl' : 'ltr')
	});
};
