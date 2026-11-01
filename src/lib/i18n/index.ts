import { getContext, setContext } from 'svelte';
import he from './he.json';
import en from './en.json';

export const LOCALES = ['he', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'he';
export const RTL: ReadonlySet<Locale> = new Set(['he']);

const DICTS: Record<Locale, unknown> = { he, en };

export function isLocale(v: unknown): v is Locale {
	return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export type T = (key: string, params?: Record<string, string | number>) => string;

/**
 * `t('ns.key', { count })` against "… {{count}} …". A missing key renders the
 * key itself (never an empty string), so a gap is visible instead of silent.
 */
export function translator(locale: Locale): T {
	const dict = DICTS[locale];
	return (key, params) => {
		let v: unknown = dict;
		for (const part of key.split('.')) v = (v as Record<string, unknown> | undefined)?.[part];
		if (typeof v !== 'string') return key;
		return params ? v.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in params ? String(params[k]) : m)) : v;
	};
}

const KEY = Symbol('i18n');

export function setI18n(get: () => Locale): void {
	setContext(KEY, { get locale() { return get(); }, t: ((k, p) => translator(get())(k, p)) as T });
}

export function useI18n(): { locale: Locale; t: T } {
	return getContext(KEY);
}
