import { describe, expect, it } from 'vitest';
import { buildTree } from './tree';
import type { GraphEdge, GraphNode, NodeKind, Rel } from './types';

const node = (id: string, kind: NodeKind, currentRev = 1): GraphNode => ({
	id, kind, title: id, currentRev, inquiryStatus: null, absorbedInto: null, attributedTo: null, createdBy: 'u'
});
let n = 0;
const e = (from: string, rel: Rel, to: string, toRev = 1): GraphEdge => ({ id: `e${n++}`, rel, from, to, toRev });

describe('buildTree', () => {
	it('orders answers before arguments and nests branches', () => {
		const nodes = new Map([
			['Q', node('Q', 'question')],
			['X', node('X', 'position')],
			['Y', node('Y', 'position')],
			['Xx', node('Xx', 'position')],
			['a', node('a', 'argument')]
		]);
		const t = buildTree('Q', nodes, [e('a', 'opposes', 'X'), e('Xx', 'refines', 'X'), e('X', 'answers', 'Q'), e('Y', 'answers', 'Q')])!;
		expect(t.children.map((c) => c.node.id)).toEqual(['X', 'Y']);
		expect(t.children[0].children.map((c) => c.node.id)).toEqual(['Xx', 'a']);
	});

	it('a node reached twice is shown again but not expanded twice', () => {
		const nodes = new Map([
			['X', node('X', 'position')],
			['Y', node('Y', 'position')],
			['a', node('a', 'argument')],
			['b', node('b', 'argument')]
		]);
		const t = buildTree('X', nodes, [e('a', 'supports', 'X'), e('a', 'supports', 'Y'), e('Y', 'refines', 'X'), e('b', 'opposes', 'a')])!;
		const viaY = t.children.find((c) => c.node.id === 'Y')!.children[0];
		const direct = t.children.find((c) => c.node.id === 'a')!;
		expect([viaY.repeat, direct.repeat].sort()).toEqual([false, true]);
	});

	it('terminates on a cycle', () => {
		const nodes = new Map([
			['a', node('a', 'argument')],
			['b', node('b', 'argument')]
		]);
		const t = buildTree('a', nodes, [e('b', 'opposes', 'a'), e('a', 'opposes', 'b')])!;
		expect(t.children[0].children[0]).toMatchObject({ repeat: true, children: [] });
	});

	it('flags an edge whose target was revised after it was made', () => {
		const nodes = new Map([
			['X', node('X', 'position', 3)],
			['a', node('a', 'argument')]
		]);
		const t = buildTree('X', nodes, [e('a', 'opposes', 'X', 2)])!;
		expect(t.children[0].stale).toBe(true);
	});
});
