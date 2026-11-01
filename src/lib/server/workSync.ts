import type { Db } from './db';
import { setRikmaLinkStatus, type RikmaLink } from './repo';
import { levConfig } from './levAuth';
import { fetchWorkStatus, type LevSession } from './levBridge';

/**
 * How long a recorded state is trusted before a member's visit asks 1lev1
 * again. WORK_STATUS_REFRESH_SECONDS overrides the two-minute default.
 */
const configured = Number(process.env.WORK_STATUS_REFRESH_SECONDS);
export const REFRESH_AFTER_MS = (Number.isFinite(configured) && configured >= 0 ? configured : 120) * 1000;

/** The 1lev1 row to ask about: once a proposal matured, follow its open mission. */
function key(l: RikmaLink): { type: 'pendm' | 'openMission'; id: string } | null {
	if (l.kind !== 'mission') return null;
	if (l.externalType === 'pendm') return { type: 'pendm', id: l.externalId };
	if (l.externalType === 'openMission') return { type: 'openMission', id: l.externalId };
	return null;
}

/**
 * Refresh the links whose rikma the reader belongs to and whose state is
 * stale, asking 1lev1 as the reader. A link 1lev1 does not answer for keeps
 * its last known state; an outage changes nothing. Returns the links with
 * whatever was learned.
 */
export async function refreshWorkStatus(
	db: Db,
	links: RikmaLink[],
	reader: { session: LevSession | null; rikmaIds: readonly string[] },
	now = Date.now(),
	fetchFn: typeof fetch = fetch
): Promise<RikmaLink[]> {
	const cfg = levConfig();
	if (!cfg || !reader.session) return links;
	const due = links.filter(
		(l) => key(l) && reader.rikmaIds.includes(l.rikmaId) && (!l.statusAt || now - Date.parse(l.statusAt) > REFRESH_AFTER_MS)
	);
	const byRikma = new Map<string, RikmaLink[]>();
	for (const l of due) byRikma.set(l.rikmaId, [...(byRikma.get(l.rikmaId) ?? []), l]);

	const updated = new Map<string, Partial<RikmaLink>>();
	for (const [rikmaId, group] of byRikma) {
		try {
			const res = await fetchWorkStatus(
				cfg,
				reader.session,
				{
					rikmaId,
					pendmIds: group.filter((l) => key(l)!.type === 'pendm').map((l) => l.externalId),
					openMissionIds: group.filter((l) => key(l)!.type === 'openMission').map((l) => l.externalId)
				},
				fetchFn
			);
			for (const l of group) {
				const k = key(l)!;
				const st = res.get(`${k.type}:${k.id}`);
				if (!st) continue;
				await setRikmaLinkStatus(db, { id: l.id, status: st.state, openMissionId: st.openMissionId });
				updated.set(l.id, { status: st.state, statusAt: new Date(now).toISOString(), openMissionId: st.openMissionId ?? l.openMissionId });
			}
		} catch {
			// 1lev1 unreachable or refused: keep showing the last known state.
		}
	}
	return links.map((l) => ({ ...l, ...(updated.get(l.id) ?? {}) }));
}
