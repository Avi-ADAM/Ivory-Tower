import { error } from '@sveltejs/kit';
import { getDb } from './db';
import { canRead, getSpace, type Space } from './repo';
import { levConfig } from './levAuth';
import { listMyRikmas, type Rikma } from './levBridge';

const lev = levConfig();

/** Whether the rikma bridge is on (1lev1 sign-in configured). */
export const bridgeEnabled = (): boolean => lev !== null;

/**
 * The reader's rikmas, from 1lev1, asked with their own token. Empty when the
 * bridge is off, the reader is a guest, or 1lev1 cannot be reached — so a
 * members space then reads as absent rather than as open.
 */
export async function myRikmas(locals: App.Locals): Promise<Rikma[]> {
	if (!lev || !locals.lev) return [];
	locals.rikmas ??= listMyRikmas(lev, locals.lev).catch(() => []);
	return locals.rikmas;
}

/**
 * The space, if this reader may see it. Every page and every write in a space
 * goes through here; a members space the reader may not see is a plain 404, so
 * its existence does not leak either.
 */
export async function readableSpace(locals: App.Locals, slug: string): Promise<Space> {
	const space = await getSpace(await getDb(), slug);
	if (!space) error(404, { message: 'Space not found' });
	if (space.visibility !== 'public') {
		const ids = (await myRikmas(locals)).map((r) => r.id);
		if (!canRead(space, ids)) error(404, { message: 'Space not found' });
	}
	return space;
}
