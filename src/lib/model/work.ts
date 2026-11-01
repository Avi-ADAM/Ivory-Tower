/**
 * Where the work a branch led to stands in its rikma, read from 1lev1's
 * `ivoryWorkStatus` qid. A pure reading of 1lev1's own fields — Ivory Tower
 * never infers an outcome 1lev1 has not recorded.
 *
 *  - proposed:    a pendm still open for the rikma's consent
 *  - open:        an open mission, waiting for someone to take it
 *  - taken:       someone took it (open mission `archived` = taken, or work started)
 *  - notApproved: the proposal closed without becoming a mission
 *  - removed:     the mission was archived/released through the rikma's archival flow
 */
export const WORK_STATES = ['proposed', 'open', 'taken', 'notApproved', 'removed'] as const;
export type WorkState = (typeof WORK_STATES)[number];

export interface OpenMissionRow {
	id: string;
	archived?: boolean | null;
	lifecycle?: string | null;
	startedWork?: boolean;
}

export interface PendmRow {
	id: string;
	archived?: boolean | null;
	openMission?: OpenMissionRow | null;
}

export function openMissionState(om: OpenMissionRow): WorkState {
	if (om.lifecycle === 'archived' || om.lifecycle === 'released') return 'removed';
	if (om.archived === true || om.startedWork) return 'taken';
	return 'open';
}

/** A pendm, followed into the open mission it matured into, when it did. */
export function pendmState(p: PendmRow): { state: WorkState; openMissionId: string | null } {
	if (p.openMission) return { state: openMissionState(p.openMission), openMissionId: p.openMission.id };
	if (p.archived === true) return { state: 'notApproved', openMissionId: null };
	return { state: 'proposed', openMissionId: null };
}

export function isWorkState(v: unknown): v is WorkState {
	return typeof v === 'string' && (WORK_STATES as readonly string[]).includes(v);
}
