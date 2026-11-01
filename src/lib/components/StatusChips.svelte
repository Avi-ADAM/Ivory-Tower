<script lang="ts">
	import type { NodeStatus } from '$lib/model/status';
	import type { GraphNode } from '$lib/model/types';
	import { useI18n } from '$lib/i18n';
	let { node, status }: { node: GraphNode; status?: NodeStatus } = $props();
	const i18n = useI18n();
	const t = (k: string, p?: Record<string, string | number>) => i18n.t(k, p);
	const claim = $derived(node.kind !== 'question');
</script>

<span class="chips">
	{#if status && claim}
		<span class="chip s-{status.status}" title={t('status.explain')}>{t(`status.${status.status}`)}</span>
		{#if !status.supported && node.kind === 'position'}
			<span class="chip s-unsupported" title={t('status.explain')}>{t('status.unsupported')}</span>
		{/if}
	{/if}
	{#if node.inquiryStatus}
		<span class="chip inq inq-{node.inquiryStatus}">{t(`inquiry.${node.inquiryStatus}`)}</span>
	{/if}
	{#if node.absorbedInto}
		<span class="chip inq">{t('inquiry.absorbedBadge')}…</span>
	{/if}
</span>

<style>
	.chips { display: inline-flex; gap: 6px; flex-wrap: wrap; font-family: system-ui, sans-serif; }
	.chip { font-size: .72rem; padding: 1px 7px; border-radius: 6px; background: var(--bg); border: 1px solid var(--line); color: var(--muted); }
	.s-contested { color: var(--against); border-color: var(--against); }
	.s-answered { color: var(--for); border-color: var(--for); }
	.s-unsupported { border-style: dashed; }
	.inq-deadEnd { color: var(--warn); border-color: var(--warn); }
	.inq-concluded { color: var(--synthesis); border-color: var(--synthesis); }
</style>
