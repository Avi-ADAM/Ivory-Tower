<script lang="ts">
	import type { SvelteSet } from 'svelte/reactivity';
	import type { TreeItem } from '$lib/model/tree';
	import type { NodeStatus } from '$lib/model/status';
	import { useI18n } from '$lib/i18n';
	import StatusChips from './StatusChips.svelte';
	import Self from './TreeBranch.svelte';

	let {
		item,
		statuses,
		base,
		depth,
		collapsed,
		leaves,
		toggle,
		inPanel = false
	}: {
		item: TreeItem;
		statuses: Record<string, NodeStatus>;
		base: string;
		depth: number;
		collapsed: SvelteSet<string>;
		leaves: (it: TreeItem) => number;
		toggle: (id: string) => void;
		inPanel?: boolean;
	} = $props();
	const i18n = useI18n();
	const t = (k: string, p?: Record<string, string | number>) => i18n.t(k, p);

	type Side = 'supports' | 'opposes';
	type Seg = { lane: TreeItem } | { side: Side; items: TreeItem[] };

	/** Branches each get a lane; for and against each gather into one panel. */
	const segs = $derived.by(() => {
		const out: Seg[] = [];
		const panels: Partial<Record<Side, TreeItem[]>> = {};
		for (const c of item.children) {
			const rel = c.via?.rel;
			if (rel === 'supports' || rel === 'opposes') {
				if (!panels[rel]) out.push({ side: rel, items: (panels[rel] = []) });
				panels[rel]!.push(c);
			} else out.push({ lane: c });
		}
		return out;
	});
	const open = $derived(item.children.length > 0 && !collapsed.has(item.node.id));
	const hidden = $derived.by(() => {
		let n = 0;
		const walk = (it: TreeItem) => { for (const c of it.children) { n++; walk(c); } };
		walk(item);
		return n;
	});
	const weight = (s: Seg) => ('lane' in s ? leaves(s.lane) : s.items.reduce((n, c) => n + leaves(c), 0));
	const rel = $derived(item.via?.rel);
	const quote = $derived(item.via?.anchor?.exact);
</script>

