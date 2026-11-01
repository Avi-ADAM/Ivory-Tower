import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { isLocale } from '$lib/i18n';
import { setLocaleCookie, str } from '$lib/server/session';

export const load = () => redirect(303, '/');

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const to = str(form, 'to');
		if (isLocale(to)) setLocaleCookie(cookies, to);
		const back = str(form, 'back');
		redirect(303, back.startsWith('/') && !back.startsWith('//') ? back : '/');
	}
};
