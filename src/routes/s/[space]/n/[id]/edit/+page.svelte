<script lang="ts">
	import { useI18n } from '$lib/i18n';
	import KindBadge from '$lib/components/KindBadge.svelte';
	let { data, form } = $props();
	const i18n = useI18n();
	const t = (k: string, p?: Record<string, string | number>) => i18n.t(k, p);
	const back = $derived(`/s/${data.space.slug}/n/${data.node.id}`);
</script>

<nav class="muted small"><a href={back}>← {t('edit.cancel')}</a></nav>

<div class="layout">
	{#if data.isAuthor}
		<section class="card stack">
			<h1><KindBadge kind={data.node.kind} /> {t('edit.title')}</h1>
			<form method="POST" class="stack">
				<div>
					<label for="t">{t('add.claim')}</label>
					<input id="t" name="title" required maxlength="300" value={data.node.title} />
				</div>
				<div>
					<label for="b">{t('add.body')}</label>
					<textarea id="b" name="body" rows="8">{data.node.body}</textarea>
				</div>
				<div>
					<label for="s">{t('add.source')}</label>
					<input id="s" name="source" dir="ltr" value={data.node.source ?? ''} />
				</div>
				{#if form?.error}<p class="error">{t(`error.${form.error}`)}</p>{/if}
				<button type="submit">{t('edit.submit')}</button>
			</form>
		</section>
	{:else}
		<p class="card muted">{t('error.authorOnly')}</p>
	{/if}

	<section class="stack">
		<h2>{t('node.history')}</h2>
		{#each data.revisions as r (r.rev)}
			<div class="card stack">
				<div class="muted small">{t('node.rev', { rev: r.rev })} · {r.authorName} · {new Date(r.createdAt).toLocaleString(i18n.locale)}</div>
				<strong>{r.title}</strong>
				{#if r.body}<pre class="body small">{r.body}</pre>{/if}
			</div>
		{/each}
	</section>
</div>

<style>
	.layout { display: grid; gap: 24px; grid-template-columns: 1fr; margin-block-start: 12px; }
	@media (min-width: 860px) { .layout { grid-template-columns: 1fr 1fr; } }
	h1 { font-size: 1.3rem; display: flex; gap: 8px; align-items: center; }
</style>
