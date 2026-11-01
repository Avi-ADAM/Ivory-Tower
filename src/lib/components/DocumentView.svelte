<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { useI18n } from '$lib/i18n';
	import { passageOptions, type ChildOption } from '$lib/model/rules';
	import type { NodeStatus } from '$lib/model/status';
	import type { NodeKind } from '$lib/model/types';
	import { locate, makeQuote, type TextQuote } from '$lib/anchor/quote';
	import { clearHighlights, highlight, rangeOffsets } from '$lib/anchor/dom';
	import type { DocBlock, DocResponse } from '$lib/model/doc';
	import KindBadge from './KindBadge.svelte';
	import StatusChips from './StatusChips.svelte';
	import Markdown from './Markdown.svelte';

	let {
		blocks,
		statuses,
		base,
		signedIn,
		isAuthor,
		blockKinds,
		currentUserId
	}: {
		blocks: DocBlock[];
		statuses: Record<string, NodeStatus>;
		base: string;
		signedIn: boolean;
		isAuthor: boolean;
		blockKinds: NodeKind[];
		currentUserId: string | null;
	} = $props();

	const i18n = useI18n();
	const t = (k: string, p?: Record<string, string | number>) => i18n.t(k, p);

	let container: HTMLElement;

	// ── reading mode per block: the original, one alternative, or side by side
	let readMode = $state<Record<string, string>>({});
	const modeOf = (b: DocBlock) => readMode[b.edgeId] ?? 'original';
	/** The node(s) currently shown for a block. */
	function shown(b: DocBlock): { id: string; kind: NodeKind; title: string; body: string; responses: DocResponse[]; label: string }[] {
		const original = { id: b.block.id, kind: b.block.kind, title: b.block.title, body: b.body, responses: b.responses, label: t('doc.readOriginal') };
		const alts = b.alternatives.map((a) => ({
			id: a.node.id,
			kind: a.node.kind,
			title: a.node.title,
			body: a.body,
			responses: a.responses,
			label: t('doc.alternativeBy', { name: a.node.authorName ?? '' })
		}));
		const m = modeOf(b);
		if (m === 'side') return [original, ...alts];
		return [alts.find((a) => a.id === m) ?? original];
	}

	// ── highlights: re-applied whenever the rendered text changes
	let orphans = $state<Set<string>>(new Set());
	const responsesByTarget = $derived(
		new Map(blocks.flatMap((b) => [[b.block.id, b.responses] as const, ...b.alternatives.map((a) => [a.node.id, a.responses] as const)]))
	);

	function applyHighlights() {
		if (!container) return;
		const lost = new Set<string>();
		for (const root of container.querySelectorAll<HTMLElement>('[data-anchor-root]')) {
			clearHighlights(root);
			const text = root.textContent ?? '';
			for (const r of responsesByTarget.get(root.dataset.anchorRoot!) ?? []) {
				if (!r.anchor) continue;
				const at = locate(text, r.anchor);
				if (!at) {
					lost.add(r.edgeId);
					continue;
				}
				highlight(root, at.start, at.end, { 'data-anchor': r.edgeId, class: `hl hl-${r.rel}` });
			}
		}
		orphans = lost;
	}

	$effect(() => {
		// dependencies: the blocks and how each is being read
		void blocks;
		void JSON.stringify(readMode);
		tick().then(applyHighlights);
	});

	// ── linking marks and margin notes
	let active = $state<string | null>(null);
	$effect(() => {
		if (!container) return;
		for (const m of container.querySelectorAll('mark.on')) m.classList.remove('on');
		if (active) for (const m of container.querySelectorAll(`mark[data-anchor="${active}"]`)) m.classList.add('on');
	});

	function onContainerClick(e: MouseEvent) {
		const mark = (e.target as Element).closest?.('mark[data-anchor]') as HTMLElement | null;
		if (!mark || !window.getSelection()?.isCollapsed) return;
		active = mark.dataset.anchor!;
		document.querySelector(`[data-note="${active}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	// ── selecting a passage
	type Pending = { target: string; kind: NodeKind; quote: TextQuote; top: number; left: number };
	let pending = $state<Pending | null>(null);
	let composing = $state<(Pending & { option: ChildOption }) | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function readSelection() {
		if (composing) return;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return void (pending = null);
		const range = sel.getRangeAt(0);
		const startEl = range.startContainer.nodeType === 1 ? (range.startContainer as Element) : range.startContainer.parentElement;
		const root = startEl?.closest<HTMLElement>('[data-anchor-root]');
		if (!root || !container?.contains(root)) return void (pending = null);
		const off = rangeOffsets(root, range);
		if (!off) return void (pending = null);
		const text = root.textContent ?? '';
		let { start, end } = off;
		while (start < end && /\s/.test(text[start])) start++;
		while (end > start && /\s/.test(text[end - 1])) end--;
		if (start === end) return void (pending = null);
		const rect = range.getBoundingClientRect();
		pending = {
			target: root.dataset.anchorRoot!,
			kind: root.dataset.kind as NodeKind,
			quote: makeQuote(text, start, end),
			top: Math.max(8, rect.top - 48),
			left: Math.min(Math.max(rect.left + rect.width / 2, 120), window.innerWidth - 120)
		};
	}

	onMount(() => {
		const onChange = () => {
			clearTimeout(timer);
			timer = setTimeout(readSelection, 120);
		};
		document.addEventListener('selectionchange', onChange);
		window.addEventListener('scroll', onChange, { passive: true });
		window.addEventListener('resize', onChange);
		applyHighlights();
		return () => {
			document.removeEventListener('selectionchange', onChange);
			window.removeEventListener('scroll', onChange);
			window.removeEventListener('resize', onChange);
			clearTimeout(timer);
		};
	});

	function choose(option: ChildOption) {
		if (!pending) return;
		composing = { ...pending, option };
		pending = null;
		window.getSelection()?.removeAllRanges();
		tick().then(() => document.getElementById('compose-title')?.focus());
	}

	const snippet = (s: string, n = 90) => (s.length > n ? s.slice(0, n) + '…' : s);
	const relClass = (rel: string) => `rel rel-${rel}`;
</script>

<div class="doc" bind:this={container} onclick={onContainerClick} role="presentation">
	{#if signedIn && blocks.length}
		<p class="hint small muted">✎ {t('doc.selectHint')}</p>
	{/if}

	{#if blocks.length === 0}
		<p class="muted">{t('doc.empty')}</p>
	{/if}

	{#each blocks as b, i (b.edgeId)}
		{@const views = shown(b)}
		<section class="block k-{b.block.kind}" id="block-{b.block.id}">
			<div class="text-col">
				<div class="bhead row small">
					<KindBadge kind={b.block.kind} />
					<StatusChips node={b.block} status={statuses[b.block.id]} />
					<a class="muted" href="{base}/n/{b.block.id}">{t('doc.open')}</a>
					{#if currentUserId === b.block.createdBy}
						<a class="muted" href="{base}/n/{b.block.id}/edit">{t('doc.edit')}</a>
					{/if}
					{#if isAuthor}
						<form method="POST" action="?/moveBlock" class="inline">
							<input type="hidden" name="edgeId" value={b.edgeId} />
							<button class="ghost chip" name="dir" value="up" disabled={i === 0} aria-label={t('doc.moveUp')}>↑</button>
							<button class="ghost chip" name="dir" value="down" disabled={i === blocks.length - 1} aria-label={t('doc.moveDown')}>↓</button>
						</form>
					{/if}
				</div>

				{#if b.alternatives.length}
					<div class="modes row small" role="group" aria-label={t('doc.readAs')}>
						<span class="muted">{t('doc.readAs')}</span>
						<button class="chip" aria-pressed={modeOf(b) === 'original'} onclick={() => (readMode[b.edgeId] = 'original')}>{t('doc.readOriginal')}</button>
						{#each b.alternatives as a (a.node.id)}
							<button class="chip" aria-pressed={modeOf(b) === a.node.id} onclick={() => (readMode[b.edgeId] = a.node.id)}>
								{t('doc.alternativeBy', { name: a.node.authorName ?? '' })}
							</button>
						{/each}
						<button class="chip" aria-pressed={modeOf(b) === 'side'} onclick={() => (readMode[b.edgeId] = 'side')}>{t('doc.readSideBySide')}</button>
					</div>
				{/if}

				<div class="views" class:side={views.length > 1}>
					{#each views as v (v.id)}
						<div class="view" class:alt={v.id !== b.block.id}>
							{#if views.length > 1 || v.id !== b.block.id}<div class="vlabel small">{v.label}</div>{/if}
							<div class="anchorable" data-anchor-root={v.id} data-kind={v.kind}>
								<p class="claim">{v.title}</p>
								{#if v.body}<Markdown text={v.body} />{/if}
							</div>
						</div>
					{/each}
				</div>
				{#if b.source}
					<p class="small muted src">{t('node.source')}: {b.source}</p>
				{/if}
			</div>

			<aside class="notes-col">
				{#each views as v (v.id)}
					{@const anchored = v.responses.filter((r) => r.anchor)}
					{@const whole = v.responses.filter((r) => !r.anchor)}
					{#if v.responses.length}
						{#if views.length > 1}<div class="vlabel small">{v.label}</div>{/if}
						<ul class="notes">
							{#each anchored as r (r.edgeId)}
								<li
									class="note"
									class:on={active === r.edgeId}
									id="note-{r.child.id}"
									data-note={r.edgeId}
									onmouseenter={() => (active = r.edgeId)}
									onmouseleave={() => (active = null)}
								>
									<span class={relClass(r.rel)}>{t(`rel.${r.rel}`)}</span>
									<a href="{base}/n/{r.child.id}">{r.child.title}</a>
									<q class="small muted">{snippet(r.anchor!.exact)}</q>
									<span class="row small">
										<StatusChips node={r.child} status={statuses[r.child.id]} />
										<span class="muted">{r.child.authorName}</span>
										{#if orphans.has(r.edgeId)}<span class="warn" title={t('doc.orphan')}>⚠ {t('doc.orphan')}</span>
										{:else if r.stale}<span class="warn" title={t('node.stale')}>⟳</span>{/if}
									</span>
								</li>
							{/each}
							{#if whole.length}
								<li class="small muted wh">{t('doc.wholeBlock')}</li>
								{#each whole as r (r.edgeId)}
									<li class="note" id="note-{r.child.id}" data-note={r.edgeId}>
										<span class={relClass(r.rel)}>{t(`rel.${r.rel}`)}</span>
										<a href="{base}/n/{r.child.id}">{r.child.title}</a>
										<span class="row small"><StatusChips node={r.child} status={statuses[r.child.id]} /></span>
									</li>
								{/each}
							{/if}
						</ul>
					{/if}
				{/each}
			</aside>
		</section>
	{/each}
</div>

{#if pending}
	<div class="toolbar" style="top: {pending.top}px; left: {pending.left}px" role="toolbar" aria-label={t('doc.respondTitle')}>
		{#each passageOptions(pending.kind) as o (o.key)}
			<button class="tb tb-{o.key}" onmousedown={(e) => e.preventDefault()} onclick={() => choose(o)}>{t(`passage.${o.key}`)}</button>
		{/each}
	</div>
{/if}

{#if composing}
	<div class="composer card stack" role="dialog" aria-modal="false" aria-labelledby="compose-h">
		<h3 id="compose-h">{t('doc.respondTitle')} · <span class={relClass(composing.option.rel)}>{t(`passage.${composing.option.key}`)}</span></h3>
		<blockquote class="small">«{snippet(composing.quote.exact, 240)}»</blockquote>
		<form method="POST" action="?/respond" class="stack">
			<input type="hidden" name="target" value={composing.target} />
			<input type="hidden" name="what" value="{composing.option.kind}:{composing.option.rel}" />
			<input type="hidden" name="anchor" value={JSON.stringify(composing.quote)} />
			<div>
				<label for="compose-title">{t('add.claim')}</label>
				<input id="compose-title" name="title" required maxlength="300" />
			</div>
			<div>
				<label for="compose-body">{t('add.body')}</label>
				<textarea id="compose-body" name="body"></textarea>
				<p class="small muted">{t('doc.markdownHint')}</p>
			</div>
			<div class="row">
				<button type="submit">{t('add.submit')}</button>
				<button type="button" class="ghost" onclick={() => (composing = null)}>{t('doc.cancel')}</button>
			</div>
		</form>
	</div>
{/if}

{#if isAuthor}
	<section class="card stack add-block">
		<h2>{t('doc.addBlock')}</h2>
		<form method="POST" action="?/addBlock" class="stack">
			<div>
				<label for="bk">{t('doc.blockKind')}</label>
				<select id="bk" name="kind">
					{#each blockKinds as k (k)}<option value={k}>{t(`kind.${k}`)}</option>{/each}
				</select>
			</div>
			<div>
				<label for="bt">{t('add.claim')}</label>
				<input id="bt" name="title" required maxlength="300" />
			</div>
			<div>
				<label for="bb">{t('add.body')}</label>
				<textarea id="bb" name="body" rows="6"></textarea>
				<p class="small muted">{t('doc.markdownHint')}</p>
			</div>
			<div>
				<label for="bs">{t('add.source')}</label>
				<input id="bs" name="source" dir="ltr" />
			</div>
			<div>
				<label for="ba">{t('add.attributedTo')}</label>
				<input id="ba" name="attributedTo" />
			</div>
			<button type="submit">{t('doc.addBlock')}</button>
		</form>
		<details>
			<summary class="small">{t('doc.include')}</summary>
			<form method="POST" action="?/link" class="stack sub">
				<input type="hidden" name="rel" value="partOf" />
				<div>
					<label for="inc">{t('link.nodeId')}</label>
					<input id="inc" name="from" required dir="ltr" />
				</div>
				<button class="ghost" type="submit">{t('link.submit')}</button>
			</form>
		</details>
	</section>
{:else if signedIn}
	<p class="muted small">{t('doc.authorOnlyBlocks')}</p>
{/if}

<style>
	.hint { margin: 0 0 16px; }
	.block {
		display: grid; grid-template-columns: 1fr; gap: 12px;
		padding-block: 16px; border-block-start: 1px solid var(--line);
	}
	@media (min-width: 900px) { .block { grid-template-columns: minmax(0, 1fr) 300px; gap: 28px; } }
	.text-col { border-inline-start: 4px solid var(--c, var(--line)); padding-inline-start: 14px; min-width: 0; }
	.k-question { --c: var(--question); }
	.k-position { --c: var(--position); }
	.k-argument { --c: var(--argument); }
	.k-evidence { --c: var(--evidence); }
	.k-synthesis { --c: var(--synthesis); }
	.bhead { margin-block-end: 6px; }
	.bhead a { text-decoration: none; }
	.inline { display: inline-flex; gap: 4px; }
	.modes { margin-block-end: 8px; }
	.views.side { display: grid; grid-template-columns: 1fr; gap: 14px; }
	@media (min-width: 700px) { .views.side { grid-template-columns: 1fr 1fr; } }
	.view.alt { background: color-mix(in srgb, var(--synthesis) 6%, transparent); border-radius: 8px; padding: 8px; }
	.vlabel { color: var(--muted); font-family: system-ui, sans-serif; margin-block-end: 4px; }
	.anchorable { font-size: 1.08rem; line-height: 1.75; }
	.claim { font-weight: 700; margin: 0 0 .4em; }
	.src { margin-block-start: 6px; }

	.anchorable :global(mark.hl) {
		background: color-mix(in srgb, var(--accent) 16%, transparent); color: inherit;
		border-block-end: 2px solid var(--accent); cursor: pointer; border-radius: 2px;
	}
	.anchorable :global(mark.hl-opposes) { background: color-mix(in srgb, var(--against) 14%, transparent); border-color: var(--against); }
	.anchorable :global(mark.hl-supports) { background: color-mix(in srgb, var(--for) 14%, transparent); border-color: var(--for); }
	.anchorable :global(mark.hl-alternativeTo) { background: color-mix(in srgb, var(--synthesis) 16%, transparent); border-color: var(--synthesis); }
	.anchorable :global(mark.hl-arisesFrom) { background: color-mix(in srgb, var(--question) 14%, transparent); border-color: var(--question); }
	.anchorable :global(mark.on) { outline: 2px solid var(--ink); outline-offset: 1px; }

	.notes { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
	.note {
		display: flex; flex-direction: column; gap: 2px; padding: 8px 10px;
		background: var(--surface); border: 1px solid var(--line); border-radius: 8px; font-size: .92rem;
	}
	.note.on { border-color: var(--ink); }
	.note a { text-decoration: none; font-weight: 600; }
	.note a:hover { text-decoration: underline; }
	.note q { quotes: '«' '»'; }
	.wh { margin-block-start: 6px; }
	.rel { font-size: .75rem; font-family: system-ui, sans-serif; font-weight: 700; color: var(--muted); }
	.rel-supports { color: var(--for); }
	.rel-opposes { color: var(--against); }
	.rel-alternativeTo { color: var(--synthesis); }
	.rel-arisesFrom { color: var(--question); }
	.warn { color: var(--warn); }

	.toolbar {
		position: fixed; z-index: 20; transform: translateX(-50%);
		display: flex; gap: 2px; padding: 4px; border-radius: 10px;
		background: var(--ink); box-shadow: 0 6px 24px rgb(0 0 0 / .25);
	}
	@media (max-width: 640px) { .toolbar { top: auto !important; bottom: 16px; left: 50% !important; } }
	.tb { background: transparent; border: 0; color: var(--bg); padding: 6px 12px; font-size: .9rem; font-family: system-ui, sans-serif; }
	.tb:hover, .tb:focus-visible { background: color-mix(in srgb, var(--bg) 18%, transparent); }
	.tb-against { color: color-mix(in srgb, var(--against) 55%, var(--bg)); }
	.tb-for { color: color-mix(in srgb, var(--for) 55%, var(--bg)); }

	.composer {
		position: fixed; z-index: 30; inset-inline-end: 16px; bottom: 16px; width: min(440px, calc(100vw - 32px));
		max-height: calc(100vh - 32px); overflow: auto; box-shadow: 0 10px 40px rgb(0 0 0 / .25);
	}
	.composer h3 { margin: 0; font-size: 1.05rem; }
	.composer blockquote { margin: 0; padding-inline-start: 10px; border-inline-start: 3px solid var(--accent); color: var(--muted); }
	.add-block { margin-block-start: 24px; }
	.sub { margin-block-start: 8px; }
</style>
