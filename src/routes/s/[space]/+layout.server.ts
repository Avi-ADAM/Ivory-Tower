import type { LayoutServerLoad } from './$types';
import { mayWrite, readableSpace } from '$lib/server/access';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	const space = await readableSpace(locals, params.space);
	return { space, canWrite: await mayWrite(locals, space) };
};
