import type { Locale } from '$lib/i18n';

declare global {
	namespace App {
		interface Locals {
			user: { id: string; name: string } | null;
			locale: Locale;
			/** The member's 1lev1 session, when signed in through 1lev1 (the rikma bridge acts with it). */
			lev: import('$lib/server/levBridge').LevSession | null;
			/** Memoised per request by `myRikmas()`. */
			rikmas?: Promise<import('$lib/server/levBridge').Rikma[]>;
		}
		interface Error {
			message: string;
		}
	}
}

export {};
