import { describe, expect, it } from 'vitest';
import { isEphemeralDb } from './db';

describe('isEphemeralDb', () => {
	it('only on a serverless platform without a database', () => {
		expect(isEphemeralDb({ VERCEL: '1' })).toBe(true);
		expect(isEphemeralDb({ VERCEL: '1', DATABASE_URL: 'postgres://x' })).toBe(false);
		expect(isEphemeralDb({})).toBe(false);
	});
});
