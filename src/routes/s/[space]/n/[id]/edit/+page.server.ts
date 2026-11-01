import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { writableSpace } from '$lib/server/access';
import { getNode, listRevisions, reviseNode } from '$lib/server/repo';
import { attempt, requireUser, str } from '$lib/server/session';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const { space } = await parent();
	const db = await getDb();
	const node = await getNode(db, space.id, params.id);
	if (!node) error(404, { message: 'Node not found' });
	return { node, revisions: await listRevisions(db, node.id), isAuthor: locals.user?.id === node.createdBy };
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const db = await getDb();
		const space = await writableSpace(locals, params.space);
		const form = await request.formData();
		const r = await attempt(() =>
			reviseNode(db, {
				spaceId: space.id,
				nodeId: params.id,
				userId: locals.user!.id,
				title: str(form, 'title'),
				body: str(form, 'body'),
				source: str(form, 'source')
			})
		);
		if (!r.ok) return r.failure;
		redirect(303, `/s/${space.slug}/n/${params.id}`);
	}
};
