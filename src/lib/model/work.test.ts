import { describe, expect, it } from 'vitest';
import { openMissionState, pendmState } from './work';

describe('work state', () => {
	it('a pendm still open is a proposal', () => {
		expect(pendmState({ id: '1', archived: false })).toEqual({ state: 'proposed', openMissionId: null });
		expect(pendmState({ id: '1', archived: null })).toEqual({ state: 'proposed', openMissionId: null });
	});

	it('a pendm that matured is followed into its open mission', () => {
		expect(pendmState({ id: '1', archived: true, openMission: { id: '9', archived: false } })).toEqual({ state: 'open', openMissionId: '9' });
		expect(pendmState({ id: '1', archived: true, openMission: { id: '9', archived: true } }).state).toBe('taken');
	});

	it('a pendm closed with no mission did not become one', () => {
		expect(pendmState({ id: '1', archived: true, openMission: null })).toEqual({ state: 'notApproved', openMissionId: null });
	});

	it('an open mission: open, taken (archived = taken, or work started), removed by lifecycle', () => {
		expect(openMissionState({ id: '9', archived: false })).toBe('open');
		expect(openMissionState({ id: '9', archived: false, startedWork: true })).toBe('taken');
		expect(openMissionState({ id: '9', archived: true })).toBe('taken');
		expect(openMissionState({ id: '9', archived: false, lifecycle: 'archived' })).toBe('removed');
		expect(openMissionState({ id: '9', archived: true, lifecycle: 'released' })).toBe('removed');
		expect(openMissionState({ id: '9', lifecycle: 'archiveProposed' })).toBe('open');
	});
});