<div class="node">
	<article
		class="card k-{item.node.kind}"
		class:root={depth === 0}
		class:repeat={item.repeat}
		class:folded={item.children.length > 0 && !open}
	>
		<header class="meta">
			<span class="kind"><span class="dot" aria-hidden="true"></span>{t(`kind.${item.node.kind}`)}</span>
			{#if rel && !inPanel && rel !== 'answers' && rel !== 'partOf'}
				<span class="rel rel-{rel}">{t(`rel.${rel}`)}</span>
			{/if}
			{#if item.stale}<span class="flag stale" title={t('node.stale')}>⟳</span>{/if}
			{#if item.repeat}<span class="flag" title={t('node.repeat')}>↺</span>{/if}
		</header>
		{#if quote}<q class="quote">{quote.length > 90 ? quote.slice(0, 90) + '…' : quote}</q>{/if}
		<a class="title" href="{base}/n/{item.node.id}">{item.node.title}</a>
		<footer class="foot">
			<StatusChips node={item.node} status={statuses[item.node.id]} />
			{#if item.node.authorName}<span class="by">{item.node.authorName}</span>{/if}
		</footer>
		{#if item.children.length}
			<button
				type="button"
				class="fold"
				aria-expanded={open}
				title={open ? t('tree.hide') : t('tree.show', { count: hidden })}
				aria-label={open ? t('tree.hide') : t('tree.show', { count: hidden })}
				onclick={() => toggle(item.node.id)}
			>{open ? '−' : `+${hidden}`}</button>
		{/if}
	</article>

	{#if open}
		<div class="kids">
			{#each segs as s ('lane' in s ? s.lane.via?.id : s.side)}
				{#if 'lane' in s}
					<div class="lane w-{s.lane.via?.rel}" style="flex-grow: {weight(s)}">
						<Self item={s.lane} {statuses} {base} depth={depth + 1} {collapsed} {leaves} {toggle} />
					</div>
				{:else}
					<div class="lane w-{s.side}" style="flex-grow: {weight(s)}">
						<section class="panel p-{s.side}">
							<h3 class="ph">
								<span class="sign" aria-hidden="true">{s.side === 'supports' ? '+' : '−'}</span>
								{t(`relGroup.${s.side}`)}
								<span class="cnt">{s.items.length}</span>
							</h3>
							<div class="kids inner">
								{#each s.items as c (c.via?.id)}
									<div class="lane" style="flex-grow: {leaves(c)}">
										<Self item={c} {statuses} {base} depth={depth + 1} {collapsed} {leaves} {toggle} inPanel />
									</div>
								{/each}
							</div>
						</section>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.node { display: flex; flex-direction: column; align-items: center; min-width: 0; }

	/* ── card ─────────────────────────────────────────── */
	.card {
		--tint: color-mix(in srgb, var(--c) 7%, var(--surface));
		position: relative; width: 100%; max-width: 560px;
		display: flex; flex-direction: column; gap: 6px;
		padding: 11px 14px 14px;
		background: var(--tint);
		border: 1px solid color-mix(in srgb, var(--c) 26%, var(--line));
		border-block-start: 3px solid var(--c);
		border-radius: 12px;
		box-shadow: 0 1px 2px rgb(0 0 0 / .04), 0 6px 18px -10px rgb(0 0 0 / .18);
		transition: box-shadow .15s ease, transform .15s ease;
	}
	.card:hover { box-shadow: 0 1px 2px rgb(0 0 0 / .05), 0 10px 26px -12px rgb(0 0 0 / .28); transform: translateY(-1px); }
	.card:focus-within { outline: 2px solid color-mix(in srgb, var(--c) 60%, transparent); outline-offset: 2px; }
	.root {
		max-width: none; padding: 16px 20px 20px;
		--tint: color-mix(in srgb, var(--c) 12%, var(--surface));
		border-block-start-width: 4px;
	}
	.repeat { opacity: .72; border-style: dashed; border-block-start-style: solid; }
	/* a folded node reads as a stack: there is more beneath it */
	.folded {
		box-shadow:
			0 5px 0 -1px var(--surface), 0 5px 0 0 color-mix(in srgb, var(--c) 26%, var(--line)),
			0 10px 0 -2px var(--surface), 0 10px 0 -1px color-mix(in srgb, var(--c) 18%, var(--line));
	}

	.meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: .7rem; font-weight: 700; letter-spacing: .04em; }
	.kind { display: inline-flex; align-items: center; gap: 6px; color: var(--c); text-transform: uppercase; }
	.dot { width: 8px; height: 8px; border-radius: 2px; background: var(--c); }
	.rel {
		padding: 2px 8px; border-radius: 999px; font-weight: 600; letter-spacing: 0;
		background: color-mix(in srgb, var(--muted) 12%, transparent); color: var(--muted);
	}
	.flag { color: var(--muted); font-size: .85rem; }
	.stale { color: var(--warn); }
	.title {
		color: var(--ink); text-decoration: none; font-weight: 650; font-size: 1rem; line-height: 1.4;
		overflow-wrap: anywhere;
	}
	.root .title { font-size: 1.35rem; font-weight: 700; line-height: 1.3; }
	.title:hover { text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
	.title:focus-visible { outline: none; }
	.quote {
		quotes: '«' '»'; font-size: .8rem; color: var(--muted);
		padding: 4px 8px; border-radius: 6px; background: color-mix(in srgb, var(--c) 8%, transparent);
	}
	.foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: .75rem; color: var(--muted); }
	.by { margin-inline-start: auto; }

	.fold {
		position: absolute; inset-block-end: -13px; left: 50%; translate: -50% 0; z-index: 1;
		min-width: 26px; height: 26px; padding: 0 8px; border-radius: 999px;
		font: inherit; font-size: .75rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums;
		background: var(--surface); color: var(--c); border: 1.5px solid color-mix(in srgb, var(--c) 55%, var(--line));
		cursor: pointer;
	}
	.fold:hover { background: var(--c); color: var(--surface); }
	.fold:focus-visible { outline: 2px solid var(--c); outline-offset: 2px; }

	/* ── connectors ───────────────────────────────────── */
	.kids {
		--g: 18px;
		--wire: color-mix(in srgb, var(--muted) 45%, transparent);
		position: relative; width: 100%;
		display: flex; align-items: flex-start;
		padding-block-start: var(--g);
	}
	/* stem down from the parent to the bar */
	.kids::before {
		content: ''; position: absolute; inset-block-start: 0; left: calc(50% - 1px);
		height: var(--g); border-left: 2px solid var(--wire);
	}
	.lane {
		--drop: var(--wire);
		position: relative; flex: 1 1 0; min-width: 0;
		padding: var(--g) 6px 0;
		display: flex; flex-direction: column; align-items: stretch;
	}
	/* the bar across siblings, trimmed to run centre to centre */
	.lane::before {
		content: ''; position: absolute; inset-block-start: 0; inset-inline: 0;
		border-block-start: 2px solid var(--wire);
	}
	.lane:first-child::before { inset-inline-start: 50%; }
	.lane:last-child::before { inset-inline-end: 50%; }
	.lane:only-child::before { display: none; }
	/* drop from the bar to the child */
	.lane::after {
		content: ''; position: absolute; inset-block-start: 0; left: calc(50% - 1px);
		height: var(--g); border-left: 2px solid var(--drop);
	}
	.w-supports { --drop: var(--for); }
	.w-opposes { --drop: var(--against); }

	/* ── for / against panels ────────────────────────── */
	.panel {
		--side: var(--muted);
		width: 100%; padding: 12px 8px 14px; border-radius: 16px;
		background: color-mix(in srgb, var(--side) 6%, transparent);
		border: 1px solid color-mix(in srgb, var(--side) 30%, transparent);
	}
	.p-supports { --side: var(--for); }
	.p-opposes { --side: var(--against); }
	.ph {
		display: flex; align-items: center; justify-content: center; gap: 8px;
		margin: 0 auto; width: fit-content; padding-block: 4px; padding-inline: 6px 12px; border-radius: 999px;
		font-size: .78rem; font-weight: 700; letter-spacing: .03em; color: var(--side);
		background: var(--surface); border: 1px solid color-mix(in srgb, var(--side) 40%, transparent);
	}
	.sign {
		display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%;
		background: var(--side); color: var(--surface); font-size: .85rem; line-height: 1;
	}
	.cnt { font-variant-numeric: tabular-nums; color: var(--muted); font-weight: 600; }
	.inner { --wire: color-mix(in srgb, var(--side) 50%, transparent); }
	.inner > .lane { --drop: var(--wire); }

	.k-question { --c: var(--question); }
	.k-position { --c: var(--position); }
	.k-argument { --c: var(--argument); }
	.k-evidence { --c: var(--evidence); }
	.k-synthesis { --c: var(--synthesis); }
	.k-document { --c: var(--document); }
</style>
