import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * The adapter follows the platform: Vercel sets VERCEL=1 during its build;
 * everywhere else (Docker, a VM, `node build`) it is adapter-node.
 * ADAPTER=node|vercel forces one.
 */
const target = process.env.ADAPTER ?? (process.env.VERCEL ? 'vercel' : 'node');

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		adapter: target === 'vercel' ? adapterVercel({ runtime: 'nodejs22.x' }) : adapterNode()
	}
};
