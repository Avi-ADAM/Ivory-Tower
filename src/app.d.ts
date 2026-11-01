import type { Locale } from '$lib/i18n';

declare global {
	namespace App {
		interface Locals {
			user: { id: string; name: string } | null;
			locale: Locale;
		}
		interface Error {
			message: string;
		}
	}
}

export {};
