/**
 * The DOM side of anchoring. A block's plain text is the concatenation of its
 * text nodes in document order — exactly `root.textContent` — so offsets made
 * here and offsets found by `locate()` refer to the same string.
 */

function textNodes(root: Node): Text[] {
	const out: Text[] = [];
	const walker = root.ownerDocument!.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
	return out;
}

/** Character offset of a (container, offset) DOM boundary within root's text. */
export function boundaryOffset(root: Node, container: Node, offset: number): number | null {
	if (!root.contains(container)) return null;
	let total = 0;
	if (container.nodeType === 3) {
		for (const t of textNodes(root)) {
			if (t === container) return total + offset;
			total += t.data.length;
		}
		return null;
	}
	// An element boundary: count the text of every child before `offset`.
	const before = root.ownerDocument!.createRange();
	before.setStart(root, 0);
	before.setEnd(container, offset);
	return before.toString().length;
}

/** The selection as [start, end) offsets into root's text, or null if it leaves root. */
export function rangeOffsets(root: Node, range: Range): { start: number; end: number } | null {
	const start = boundaryOffset(root, range.startContainer, range.startOffset);
	const end = boundaryOffset(root, range.endContainer, range.endOffset);
	if (start === null || end === null || start === end) return null;
	return { start: Math.min(start, end), end: Math.max(start, end) };
}

/**
 * Wrap [start, end) in <mark> elements — one per text node the passage
 * crosses, so a highlight may span bold/italic/link boundaries.
 */
export function highlight(root: Node, start: number, end: number, attrs: Record<string, string> = {}): HTMLElement[] {
	const doc = root.ownerDocument!;
	const marks: HTMLElement[] = [];
	let pos = 0;
	for (const t of textNodes(root)) {
		const len = t.data.length;
		const from = Math.max(start, pos);
		const to = Math.min(end, pos + len);
		if (from < to) {
			let node = t;
			if (to - pos < len) node.splitText(to - pos);
			if (from - pos > 0) node = node.splitText(from - pos);
			const mark = doc.createElement('mark');
			for (const [k, v] of Object.entries(attrs)) mark.setAttribute(k, v);
			node.parentNode!.insertBefore(mark, node);
			mark.appendChild(node);
			marks.push(mark);
		}
		pos += len;
		if (pos >= end) break;
	}
	return marks;
}

/** Undo every highlight made by `highlight()` under root. */
export function clearHighlights(root: Element, selector = 'mark[data-anchor]'): void {
	for (const m of [...root.querySelectorAll(selector)]) {
		const parent = m.parentNode!;
		while (m.firstChild) parent.insertBefore(m.firstChild, m);
		parent.removeChild(m);
		parent.normalize();
	}
}
