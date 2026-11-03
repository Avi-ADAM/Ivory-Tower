import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { listSpaces } from '$lib/server/repo';
import { myRikmas } from '$lib/server/access';

/**
 * The spaces a rikma holds, as this reader may see them. 1lev1's moach calls
 * this with the member's own `jwt` to decide between "open your space" and
 * "open one". A members space reaches only the rikma's members, by the same
 * `listSpaces` rule every page here follows; a guest gets the public ones.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const ids = (await myRikmas(locals)).map((r) => r.id);
	const spaces = (await listSpaces(await getDb(), ids))
		.filter((s) => s.ownerRikmaId === params.id)
		.map((s) => ({ slug: s.slug, title: s.title, visibility: s.visibility, nodeCount: s.nodeCount ?? 0 }));
	return json({ spaces }, { headers: { 'cache-control': 'private, no-store' } });
};
