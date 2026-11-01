<script lang="ts">
	import { useI18n } from '$lib/i18n';
	import KindBadge from '$lib/components/KindBadge.svelte';
	import StatusChips from '$lib/components/StatusChips.svelte';
	import TreeView from '$lib/components/TreeView.svelte';
	import { INQUIRY_STATUSES, STANCE_VALUES } from '$lib/model/types';

	let { data, form } = $props();
	const i18n = useI18n();
	const t = (k: string, p?: Record<string, string | number>) => i18n.t(k, p);

	const base = $derived(`/s/${data.space.slug}`);
	const node = $derived(data.node);
	const status = $derived(data.statuses[node.id]);
	let what = $state('');
	$effect(() => {
		if (!data.options.some((o) => `${o.kind}:${o.rel}` === what)) {
			what = data.options[0] ? `${data.options[0].kind}:${data.options[0].rel}` : '';
		}
	});
	const addingEvidence = $derived(what.startsWith('evidence:'));
	const positions = $derived(
		data.groups
			.filter((g) => g.rel === 'answers')
			.flatMap((g) => g.items)
			.filter((i) => i.child.kind === 'position' || i.child.kind === 'synthesis')
	);
	const linkRels = $derived([...new Set(data.options.map((o) => o.rel))]);
	let insertOpen = $state<string | null>(null);
</script>

<svelte:head><title>{node.title} · {data.space.title}</title></svelte:head>

<nav class="muted small crumbs">
	<a href="/">{t('nav.home')}</a> › <a href={base}>{data.space.title}</a> ›
</nav>

