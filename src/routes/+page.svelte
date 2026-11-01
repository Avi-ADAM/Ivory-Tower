<script lang="ts">
	import { useI18n } from '$lib/i18n';
	let { data, form } = $props();
	const i18n = useI18n();
	const t = (k: string, p?: Record<string, string | number>) => i18n.t(k, p);
</script>

<section class="hero stack">
	<h1>{t('app.name')}</h1>
	<p class="lead">{t('app.tagline')}</p>
	<p class="muted">{t('app.intro')}</p>
</section>

<div class="grid">
	<section class="stack">
		<h2>{t('spaces.title')}</h2>
		{#if data.spaces.length === 0}
			<p class="muted">{t('spaces.empty')}</p>
		{/if}
		{#each data.spaces as s (s.id)}
			<a class="card space" href="/s/{s.slug}">
				<strong>{s.title}</strong>
				{#if s.description}<span class="muted">{s.description}</span>{/if}
				<span class="muted small">{t('spaces.nodes', { count: s.nodeCount ?? 0 })}</span>
			</a>
		{/each}
	</section>

	<section class="card stack">
		<h2>{t('spaces.create')}</h2>
		{#if data.user}
			<form method="POST" action="?/createSpace" class="stack">
				<div>
					<label for="title">{t('spaces.spaceTitle')}</label>
					<input id="title" name="title" required />
				</div>
				<div>
					<label for="slug">{t('spaces.slug')}</label>
					<input id="slug" name="slug" required pattern="[a-z0-9][a-z0-9\-]{'{'}1,62{'}'}" dir="ltr" />
				</div>
				<div>
					<label for="description">{t('spaces.description')}</label>
					<textarea id="description" name="description"></textarea>
				</div>
				{#if form?.error}<p class="error">{t(`error.${form.error}`)}</p>{/if}
				<button type="submit">{t('spaces.submit')}</button>
			</form>
		{:else}
			<p class="muted">{t('spaces.signInToCreate')}</p>
			<a class="btn" href="/login">{t('nav.signIn')}</a>
		{/if}
	</section>
</div>

<style>
	.hero { margin-block-end: 32px; max-width: 70ch; }
	.hero h1 { font-size: 2.4rem; }
	.lead { font-size: 1.2rem; margin: 0; }
	.grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
	@media (min-width: 760px) { .grid { grid-template-columns: 3fr 2fr; } }
	.space { display: flex; flex-direction: column; gap: 4px; text-decoration: none; }
	.space:hover { border-color: var(--accent); }
</style>
