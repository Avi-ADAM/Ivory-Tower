<script lang="ts">
	import { useI18n } from '$lib/i18n';
	import KindBadge from '$lib/components/KindBadge.svelte';
	let { data, form } = $props();
	const i18n = useI18n();
	const t = (k: string, p?: Record<string, string | number>) => i18n.t(k, p);
	const base = $derived(`/s/${data.space.slug}`);
</script>

<svelte:head><title>{data.space.title} · {t('app.name')}</title></svelte:head>

<nav class="muted small crumbs"><a href="/">{t('nav.home')}</a> ›</nav>
<h1>{data.space.title}{#if data.space.visibility === 'members'} <span class="lock" title={t('spaces.membersBadge')}>🔒</span>{/if}</h1>
{#if data.space.ownerRikmaName}<p class="held small">{t('space.heldBy', { name: data.space.ownerRikmaName })}{#if data.space.visibility === 'members'} · {t('spaces.membersBadge')}{:else if data.space.writePolicy === 'members'} · {t('spaces.writeMembersBadge')}{/if}</p>{/if}
{#if data.space.description}<p class="muted desc">{data.space.description}</p>{/if}

<div class="grid">
	<section class="stack">
		<h2>{t('space.questions')}</h2>
		{#if data.roots.length === 0}<p class="muted">{t('space.noQuestions')}</p>{/if}
		{#each data.roots as q (q.id)}
			<a class="card q" href="{base}/n/{q.id}">
				<strong>{q.title}</strong>
				<span class="muted small">{t('space.responses', { count: q.childCount })} · {q.authorName}</span>
			</a>
		{/each}

		<details class="card" open={data.roots.length === 0}>
			<summary><strong>{t('space.newQuestion')}</strong></summary>
			{#if data.canWrite}
				<form method="POST" action="?/addQuestion" class="stack form">
					<div>
						<label for="qt">{t('add.claim')}</label>
						<input id="qt" name="title" required maxlength="300" />
					</div>
					<div>
						<label for="qb">{t('add.body')}</label>
						<textarea id="qb" name="body"></textarea>
					</div>
					<div>
						<label for="qa">{t('add.attributedTo')}</label>
						<input id="qa" name="attributedTo" />
					</div>
					{#if form?.error}<p class="error">{t(`error.${form.error}`)}</p>{/if}
					<button type="submit">{t('add.submit')}</button>
				</form>
			{:else if data.user}
				<p class="muted">{t('space.readOnly', { name: data.space.ownerRikmaName ?? '' })}</p>
			{:else}
				<p class="muted">{t('add.signIn')}</p>
			{/if}
		</details>
	</section>

	<aside class="stack">
		<h2>{t('space.documents')}</h2>
		{#if data.documents.length === 0}<p class="muted small">{t('space.noDocuments')}</p>{/if}
		{#each data.documents as d (d.id)}
			<a class="card dl" href="{base}/n/{d.id}">
				<strong>{d.title}</strong>
				<span class="muted small">{t('space.blocks', { count: d.blockCount })} · {d.authorName}</span>
			</a>
		{/each}
		{#if data.canWrite}
			<details class="card">
				<summary><strong>{t('space.newDocument')}</strong></summary>
				<form method="POST" action="?/addDocument" class="stack form">
					<div>
						<label for="dt">{t('space.docTitle')}</label>
						<input id="dt" name="title" required maxlength="300" />
					</div>
					<div>
						<label for="db">{t('space.docIntro')}</label>
						<textarea id="db" name="body"></textarea>
					</div>
					<button type="submit">{t('add.submit')}</button>
				</form>
			</details>
		{/if}

		<h2>{t('space.recent')}</h2>
		<ul class="recent">
			{#each data.recent as n (n.id)}
				<li><KindBadge kind={n.kind} /> <a href="{base}/n/{n.id}">{n.title}</a></li>
			{/each}
		</ul>
	</aside>
</div>

<style>
	.desc { max-width: 70ch; }
	.held { color: var(--synthesis); margin: -6px 0 8px; }
	.lock { font-size: .7em; }
	.grid { display: grid; gap: 24px; grid-template-columns: 1fr; }
	@media (min-width: 760px) { .grid { grid-template-columns: 2fr 1fr; } }
	.q { display: flex; flex-direction: column; gap: 4px; text-decoration: none; border-inline-start: 4px solid var(--question); }
	.q:hover { border-color: var(--accent); }
	.form { margin-block-start: 12px; }
	.dl { display: flex; flex-direction: column; gap: 4px; text-decoration: none; border-inline-start: 4px solid var(--accent); }
	.dl:hover { border-color: var(--ink); }
	.recent { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
	.recent a { text-decoration: none; }
	.crumbs a { text-decoration: none; }
</style>
