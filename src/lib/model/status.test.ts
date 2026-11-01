import { describe, expect, it } from 'vitest';
import { computeStatuses } from './status';
import type { GraphEdge, Rel } from './types';

let n = 0;
const e = (from: string, rel: Rel, to: string): GraphEdge => ({ id: `e${n++}`, rel, from, to, toRev: 1 });

describe('computeStatuses', () => {
	it('a claim nobody opposes is unchallenged', () => {
		const s = computeStatuses(['X'], [e('a', 'supports', 'X')]).get('X')!;
		expect(s).toMatchObject({ status: 'unchallenged', supported: true, openObjections: 0 });
	});

	it('an unanswered objection leaves the claim contested', () => {
		const s = computeStatuses(['X'], [e('a', 'opposes', 'X')]).get('X')!;
		expect(s).toMatchObject({ status: 'contested', supported: false, openObjections: 1 });
	});

	it('an objection that is itself met counts as answered', () => {
		const s = computeStatuses(['X'], [e('a', 'opposes', 'X'), e('b', 'opposes', 'a')]).get('X')!;
		expect(s).toMatchObject({ status: 'answered', openObjections: 0, answeredObjections: 1 });
	});

	it('a counter that is itself countered revives the objection', () => {
		const edges = [e('a', 'opposes', 'X'), e('b', 'opposes', 'a'), e('c', 'opposes', 'b')];
		expect(computeStatuses(['X'], edges).get('X')!.status).toBe('contested');
	});

	it('supports never cancel an objection — only a counter-argument does', () => {
		const edges = [e('a', 'opposes', 'X'), e('b', 'supports', 'X'), e('c', 'supports', 'X')];
		expect(computeStatuses(['X'], edges).get('X')!.status).toBe('contested');
	});

	it('a mutual-opposition loop keeps both sides standing, whatever the order', () => {
		const edges = [e('a', 'opposes', 'X'), e('a', 'opposes', 'b'), e('b', 'opposes', 'a')];
		expect(computeStatuses(['X'], edges).get('X')!.status).toBe('contested');
		const reversed = [...edges].reverse();
		expect(computeStatuses(['X', 'a', 'b'], reversed).get('X')!.status).toBe('contested');
		expect(computeStatuses(['b', 'a'], edges).get('a')!.status).toBe('contested');
	});

	it('accepts a one-shot iterable of ids', () => {
		function* ids() {
			yield 'X';
		}
		expect(computeStatuses(ids(), [e('a', 'opposes', 'X')]).get('X')!.status).toBe('contested');
	});
});
