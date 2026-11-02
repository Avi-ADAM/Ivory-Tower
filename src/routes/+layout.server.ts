import type { LayoutServerLoad } from './$types';
import { isEphemeralDb } from '$lib/server/db';

export const load: LayoutServerLoad = ({ locals }) => ({
	user: locals.user,
	locale: locals.locale,
	ephemeral: isEphemeralDb()
});
