<script lang="ts">
	import { useI18n } from '$lib/i18n';
	let { data, form } = $props();
	const i18n = useI18n();
	const t = (k: string, p?: Record<string, string | number>) => i18n.t(k, p);
	let rikma = $state('');
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
				<strong>{s.title}{#if s.visibility === 'members'} <span class="lock" title={t('spaces.membersBadge')}>🔒</span>{/if}</strong>
				{#if s.ownerRikmaName}<span class="small held">{t('space.heldBy', { name: s.ownerRikmaName })}</span>{/if}
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
				{#if data.bridge && data.rikmas.length}
					<div>
						<label for="rikma">{t('spaces.rikma')}</label>
						<select id="rikma" name="rikma" bind:value={rikma}>
							<option value="">{t('spaces.noRikma')}</option>
							{#each data.rikmas as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
						</select>
					</div>
					{#if rikma}
						<fieldset class="vis">
							<legend>{t('spaces.visibility')}</legend>
							<label class="opt"><input type="radio" name="visibility" value="public" checked /> {t('spaces.public')}</label>
							<label class="opt"><input type="radio" name="visibility" value="members" /> {t('spaces.members')}</label>
						</fieldset>
					{/if}
				{/if}
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
	.held { color: var(--synthesis); }
	.lock { font-size: .85em; }
	.vis { border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; }
	.vis legend { color: var(--muted); font-size: .9rem; padding: 0 4px; }
	.opt { display: flex; gap: 8px; align-items: center; color: var(--ink); margin: 4px 0; }
</style>
