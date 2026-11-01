<script lang="ts">
	import { page } from '$app/state';
</script>

<section class="card stack">
	<h1>{page.status}</h1>
	<p class="muted">{page.error?.message}</p>
	<a href="/">←</a>
</section>
