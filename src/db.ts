import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Managed Postgres providers (Railway included) require TLS on external
// connections but not on the private/local network, so only turn it on for
// non-local hosts.
const isLocalHost = /localhost|127\.0\.0\.1/.test(DATABASE_URL);

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isLocalHost ? false : { rejectUnauthorized: false },
});

// pg.Pool emits 'error' on an idle client that hits a connection-level
// problem (e.g. the DB restarting). Without a listener, that error event
// crashes the whole Node process, so this just logs it — in-flight queries
// on other clients fail and surface through the normal query rejection path.
pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client:", err);
});

// Matches the ISO-8601-with-milliseconds format `new Date().toISOString()`
// produces, so rows written by the app and rows written via a column
// DEFAULT look identical.
const CREATED_AT_DEFAULT = `to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('EXAM_BOARD','PRESS','DISTRIBUTION_CENTER','INVIGILATOR')),
      created_at TEXT NOT NULL DEFAULT ${CREATED_AT_DEFAULT}
    );

    CREATE TABLE IF NOT EXISTS exam_papers (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      exam_datetime TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CREATED',
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${CREATED_AT_DEFAULT},
      ciphertext TEXT,
      iv TEXT,
      auth_tag TEXT,
      is_encrypted INTEGER NOT NULL DEFAULT 0,
      center_code TEXT,
      center_code_used INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS custody_events (
      id SERIAL PRIMARY KEY,
      paper_id INTEGER NOT NULL REFERENCES exam_papers(id),
      event_type TEXT NOT NULL,
      actor_id INTEGER NOT NULL REFERENCES users(id),
      actor_role TEXT NOT NULL,
      prev_hash TEXT,
      hash TEXT NOT NULL,
      metadata TEXT,
      is_flagged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ${CREATED_AT_DEFAULT}
    );
  `);

  // Migration safety net for exam_papers tables created before the
  // encrypted-storage columns existed (CREATE TABLE IF NOT EXISTS above is a
  // no-op against an already-existing table).
  await pool.query(`
    ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS ciphertext TEXT;
    ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS iv TEXT;
    ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS auth_tag TEXT;
    ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS is_encrypted INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS center_code TEXT;
    ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS center_code_used INTEGER NOT NULL DEFAULT 0;
  `);
}

// Drops every table and recreates them empty. Children are dropped before
// their parents to satisfy the foreign keys. Used only by the demo seed
// script (src/seed.ts) to guarantee a fresh, reproducible database.
export async function resetDatabase(): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS custody_events;
    DROP TABLE IF EXISTS exam_papers;
    DROP TABLE IF EXISTS users;
  `);
  await initSchema();
}
