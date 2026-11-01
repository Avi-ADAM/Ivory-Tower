/**
 * The bridge to 1lev1 rikmas.
 *
 * Every call is made AS THE MEMBER, with their own `.1lev1.com` session token,
 * against 1lev1's ordinary endpoints (`/api/send` qids and `/api/action`). So
 * 1lev1 enforces exactly what it enforces for its own pages — membership
 * (`projectMember`), the qid guards (`64getUserProjectList` is pinned to the
 * caller) — and Ivory Tower holds no secret that could do more than the member
 * could do by hand. Nothing here decides anything in a rikma: opening a mission
 * in a rikma with several members is a proposal, matured by that rikma's own
 * consent rules.
 *
 * Off unless STRAPI_URL (1lev1 sign-in) is configured.
 */
import { DomainError } from './repo';
import type { LevConfig } from './levAuth';
import { escapeHtml } from '$lib/text/markdown';

export interface Rikma {
	id: string;
	name: string;
}

export interface LevSession {
	jwt: string;
	levUserId: string;
}

type FetchFn = typeof fetch;

const RIKMA_TTL_MS = 5 * 60_000;
const rikmaCache = new Map<string, { at: number; value: Rikma[] }>();

/** Test seam. */
export function clearRikmaCache(): void {
	rikmaCache.clear();
}

async function call(cfg: LevConfig, s: LevSession, path: string, body: unknown, fetchFn: FetchFn): Promise<unknown> {
	let res: Response;
	try {
		res = await fetchFn(`${cfg.levUrl}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: `jwt=${s.jwt}` },
			body: JSON.stringify(body)
		});
	} catch {
		throw new DomainError('levUnavailable');
	}
	if (res.status === 401 || res.status === 403) throw new DomainError('levForbidden');
	let json: unknown = null;
	try {
		json = await res.json();
	} catch {
		/* fall through */
	}
	if (!res.ok) throw new DomainError('levUnavailable');
	return json;
}

/** The rikmas the member belongs to, newest first as 1lev1 lists them. Cached per token. */
export async function listMyRikmas(cfg: LevConfig, s: LevSession, fetchFn: FetchFn = fetch, now = Date.now()): Promise<Rikma[]> {
	const hit = rikmaCache.get(s.jwt);
	if (hit && now - hit.at < RIKMA_TTL_MS) return hit.value;
	const json = (await call(cfg, s, '/api/send', { data: { queId: '64getUserProjectList', arg: { uid: s.levUserId } } }, fetchFn)) as {
		data?: { usersPermissionsUser?: { data?: { attributes?: { projects_1s?: { data?: { id: string | number; attributes?: { projectName?: string } }[] } } } } };
	};
	const rows = json?.data?.usersPermissionsUser?.data?.attributes?.projects_1s?.data;
	if (!Array.isArray(rows)) throw new DomainError('levUnavailable');
	const value = rows.map((r) => ({ id: String(r.id), name: r.attributes?.projectName || `#${r.id}` }));
	if (rikmaCache.size > 2000) rikmaCache.clear();
	rikmaCache.set(s.jwt, { at: now, value });
	return value;
}

export async function requireMembership(cfg: LevConfig, s: LevSession, rikmaId: string, fetchFn: FetchFn = fetch): Promise<Rikma> {
	const r = (await listMyRikmas(cfg, s, fetchFn)).find((x) => x.id === String(rikmaId));
	if (!r) throw new DomainError('notRikmaMember');
	return r;
}

/** What a mission or process carries back: the claim, its text, and the way home to the map. */
export function describeForRikma(p: { title: string; body: string; note?: string; url: string; linkLabel: string }): {
	html: string;
	text: string;
} {
	const paras = [p.note?.trim(), p.title.trim(), p.body.trim()].filter(Boolean) as string[];
	const html =
		paras.map((x) => `<p>${escapeHtml(x).replace(/\n/g, '<br>')}</p>`).join('') +
		`<p><a href="${escapeHtml(p.url)}">${escapeHtml(p.linkLabel)}</a></p>`;
	const text = [...paras, `${p.linkLabel}: ${p.url}`].join('\n\n');
	return { html, text };
}

type ActionResult = { success?: boolean; data?: Record<string, unknown>; error?: { code?: string; message?: string } };

async function action(cfg: LevConfig, s: LevSession, actionKey: string, params: Record<string, unknown>, fetchFn: FetchFn) {
	const json = (await call(cfg, s, '/api/action', { actionKey, params }, fetchFn)) as ActionResult;
	if (!json?.success) throw new DomainError('levRefused');
	return json.data ?? {};
}

/**
 * Open a mission in the rikma. In a rikma of one it opens directly; with more
 * members it is a proposal (pendm) the rikma answers under its own restime.
 */
export async function openMission(
	cfg: LevConfig,
	s: LevSession,
	p: { rikmaId: string; name: string; descripHtml: string },
	fetchFn: FetchFn = fetch
): Promise<{ externalId: string; externalType: string; missionId: string | null }> {
	const data = await action(cfg, s, 'createMission', { projectId: p.rikmaId, missionName: p.name, descrip: p.descripHtml }, fetchFn);
	const externalId = data.createdEntityId != null ? String(data.createdEntityId) : '';
	if (!externalId) throw new DomainError('levRefused');
	return {
		externalId,
		externalType: String(data.createdEntityType ?? 'mission'),
		missionId: data.missionId != null ? String(data.missionId) : null
	};
}

/** Start a process: a named thread the rikma pursues before it is a mission. */
export async function startProcess(
	cfg: LevConfig,
	s: LevSession,
	p: { rikmaId: string; name: string; description: string },
	fetchFn: FetchFn = fetch
): Promise<{ externalId: string; externalType: string }> {
	const data = await action(cfg, s, 'createProcess', { projectId: p.rikmaId, name: p.name, description: p.description }, fetchFn);
	if (data.processId == null) throw new DomainError('levRefused');
	return { externalId: String(data.processId), externalType: 'process' };
}

/** Where a member sees the rikma in 1lev1. */
export function rikmaUrl(cfg: LevConfig, rikmaId: string): string {
	return `${cfg.levUrl}/moach/${encodeURIComponent(rikmaId)}`;
}
