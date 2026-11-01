import { describe, expect, it } from 'vitest';
import { canLink, childOptions, insertBetweenPlan, passageOptions } from './rules';

describe('rules', () => {
	it('a question takes answers and sub-questions, not arguments', () => {
		const keys = childOptions('question').map((o) => o.key);
		expect(keys).toEqual(['answer', 'question']);
	});

	it('a position takes branches, arguments and evidence both ways', () => {
		expect(childOptions('position').map((o) => o.key)).toEqual([
			'branch', 'alternative', 'argumentFor', 'argumentAgainst', 'evidenceFor', 'evidenceAgainst', 'question'
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

	it('a document takes blocks only through partOf, not the generic menu', () => {
		expect(childOptions('document')).toEqual([]);
		expect(canLink('position', 'partOf', 'document')).toBe(true);
		expect(canLink('document', 'partOf', 'document')).toBe(false);
	});

	it('a selected passage can be answered four ways', () => {
		expect(passageOptions('position').map((o) => `${o.kind}:${o.rel}`)).toEqual([
			'argument:opposes', 'argument:supports', 'position:alternativeTo', 'question:arisesFrom'
		]);
		expect(passageOptions('argument').find((o) => o.rel === 'alternativeTo')?.kind).toBe('argument');
		expect(passageOptions('question').map((o) => o.rel)).toEqual(['arisesFrom']);
	});

	it('an answer edge cannot be split', () => {
		expect(insertBetweenPlan('answers', 'position', 'question')).toBeNull();
	});
});
