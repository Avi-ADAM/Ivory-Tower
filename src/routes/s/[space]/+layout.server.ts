import type { LayoutServerLoad } from './$types';
import { readableSpace } from '$lib/server/access';

export const load: LayoutServerLoad = async ({ params, locals }) => ({
	space: await readableSpace(locals, params.space)
});
