<script lang="ts">
	import '../app.css';
	import { setI18n, translator } from '$lib/i18n';
	import { page } from '$app/state';

	let { data, children } = $props();
	setI18n(() => data.locale);
	const t = $derived(translator(data.locale));
</script>

<svelte:head>
	<title>{t('app.name')}</title>
	<meta name="description" content={t('app.tagline')} />
</svelte:head>

<header class="top">
	<div class="wrap row bar">
		<a class="brand" href="/">
			<img src="/favicon.svg" alt="" width="28" height="28" />
			<span>{t('app.name')}</span>
		</a>
		<nav class="row">
			<form method="POST" action="/lang">
				<input type="hidden" name="to" value={data.locale === 'he' ? 'en' : 'he'} />
				<input type="hidden" name="back" value={page.url.pathname + page.url.search} />
				<button class="ghost chip" type="submit">{t('nav.language')}</button>
			</form>
			{#if data.user}
				<span class="muted small">{t('nav.hello', { name: data.user.name })}</span>
				<form method="POST" action="/login?/logout">
					<button class="ghost chip" type="submit">{t('nav.signOut')}</button>
				</form>
			{:else}
				<a class="btn ghost chip" href="/login?back={encodeURIComponent(page.url.pathname)}">{t('nav.signIn')}</a>
			{/if}
		</nav>
	</div>
</header>

<main class="wrap">
	{@render children()}
</main>

<footer class="wrap muted small foot">
	{t('app.license', { license: 'CC BY-SA 4.0' })}
</footer>

<style>
	.top { border-block-end: 1px solid var(--line); background: var(--surface); margin-block-end: 24px; }
	.bar { justify-content: space-between; padding-block: 10px; }
	.brand { display: flex; align-items: center; gap: 8px; text-decoration: none; font-size: 1.25rem; font-weight: 700; }
	.foot { padding-block: 32px; }
	a.chip { padding: 3px 10px; font-size: .875rem; }
</style>
