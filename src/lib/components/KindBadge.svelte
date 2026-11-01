<script lang="ts">
	import type { NodeKind } from '$lib/model/types';
	import { useI18n } from '$lib/i18n';
	let { kind }: { kind: NodeKind } = $props();
	const i18n = useI18n();
</script>

<span class="badge" style="--c: var(--{kind})">{i18n.t(`kind.${kind}`)}</span>

<style>
	.badge {
		display: inline-block; font-size: .75rem; font-weight: 700; letter-spacing: .02em;
		padding: 1px 8px; border-radius: 999px; color: var(--c); border: 1px solid var(--c);
		white-space: nowrap; font-family: system-ui, sans-serif;
	}
</style>
