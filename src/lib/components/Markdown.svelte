<script lang="ts">
	import { renderMarkdown } from '$lib/text/markdown';
	let { text }: { text: string } = $props();
</script>

<!-- renderMarkdown escapes every character of user text; see src/lib/text/markdown.ts -->
<div class="md">{@html renderMarkdown(text)}</div>

<style>
	.md :global(p) { margin: 0 0 .6em; }
	.md :global(p:last-child) { margin-block-end: 0; }
	.md :global(h3), .md :global(h4) { margin: .8em 0 .3em; }
	.md :global(ul), .md :global(ol) { margin: 0 0 .6em; padding-inline-start: 1.4em; }
	.md :global(blockquote) { margin: 0 0 .6em; padding-inline-start: 12px; border-inline-start: 3px solid var(--line); color: var(--muted); }
	.md :global(code) { font-size: .9em; background: var(--bg); padding: 0 4px; border-radius: 4px; }
</style>