{#if data.parents.length}
	<div class="parents small">
		<span class="muted">{t('node.respondsTo')}</span>
		{#each data.parents as p (p.edgeId)}
			<a class="parent" href="{base}/n/{p.toId}">
				<span class="rel rel-{p.rel}">{t(`rel.${p.rel}`)}</span>
				<KindBadge kind={p.toKind} />
				{p.toTitle}
				{#if p.stale}<span class="stale" title={t('node.stale')}>⟳ {t('node.stale')}</span>{/if}
			</a>
		{/each}
	</div>
{/if}

<article class="card stack main k-{node.kind}">
	<div class="row">
		<KindBadge kind={node.kind} />
		<StatusChips {node} {status} />
	</div>
	<h1>{node.title}</h1>
	{#if node.body}<pre class="body">{node.body}</pre>{/if}
	{#if node.source}
		<p class="small"><strong>{t('node.source')}:</strong>
			{#if /^https?:\/\//.test(node.source)}<a href={node.source} rel="noopener nofollow" target="_blank" dir="ltr">{node.source}</a>{:else}{node.source}{/if}
		</p>
	{/if}
	{#if status && node.kind !== 'question' && status.status !== 'unchallenged'}
		<p class="small muted">
			{t('status.open', { count: status.openObjections })} · {t('status.met', { count: status.answeredObjections })}
		</p>
	{/if}
	{#if node.inquiryNote}<p class="small inq-note">{t(`inquiry.${node.inquiryStatus}`)}: {node.inquiryNote}</p>{/if}
	{#if node.absorbedInto}
		<p class="small"><a href="{base}/n/{node.absorbedInto}">{t('inquiry.absorbedBadge')} →</a></p>
	{/if}
	<p class="muted small meta">
		{t('node.by', { name: node.authorName ?? '' })}
		{#if node.attributedTo} · {t('node.attributed', { who: node.attributedTo })}{/if}
		· <a href="{base}/n/{node.id}/edit">{t('node.rev', { rev: node.currentRev })}</a>
		· {t('node.permalink')}: <code dir="ltr">{node.id}</code>
	</p>
	<div class="row">
		{#if data.isAuthor}<a class="btn ghost chip" href="{base}/n/{node.id}/edit">{t('node.edit')}</a>{/if}
		{#if data.view === 'tree'}
			<a class="btn ghost chip" href="?">{t('node.listView')}</a>
		{:else}
			<a class="btn ghost chip" href="?view=tree">{t('node.treeView')}</a>
		{/if}
	</div>
</article>

{#if form?.error}<p class="error" role="alert">{t(`error.${form.error}`)}</p>{/if}

<div class="layout">
	<section class="stack">
		{#if data.view === 'tree' && data.tree}
			<div class="card"><TreeView item={data.tree} statuses={data.statuses} {base} /></div>
		{:else}
			{#if data.groups.length === 0}<p class="muted">{t('node.nothingYet')}</p>{/if}
			{#each data.groups as g (g.rel)}
				<div class="group g-{g.rel}">
					<h2 class="gh">{t(`relGroup.${g.rel}`)} <span class="muted small">({g.items.length})</span></h2>
					{#each g.items as it (it.edgeId)}
						<div class="card child k-{it.child.kind}" id="n-{it.child.id}">
							<div class="row">
								<KindBadge kind={it.child.kind} />
								<a class="ct" href="{base}/n/{it.child.id}">{it.child.title}</a>
							</div>
							<div class="row small">
								<StatusChips node={it.child} status={data.statuses[it.child.id]} />
								<span class="muted">{it.child.authorName}{#if it.child.attributedTo} · {it.child.attributedTo}{/if}</span>
								{#if it.stale}<span class="stale" title={t('node.stale')}>⟳</span>{/if}
								{#if it.insert && data.user}
									<button class="ghost chip" type="button" onclick={() => (insertOpen = insertOpen === it.edgeId ? null : it.edgeId)}>
										↧ {t('insert.title')}
									</button>
								{/if}
							</div>
							{#if insertOpen === it.edgeId && it.insert}
								<form method="POST" action="?/insert" class="stack sub">
									<p class="small muted">{t('insert.lead', { from: it.child.title, to: node.title })}</p>
									<input type="hidden" name="edgeId" value={it.edgeId} />
									<div>
										<label for="it-{it.edgeId}">{t('add.claim')} ({t(`kind.${it.insert.middleKind}`)})</label>
										<input id="it-{it.edgeId}" name="title" required maxlength="300" />
									</div>
									<div>
										<label for="ib-{it.edgeId}">{t('add.body')}</label>
										<textarea id="ib-{it.edgeId}" name="body"></textarea>
									</div>
									<div>
										<label for="ir-{it.edgeId}">{t('insert.lowerRel', { from: it.child.title })}</label>
										<select id="ir-{it.edgeId}" name="lowerRel">
											{#each it.insert.lowerRels as r (r)}<option value={r}>{t(`rel.${r}`)}</option>{/each}
										</select>
									</div>
									<button type="submit">{t('insert.submit')}</button>
								</form>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		{/if}

		{#if node.kind === 'question' && positions.length >= 2 && data.user}
			<details class="card">
				<summary><strong>{t('synth.title')}</strong></summary>
				<form method="POST" action="?/synth" class="stack sub">
					<p class="small muted">{t('synth.lead')}</p>
					{#each positions as p (p.edgeId)}
						<label class="check"><input type="checkbox" name="positions" value={p.child.id} /> {p.child.title}</label>
					{/each}
					<div>
						<label for="st">{t('add.claim')}</label>
						<input id="st" name="title" required maxlength="300" />
					</div>
					<div>
						<label for="sb">{t('add.body')}</label>
						<textarea id="sb" name="body"></textarea>
					</div>
					<button type="submit">{t('synth.submit')}</button>
				</form>
			</details>
		{/if}
	</section>

	<aside class="stack">
		<section class="card stack">
			<h2>{t('add.title')}</h2>
			{#if !data.user}
				<p class="muted">{t('add.signIn')}</p>
				<a class="btn" href="/login?back={encodeURIComponent(`${base}/n/${node.id}`)}">{t('nav.signIn')}</a>
			{:else if data.options.length}
				<form method="POST" action="?/add" class="stack">
					<div>
						<label for="what">{t('add.what')}</label>
						<select id="what" name="what" bind:value={what}>
							{#each data.options as o (o.key)}<option value="{o.kind}:{o.rel}">{t(`add.${o.key}`)}</option>{/each}
						</select>
					</div>
					<div>
						<label for="at">{t('add.claim')}</label>
						<input id="at" name="title" required maxlength="300" />
					</div>
					<div>
						<label for="ab">{t('add.body')}</label>
						<textarea id="ab" name="body"></textarea>
					</div>
					{#if addingEvidence}
						<div>
							<label for="as">{t('add.source')}</label>
							<input id="as" name="source" dir="ltr" />
						</div>
					{/if}
					<div>
						<label for="aa">{t('add.attributedTo')}</label>
						<input id="aa" name="attributedTo" />
					</div>
					<button type="submit">{t('add.submit')}</button>
				</form>

				<details>
					<summary class="small">{t('link.title')}</summary>
					<form method="POST" action="?/link" class="stack sub">
						<p class="small muted">{t('link.lead')}</p>
						<div>
							<label for="lf">{t('link.nodeId')}</label>
							<input id="lf" name="from" required dir="ltr" />
						</div>
						<div>
							<label for="lr">{t('link.rel')}</label>
							<select id="lr" name="rel">
								{#each linkRels as r (r)}<option value={r}>{t(`rel.${r}`)}</option>{/each}
							</select>
						</div>
						<button class="ghost" type="submit">{t('link.submit')}</button>
					</form>
				</details>
			{/if}
		</section>

		{#if data.user}
			<section class="card stack">
				<h2>{t('stance.title')}</h2>
				<form method="POST" action="?/stance" class="stack">
					<div class="row">
						{#each STANCE_VALUES as v (v)}
							<button class="chip" name="value" value={v} aria-pressed={data.stances.mine?.value === v}>{t(`stance.${v}`)}</button>
						{/each}
						{#if data.stances.mine}<button class="chip ghost" name="value" value="">{t('stance.clear')}</button>{/if}
					</div>
					<label class="check small"><input type="checkbox" name="public" checked={data.stances.mine?.public ?? false} /> {t('stance.public')}</label>
				</form>
				<p class="muted small">{t('stance.privateNote')}</p>
			</section>
		{/if}

		{#if data.stances.published.length}
			<section class="card stack">
				<h3>{t('stance.published')}</h3>
				<ul class="plain small">
					{#each data.stances.published as s, i (i)}<li>{s.name}: {t(`stance.${s.value}`)}</li>{/each}
				</ul>
			</section>
		{/if}

		{#if node.kind !== 'question'}
			<section class="card stack">
				<h3>{t('inquiry.label')}</h3>
				{#if data.isAuthor}
					<form method="POST" action="?/inquiry" class="stack">
						<select name="status" aria-label={t('inquiry.label')}>
							<option value="">{t('inquiry.none')}</option>
							{#each INQUIRY_STATUSES as s (s)}<option value={s} selected={node.inquiryStatus === s}>{t(`inquiry.${s}`)}</option>{/each}
						</select>
						<div>
							<label for="in">{t('inquiry.note')}</label>
							<textarea id="in" name="note">{node.inquiryNote ?? ''}</textarea>
						</div>
						<div>
							<label for="ia">{t('inquiry.absorbedInto')}</label>
							<input id="ia" name="absorbedInto" value={node.absorbedInto ?? ''} dir="ltr" />
						</div>
						<button class="ghost" type="submit">{t('inquiry.save')}</button>
					</form>
				{:else}
					<p class="small">{node.inquiryStatus ? t(`inquiry.${node.inquiryStatus}`) : t('inquiry.none')}</p>
					<p class="muted small">{t('inquiry.authorOnly')}</p>
				{/if}
			</section>
		{/if}

		<p class="muted small">{t('status.explain')}</p>
	</aside>
</div>

<style>
	.crumbs a { text-decoration: none; }
	.parents { display: flex; flex-direction: column; gap: 4px; margin-block-end: 10px; }
	.parent { text-decoration: none; display: inline-flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
	.main { border-inline-start: 5px solid var(--c, var(--line)); margin-block-end: 20px; }
	.main h1 { font-size: 1.7rem; margin: 0; }
	.meta code { font-size: .75rem; }
	.layout { display: grid; gap: 24px; grid-template-columns: 1fr; }
	@media (min-width: 860px) { .layout { grid-template-columns: 3fr 2fr; } }
	.group { display: flex; flex-direction: column; gap: 8px; margin-block-end: 18px; }
	.gh { font-size: 1.05rem; margin: 0; }
	.g-supports .gh { color: var(--for); }
	.g-opposes .gh { color: var(--against); }
	.child { padding: 10px 12px; border-inline-start: 4px solid var(--c, var(--line)); display: flex; flex-direction: column; gap: 4px; }
	.ct { text-decoration: none; font-weight: 600; }
	.ct:hover { text-decoration: underline; }
	.k-question { --c: var(--question); }
	.k-position { --c: var(--position); }
	.k-argument { --c: var(--argument); }
	.k-evidence { --c: var(--evidence); }
	.k-synthesis { --c: var(--synthesis); }
	.rel { font-size: .75rem; font-family: system-ui, sans-serif; }
	.rel-supports { color: var(--for); font-weight: 700; }
	.rel-opposes { color: var(--against); font-weight: 700; }
	.stale { color: var(--warn); font-size: .8rem; }
	.sub { margin-block-start: 8px; padding-block-start: 8px; border-block-start: 1px dashed var(--line); }
	.check { display: flex; gap: 8px; align-items: center; color: var(--ink); }
	.plain { list-style: none; padding: 0; margin: 0; }
	.inq-note { border-inline-start: 3px solid var(--warn); padding-inline-start: 8px; }
	h2 { font-size: 1.15rem; }
	h3 { font-size: 1rem; margin: 0; }
</style>
