import schemaSql from './schema.sql?raw';

/**
 * The whole app talks to the database through this tiny interface, so the
 * same Postgres SQL runs on an embedded PGlite (no setup) or on a real
 * Postgres when DATABASE_URL is set.
 */
export interface Db {
	query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
	exec(sql: string): Promise<void>;
	transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
	close(): Promise<void>;
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
	const { PGlite } = await import('@electric-sql/pglite');
	const pg = dataDir ? new PGlite(dataDir) : new PGlite();
	await pg.waitReady;
	type Q = { query: typeof pg.query; exec: typeof pg.exec };
	const wrap = (c: Q, inTx: boolean): Db => ({
		query: async (text, params) => (await c.query(text, params)).rows as never,
		exec: async (sql) => void (await c.exec(sql)),
		transaction: inTx
			? (fn) => fn(wrap(c, true))
			: (fn) => pg.transaction((tx) => fn(wrap(tx as unknown as Q, true))),
		close: () => pg.close()
	});
	return wrap(pg, false);
}

export async function createPostgresDb(connectionString: string): Promise<Db> {
	const { default: pg } = await import('pg');
	const pool = new pg.Pool({ connectionString });
	type C = { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> };
	const wrap = (c: C, inTx: boolean): Db => ({
		query: async (text, params) => (await c.query(text, params)).rows as never,
		exec: async (sql) => void (await c.query(sql)),
		transaction: inTx
			? (fn) => fn(wrap(c, true))
			: async (fn) => {
					const client = await pool.connect();
					try {
						await client.query('begin');
						const out = await fn(wrap(client, true));
						await client.query('commit');
						return out;
					} catch (e) {
						await client.query('rollback');
						throw e;
					} finally {
						client.release();
					}
				},
		close: () => pool.end()
	});
	return wrap(pool, false);
}

export async function migrate(db: Db): Promise<void> {
	await db.exec(schemaSql);
}

let shared: Promise<Db> | null = null;

/** The process-wide database, created and migrated on first use. */
export function getDb(): Promise<Db> {
	shared ??= (async () => {
		const url = process.env.DATABASE_URL;
		const db = url ? await createPostgresDb(url) : await createPgliteDb(process.env.DATA_DIR || './data/pglite');
		await migrate(db);
		return db;
	})();
	return shared;
}
