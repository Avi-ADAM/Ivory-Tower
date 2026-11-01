import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { readableSpace } from '$lib/server/access';
import { createNode, listDocuments, recentNodes, rootQuestions } from '$lib/server/repo';
import { attempt, requireUser, str } from '$lib/server/session';

export const load: PageServerLoad = async ({ parent }) => {
	const { space } = await parent();
	const db = await getDb();
	return {
		roots: await rootQuestions(db, space.id),
		documents: await listDocuments(db, space.id),
		recent: await recentNodes(db, space.id)
	};
};

export const actions: Actions = {
	addDocument: async ({ request, locals, params }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const db = await getDb();
		const space = await readableSpace(locals, params.space);
		const form = await request.formData();
		const r = await attempt(() =>
			createNode(db, { spaceId: space.id, kind: 'document', title: str(form, 'title'), body: str(form, 'body'), userId: locals.user!.id })
		);
		if (!r.ok) return r.failure;
		redirect(303, `/s/${space.slug}/n/${r.value}`);
	},

	addQuestion: async ({ request, locals, params }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const db = await getDb();
		const space = await readableSpace(locals, params.space);
		const form = await request.formData();
		const r = await attempt(() =>
			createNode(db, {
				spaceId: space.id,
				kind: 'question',
				title: str(form, 'title'),
				body: str(form, 'body'),
				attributedTo: str(form, 'attributedTo'),
				userId: locals.user!.id
			})
		);
		if (!r.ok) return r.failure;
		redirect(303, `/s/${space.slug}/n/${r.value}`);
	}
};
