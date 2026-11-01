/**
 * Text Quote Selector (in the spirit of W3C Web Annotation): a passage is
 * remembered by its exact text plus a little context on each side, never by
 * character offsets — offsets break on the first edit, a quote survives any
 * edit that leaves the passage itself alone.
 *
 * `text` is always the block's plain-text projection (its DOM textContent),
 * the same string on the side that makes the selector and the side that
 * finds it again.
 */
export interface TextQuote {
	exact: string;
	prefix: string;
	suffix: string;
}

export const CONTEXT = 32;
export const MAX_EXACT = 1000;

export function makeQuote(text: string, start: number, end: number, context = CONTEXT): TextQuote {
	const s = Math.max(0, Math.min(start, end));
	const e = Math.min(text.length, Math.max(start, end));
	return {
		exact: text.slice(s, e),
		prefix: text.slice(Math.max(0, s - context), s),
		suffix: text.slice(e, e + context)
	};
}

/** Length of the common suffix of a and b. */
function commonTail(a: string, b: string): number {
	let n = 0;
	while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
	return n;
}
/** Length of the common prefix of a and b. */
function commonHead(a: string, b: string): number {
	let n = 0;
	while (n < a.length && n < b.length && a[n] === b[n]) n++;
	return n;
}

/**
 * Find the passage again. Among every occurrence of `exact`, the one whose
 * surroundings agree best with the remembered prefix/suffix wins; ties go to
 * the first. Returns null when the exact text is gone (the anchor is orphaned).
 */
export function locate(text: string, q: TextQuote): { start: number; end: number } | null {
	if (!q.exact) return null;
	let best: { start: number; end: number; score: number } | null = null;
	for (let i = text.indexOf(q.exact); i !== -1; i = text.indexOf(q.exact, i + 1)) {
		const before = text.slice(Math.max(0, i - q.prefix.length), i);
		const after = text.slice(i + q.exact.length, i + q.exact.length + q.suffix.length);
		const score = commonTail(before, q.prefix) + commonHead(after, q.suffix);
		if (!best || score > best.score) best = { start: i, end: i + q.exact.length, score };
	}
	return best && { start: best.start, end: best.end };
}

/** Validate an untrusted selector from a form. */
export function parseQuote(raw: unknown): TextQuote | null {
	let v: unknown = raw;
	if (typeof raw === 'string') {
		try {
			v = JSON.parse(raw);
		} catch {
			return null;
		}
	}
	if (!v || typeof v !== 'object') return null;
	const { exact, prefix, suffix } = v as Record<string, unknown>;
	if (typeof exact !== 'string' || typeof prefix !== 'string' || typeof suffix !== 'string') return null;
	if (!exact.trim() || exact.length > MAX_EXACT || prefix.length > CONTEXT * 2 || suffix.length > CONTEXT * 2) return null;
	return { exact, prefix, suffix };
}
