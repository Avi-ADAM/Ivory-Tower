/**
 * A deliberately small, safe Markdown subset for node bodies:
 *   paragraphs · `## heading` / `### heading` · `- list` / `1. list` · `> quote`
 *   **bold** · *italic* · `code` · [text](https://…)
 * Every character of user text is escaped; the only tags that can appear are
 * the ones emitted here, and links are limited to http(s)/mailto.
 */

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

function safeHref(url: string): string | null {
	const u = url.trim();
	return /^(https?:\/\/|mailto:)/i.test(u) ? u : null;
}

/** Inline formatting on raw (unescaped) text. */
export function renderInline(src: string): string {
	let out = '';
	let i = 0;
	while (i < src.length) {
		const rest = src.slice(i);
		let m: RegExpMatchArray | null;
		if ((m = rest.match(/^`([^`]+)`/))) {
			out += `<code>${escapeHtml(m[1])}</code>`;
		} else if ((m = rest.match(/^\*\*(?=\S)([\s\S]*?\S)\*\*/))) {
			out += `<strong>${renderInline(m[1])}</strong>`;
		} else if ((m = rest.match(/^\*(?=[^\s*])([\s\S]*?[^\s*])\*/))) {
			out += `<em>${renderInline(m[1])}</em>`;
		} else if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/))) {
			const href = safeHref(m[2]);
			out += href
				? `<a href="${escapeHtml(href)}" rel="noopener nofollow ugc" target="_blank">${renderInline(m[1])}</a>`
				: escapeHtml(m[0]);
		} else {
			out += escapeHtml(src[i]);
			i += 1;
			continue;
		}
		i += m[0].length;
	}
	return out;
}

export function renderMarkdown(src: string): string {
	const lines = src.replace(/\r\n?/g, '\n').split('\n');
	const html: string[] = [];
	let para: string[] = [];
	let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
	let quote: string[] = [];

	const flushPara = () => {
		if (para.length) html.push(`<p>${para.map(renderInline).join('<br>')}</p>`);
		para = [];
	};
	const flushList = () => {
		if (list) html.push(`<${list.tag}>${list.items.map((x) => `<li>${renderInline(x)}</li>`).join('')}</${list.tag}>`);
		list = null;
	};
	const flushQuote = () => {
		if (quote.length) html.push(`<blockquote>${renderMarkdown(quote.join('\n'))}</blockquote>`);
		quote = [];
	};
	const flushAll = () => {
		flushPara();
		flushList();
		flushQuote();
	};

	for (const line of lines) {
		let m: RegExpMatchArray | null;
		if (!line.trim()) {
			flushAll();
		} else if ((m = line.match(/^>\s?(.*)$/))) {
			flushPara();
			flushList();
			quote.push(m[1]);
		} else if ((m = line.match(/^(#{2,3})\s+(.+)$/))) {
			flushAll();
			const level = m[1].length === 2 ? 3 : 4; // the node title is the page's h1/h2
			html.push(`<h${level}>${renderInline(m[2])}</h${level}>`);
		} else if ((m = line.match(/^\s*(?:[-*]|(\d+)\.)\s+(.+)$/))) {
			flushPara();
			flushQuote();
			const tag = m[1] ? 'ol' : 'ul';
			if (!list || list.tag !== tag) {
				flushList();
				list = { tag, items: [] };
			}
			list.items.push(m[2]);
		} else {
			flushList();
			flushQuote();
			para.push(line.trim());
		}
	}
	flushAll();
	return html.join('');
}
