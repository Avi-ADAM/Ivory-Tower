import { describe, expect, it } from 'vitest';
import { locate, makeQuote, parseQuote } from './quote';

const text = 'The cat sat on the mat. The cat sat on the hat.';

describe('text quote anchors', () => {
	it('round-trips a selection', () => {
		const start = text.lastIndexOf('cat');
		const q = makeQuote(text, start, start + 3);
		expect(q.exact).toBe('cat');
		expect(locate(text, q)).toEqual({ start, end: start + 3 });
	});

	it('uses context to pick the right one of repeated passages', () => {
		const second = text.indexOf('sat on the', 10);
		const q = makeQuote(text, second, second + 'sat on the'.length);
		expect(locate(text, q)!.start).toBe(second);
	});

	it('survives edits around the passage', () => {
		const q = makeQuote(text, text.indexOf('mat'), text.indexOf('mat') + 3);
		const edited = 'Intro. ' + text.replace('The cat sat', 'A small cat sat');
		const at = locate(edited, q)!;
		expect(edited.slice(at.start, at.end)).toBe('mat');
	});

	it('is orphaned when the passage itself was rewritten', () => {
		const q = makeQuote(text, 4, 7);
		expect(locate(text.replaceAll('cat', 'dog'), q)).toBeNull();
	});

	it('rejects malformed selectors', () => {
		expect(parseQuote('{"exact":"x","prefix":"","suffix":""}')).toEqual({ exact: 'x', prefix: '', suffix: '' });
		expect(parseQuote('{"exact":"  ","prefix":"","suffix":""}')).toBeNull();
		expect(parseQuote('not json')).toBeNull();
		expect(parseQuote({ exact: 'x'.repeat(2000), prefix: '', suffix: '' })).toBeNull();
		expect(parseQuote({ exact: 'x', prefix: 1, suffix: '' })).toBeNull();
	});
});
