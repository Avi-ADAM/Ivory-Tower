import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { createSpace, listSpaces, type Visibility } from '$lib/server/repo';
import { attempt, requireUser, str } from '$lib/server/session';
import { bridgeEnabled, myRikmas } from '$lib/server/access';
import { requireMembership } from '$lib/server/levBridge';
import { levConfig } from '$lib/server/levAuth';

export const load: PageServerLoad = async ({ locals }) => {
	const rikmas = await myRikmas(locals);
	return {
		spaces: await listSpaces(await getDb(), rikmas.map((r) => r.id)),
		rikmas,
		bridge: bridgeEnabled()
	};
};

export const actions: Actions = {
	createSpace: async ({ request, locals }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const form = await request.formData();
		const rikmaId = str(form, 'rikma');
		const visibility: Visibility = str(form, 'visibility') === 'members' ? 'members' : 'public';
		const r = await attempt(async () => {
			const cfg = levConfig();
			// A rikma may hold the space only if 1lev1 says the creator is its member.
			const owner = rikmaId && cfg && locals.lev ? await requireMembership(cfg, locals.lev, rikmaId) : null;
			return createSpace(await getDb(), {
				slug: str(form, 'slug'),
				title: str(form, 'title'),
				description: str(form, 'description'),
				userId: locals.user!.id,
				owner,
				visibility
			});
		});
		if (!r.ok) return r.failure;
		redirect(303, `/s/${r.value.slug}`);
	}
};
