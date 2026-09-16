import path from "path";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(process.cwd(), "secureexam.sqlite");

export const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('EXAM_BOARD','PRESS','DISTRIBUTION_CENTER','INVIGILATOR')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS exam_papers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      exam_datetime TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CREATED',
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ciphertext TEXT,
      iv TEXT,
      auth_tag TEXT,
      is_encrypted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS custody_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL REFERENCES exam_papers(id),
      event_type TEXT NOT NULL,
      actor_id INTEGER NOT NULL REFERENCES users(id),
      actor_role TEXT NOT NULL,
      prev_hash TEXT,
      hash TEXT NOT NULL,
      metadata TEXT,
      is_flagged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  // Migration safety net for exam_papers.sqlite files created before the
  // encrypted-storage columns existed (CREATE TABLE IF NOT EXISTS above is a
  // no-op against an already-existing table).
  const existingColumns = new Set(
    (db.prepare("PRAGMA table_info(exam_papers)").all() as { name: string }[]).map(
      (col) => col.name
    )
  );
  const missingColumns: [string, string][] = [
    ["ciphertext", "TEXT"],
    ["iv", "TEXT"],
    ["auth_tag", "TEXT"],
    ["is_encrypted", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [column, definition] of missingColumns) {
    if (!existingColumns.has(column)) {
      db.exec(`ALTER TABLE exam_papers ADD COLUMN ${column} ${definition}`);
    }
  }
}

// Run eagerly, as part of this module's own evaluation: any module that
// imports { db } (e.g. chain.ts, which prepares statements against these
// tables at its own top level) is guaranteed by ES module load order to
// see this module fully evaluated first, so the tables always exist by
// the time such top-level prepare() calls run.
initSchema();
