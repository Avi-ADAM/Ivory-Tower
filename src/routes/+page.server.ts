import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { createSpace, listSpaces } from '$lib/server/repo';
import { attempt, requireUser, str } from '$lib/server/session';

export const load: PageServerLoad = async () => ({ spaces: await listSpaces(await getDb()) });

export const actions: Actions = {
	createSpace: async ({ request, locals }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const form = await request.formData();
		const r = await attempt(async () =>
			createSpace(await getDb(), {
				slug: str(form, 'slug'),
				title: str(form, 'title'),
				description: str(form, 'description'),
				userId: locals.user!.id
			})
		);
		if (!r.ok) return r.failure;
		redirect(303, `/s/${r.value.slug}`);
	}
};
