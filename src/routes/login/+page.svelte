<script lang="ts">
	import { useI18n } from '$lib/i18n';
	let { form } = $props();
	const i18n = useI18n();
	const t = (k: string, p?: Record<string, string | number>) => i18n.t(k, p);
</script>

<section class="card stack narrow">
	<h1>{t('login.title')}</h1>
	<p class="muted">{t('login.lead')}</p>
	<form method="POST" action="?/signin" class="stack">
		<div>
			<label for="name">{t('login.name')}</label>
			<input id="name" name="name" required maxlength="80" autocomplete="nickname" />
		</div>
		{#if form?.error}<p class="error">{t(`error.${form.error}`)}</p>{/if}
		<button type="submit">{t('login.submit')}</button>
	</form>
</section>

<style>
	.narrow { max-width: 440px; margin-inline: auto; }
</style>
