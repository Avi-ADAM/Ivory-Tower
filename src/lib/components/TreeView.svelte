<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { TreeItem } from '$lib/model/tree';
	import type { NodeStatus } from '$lib/model/status';
	import { NODE_KINDS } from '$lib/model/types';
	import { useI18n } from '$lib/i18n';
	import TreeBranch from './TreeBranch.svelte';

	/**
	 * A reader's view of the map as a tree that branches sideways: sibling
	 * answers sit in parallel lanes under their question, and a claim's for
	 * and against stand side by side in their own panels. Folding is purely
	 * a view; nothing here hides a branch for anyone else.
	 */
	let { item, statuses, base }: { item: TreeItem; statuses: Record<string, NodeStatus>; base: string } = $props();
	const i18n = useI18n();
	const t = (k: string, p?: Record<string, string | number>) => i18n.t(k, p);

	const FOLD_DEPTH = 3;
	const collapsed = new SvelteSet<string>();

	function each(it: TreeItem, fn: (it: TreeItem, depth: number) => void, depth = 0) {
		fn(it, depth);
		for (const c of it.children) each(c, fn, depth + 1);
	}
	function foldDeep() {
		collapsed.clear();
		each(item, (it, d) => { if (d >= FOLD_DEPTH && it.children.length) collapsed.add(it.node.id); });
	}
	foldDeep();

	/** Lanes a subtree needs as currently unfolded: its width share. */
	function leaves(it: TreeItem): number {
		if (!it.children.length || collapsed.has(it.node.id)) return 1;
		let n = 0;
		for (const c of it.children) n += leaves(c);
		return n;
	}
	function toggle(id: string) {
		if (collapsed.has(id)) collapsed.delete(id);
		else collapsed.add(id);
	}
	function collapseAll() {
		collapsed.clear();
		for (const c of item.children) each(c, (it) => { if (it.children.length) collapsed.add(it.node.id); });
	}

	let zoom = $state(1);
	let scroller: HTMLDivElement | undefined = $state();
	const LANE = 236;
	/** Fit the whole tree on first view when it is only a little too wide; never below 60%. */
	function fit() {
		if (!scroller) return;
		const need = leaves(item) * LANE + 28;
		zoom = Math.max(0.6, Math.min(1, Math.floor((scroller.clientWidth / need) * 20) / 20));
	}
	$effect(() => { if (scroller) untrack(fit); });
	const zoomBy = (d: number) => (zoom = Math.min(1.2, Math.max(0.5, Math.round((zoom + d) * 10) / 10)));
	const width = $derived(leaves(item));
	const kinds = $derived.by(() => {
		const seen = new Set<string>();
		each(item, (it) => seen.add(it.node.kind));
		return NODE_KINDS.filter((k) => seen.has(k));
	});
</script>

<section class="tree" aria-label={t('tree.label')}>
	<div class="bar">
		<ul class="legend">
			{#each kinds as k (k)}
				<li class="k-{k}"><span class="dot" aria-hidden="true"></span>{t(`kind.${k}`)}</li>
			{/each}
			<li class="for"><span class="dot" aria-hidden="true"></span>{t('relGroup.supports')}</li>
			<li class="against"><span class="dot" aria-hidden="true"></span>{t('relGroup.opposes')}</li>
		</ul>
		<div class="tools">
			<button type="button" class="tool" onclick={() => collapsed.clear()}>{t('tree.expandAll')}</button>
			<button type="button" class="tool" onclick={collapseAll}>{t('tree.collapseAll')}</button>
			<button type="button" class="tool" onclick={fit}>{t('tree.fit')}</button>
			<span class="zoom">
				<button type="button" class="tool sq" onclick={() => zoomBy(-0.1)} aria-label={t('tree.zoomOut')} title={t('tree.zoomOut')}>−</button>
				<button type="button" class="tool pct" onclick={() => (zoom = 1)} title={t('tree.zoomReset')}>{Math.round(zoom * 100)}%</button>
				<button type="button" class="tool sq" onclick={() => zoomBy(0.1)} aria-label={t('tree.zoomIn')} title={t('tree.zoomIn')}>+</button>
			</span>
		</div>
	</div>

	<div class="scroll" bind:this={scroller}>
		<div class="canvas" style="--leaves: {width}; --lane: {LANE}px; zoom: {zoom}">
			<TreeBranch {item} {statuses} {base} depth={0} {collapsed} {leaves} {toggle} />
		</div>
	</div>
	<p class="hint">{t('tree.hint')}</p>
</section>

<style>
	.tree {
		font-family: 'Assistant', 'Rubik', 'Segoe UI', system-ui, -apple-system, sans-serif;
		background:
			radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--muted) 22%, transparent) 1px, transparent 0) 0 0 / 22px 22px,
			var(--surface);
		border: 1px solid var(--line);
		border-radius: 16px;
		overflow: hidden;
	}
	.bar {
		display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; justify-content: space-between;
		padding: 10px 14px; border-block-end: 1px solid var(--line);
		background: color-mix(in srgb, var(--surface) 88%, transparent);
	}
	.legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: .78rem; color: var(--muted); }
	.legend li { display: inline-flex; align-items: center; gap: 6px; }
	.dot { width: 9px; height: 9px; border-radius: 3px; background: var(--c); }
	.legend .for { --c: var(--for); }
	.legend .against { --c: var(--against); }
	.legend .for .dot, .legend .against .dot { border-radius: 50%; }
	.tools { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
	.tool {
		font: inherit; font-size: .8rem; font-weight: 600; line-height: 1;
		padding: 7px 11px; min-height: 32px; border-radius: 8px;
		background: var(--surface); color: var(--ink); border: 1px solid var(--line);
	}
	.tool:hover { border-color: var(--muted); }
	.tool:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	.zoom { display: inline-flex; }
	.zoom .tool { border-radius: 0; margin-inline-start: -1px; }
	.zoom .tool:first-child { border-start-start-radius: 8px; border-end-start-radius: 8px; margin: 0; }
	.zoom .tool:last-child { border-start-end-radius: 8px; border-end-end-radius: 8px; }
	.sq { width: 32px; padding-inline: 0; font-size: 1rem; }
	.pct { min-width: 54px; font-variant-numeric: tabular-nums; }
	.scroll { overflow-x: auto; padding: 22px 14px 26px; }
	.canvas { min-width: calc(var(--leaves) * var(--lane)); }
	.hint { margin: 0; padding: 8px 14px; font-size: .75rem; color: var(--muted); border-block-start: 1px solid var(--line); }
	.k-question { --c: var(--question); }
	.k-position { --c: var(--position); }
	.k-argument { --c: var(--argument); }
	.k-evidence { --c: var(--evidence); }
	.k-synthesis { --c: var(--synthesis); }
	.k-document { --c: var(--document); }
</style>
