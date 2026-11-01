import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getSpace } from '$lib/server/repo';

export const load: LayoutServerLoad = async ({ params }) => {
	const space = await getSpace(await getDb(), params.space);
	if (!space) error(404, { message: 'Space not found' });
	return { space };
};
