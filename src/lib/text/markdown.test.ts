import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
	it('renders the supported subset', () => {
		expect(renderMarkdown('## Title\n\nA **bold** and *it* `c` [l](https://x.org)')).toBe(
			'<h3>Title</h3><p>A <strong>bold</strong> and <em>it</em> <code>c</code> <a href="https://x.org" rel="noopener nofollow ugc" target="_blank">l</a></p>'
		);
		expect(renderMarkdown('- a\n- b\n\n1. c')).toBe('<ul><li>a</li><li>b</li></ul><ol><li>c</li></ol>');
		expect(renderMarkdown('> q\n> r')).toBe('<blockquote><p>q<br>r</p></blockquote>');
	});

	it('never lets markup or scripts through', () => {
		const out = renderMarkdown('<img src=x onerror=alert(1)> **<b>x</b>** [a](javascript:alert(1)) [b](https://ok.org" onclick="x)');
		expect(out).not.toMatch(/<img|<b>|href="javascript|onclick="/);
		expect(out).not.toContain("<a ");
		expect(out).toContain('&lt;img');
	});

	it('keeps Hebrew and lone asterisks intact', () => {
		expect(renderMarkdown('2 * 3 = 6, ו**הנפש** אינה גוף')).toBe('<p>2 * 3 = 6, ו<strong>הנפש</strong> אינה גוף</p>');
	});
});
