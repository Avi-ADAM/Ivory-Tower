<script lang="ts">
	import type { TreeItem } from '$lib/model/tree';
	import type { NodeStatus } from '$lib/model/status';
	import { useI18n } from '$lib/i18n';
	import KindBadge from './KindBadge.svelte';
	import StatusChips from './StatusChips.svelte';
	import Self from './TreeView.svelte';

	let {
		item,
		statuses,
		base,
		depth = 0
	}: { item: TreeItem; statuses: Record<string, NodeStatus>; base: string; depth?: number } = $props();
	const i18n = useI18n();
	const t = (k: string) => i18n.t(k);
</script>

{#snippet head()}
	<span class="head">
		{#if item.via}
			<span class="rel rel-{item.via.rel}">{t(`rel.${item.via.rel}`)}</span>
		{/if}
		<KindBadge kind={item.node.kind} />
		<a href="{base}/n/{item.node.id}">{item.node.title}</a>
		<StatusChips node={item.node} status={statuses[item.node.id]} />
		{#if item.stale}<span class="stale" title={t('node.stale')}>⟳</span>{/if}
		{#if item.repeat}<span class="muted small" title={t('node.repeat')}>↺</span>{/if}
	</span>
{/snippet}

{#if item.children.length > 0}
	<details open={depth < 3} class="t">
		<summary>{@render head()}</summary>
		<ul>
			{#each item.children as child (child.via?.id)}
				<li><Self item={child} {statuses} {base} depth={depth + 1} /></li>
			{/each}
		</ul>
	</details>
{:else}
	<div class="t leaf">{@render head()}</div>
{/if}

<style>
	ul { list-style: none; margin: 0; padding-inline-start: 18px; border-inline-start: 1px dashed var(--line); }
	li { margin-block: 4px; }
	.leaf { padding-inline-start: 16px; }
	.head { display: inline-flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
	.head a { text-decoration: none; }
	.head a:hover { text-decoration: underline; }
	.rel { font-size: .72rem; font-family: system-ui, sans-serif; color: var(--muted); }
	.rel-supports { color: var(--for); font-weight: 700; }
	.rel-opposes { color: var(--against); font-weight: 700; }
	.stale { color: var(--warn); }
</style>
