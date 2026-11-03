import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { createSpace, listSpaces, type Visibility, type WritePolicy } from '$lib/server/repo';
import { attempt, requireUser, str } from '$lib/server/session';
import { bridgeEnabled, myRikmas } from '$lib/server/access';
import { requireMembership } from '$lib/server/levBridge';
import { levConfig } from '$lib/server/levAuth';

export const load: PageServerLoad = async ({ locals, url }) => {
	const rikmas = await myRikmas(locals);
	// 1lev1's moach links here with ?rikma=<id> to open a space for that rikma;
	// it is preselected only when the reader is actually its member.
	const asked = url.searchParams.get('rikma');
	return {
		spaces: await listSpaces(await getDb(), rikmas.map((r) => r.id)),
		rikmas,
		bridge: bridgeEnabled(),
		preselect: rikmas.some((r) => r.id === asked) ? asked : ''
	};
};

export const actions: Actions = {
	createSpace: async ({ request, locals }) => {
		const denied = requireUser(locals);
		if (denied) return denied;
		const form = await request.formData();
		const rikmaId = str(form, 'rikma');
		const visibility: Visibility = str(form, 'visibility') === 'members' ? 'members' : 'public';
		const writePolicy: WritePolicy = str(form, 'writePolicy') === 'members' ? 'members' : 'anyone';
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
				visibility,
				writePolicy
			});
		});
		if (!r.ok) return r.failure;
		redirect(303, `/s/${r.value.slug}`);
	}
};
