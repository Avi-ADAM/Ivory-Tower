import { describe, expect, it } from 'vitest';
import { canLink, childOptions, insertBetweenPlan } from './rules';

describe('rules', () => {
	it('a question takes answers and sub-questions, not arguments', () => {
		const keys = childOptions('question').map((o) => o.key);
		expect(keys).toEqual(['answer', 'question']);
	});

	it('a position takes branches, arguments and evidence both ways', () => {
		expect(childOptions('position').map((o) => o.key)).toEqual([
			'branch', 'argumentFor', 'argumentAgainst', 'evidenceFor', 'evidenceAgainst', 'question'
		]);
	});

	it('premises hang only on arguments', () => {
		expect(canLink('argument', 'premise', 'argument')).toBe(true);
		expect(canLink('argument', 'premise', 'position')).toBe(false);
	});

	it('a position cannot answer a position', () => {
		expect(canLink('position', 'answers', 'position')).toBe(false);
	});

	it('splitting "evidence opposes X" puts an argument in the middle', () => {
		expect(insertBetweenPlan('opposes', 'evidence', 'position')).toEqual({
			middleKind: 'argument',
			lowerRels: ['supports', 'opposes']
		});
	});

	it('splitting a branch inserts an intermediate position', () => {
		expect(insertBetweenPlan('refines', 'position', 'position')).toEqual({
			middleKind: 'position',
			lowerRels: ['refines']
		});
	});

	it('an answer edge cannot be split', () => {
		expect(insertBetweenPlan('answers', 'position', 'question')).toBeNull();
	});
});
