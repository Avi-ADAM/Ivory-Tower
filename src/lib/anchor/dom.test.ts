// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { clearHighlights, highlight, rangeOffsets } from './dom';
import { locate, makeQuote } from './quote';

function block(html: string) {
	const el = document.createElement('div');
	el.innerHTML = html;
	document.body.appendChild(el);
	return el;
}

describe('dom anchoring', () => {
	it('maps a selection across formatting to text offsets and back', () => {
		const el = block('<p>Mind is <strong>not</strong> the brain.</p>');
		const strong = el.querySelector('strong')!.firstChild!;
		const r = document.createRange();
		r.setStart(el.querySelector('p')!.firstChild!, 5); // "is "
		r.setEnd(strong, 3);
		const off = rangeOffsets(el, r)!;
		expect(el.textContent!.slice(off.start, off.end)).toBe('is not');

		const q = makeQuote(el.textContent!, off.start, off.end);
		const found = locate(el.textContent!, q)!;
		const marks = highlight(el, found.start, found.end, { 'data-anchor': 'e1' });
		expect(marks).toHaveLength(2);
		expect(marks.map((m) => m.textContent).join('')).toBe('is not');
		expect(el.querySelector('strong mark')).toBeTruthy();
		expect(el.textContent).toBe('Mind is not the brain.');

		clearHighlights(el);
		expect(el.querySelectorAll('mark')).toHaveLength(0);
		expect(el.innerHTML).toBe('<p>Mind is <strong>not</strong> the brain.</p>');
	});

	it('ignores a selection that leaves the block', () => {
		const a = block('<p>one</p>');
		const b = block('<p>two</p>');
		const r = document.createRange();
		r.setStart(a.querySelector('p')!.firstChild!, 0);
		r.setEnd(b.querySelector('p')!.firstChild!, 2);
		expect(rangeOffsets(a, r)).toBeNull();
	});
});
