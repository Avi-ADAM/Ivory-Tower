import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	ssr: { external: ['@electric-sql/pglite'] },
	optimizeDeps: { exclude: ['@electric-sql/pglite'] },
	test: { include: ['src/**/*.test.ts'], environment: 'node' }
});
