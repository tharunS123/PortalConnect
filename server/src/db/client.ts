import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config/env.js';

export type Db = Database.Database;

let instance: Db | null = null;

function configure(db: Db): Db {
  // WAL lets readers proceed during writes — important once more than one
  // request touches the database concurrently.
  db.pragma('journal_mode = WAL');
  // Without this, SQLite silently ignores every REFERENCES clause.
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  return db;
}

/** Open (or reuse) the process-wide database connection. */
export function getDb(): Db {
  if (instance) return instance;

  fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });
  instance = configure(new Database(env.databasePath));
  return instance;
}

/** An isolated in-memory database, used by the test suite. */
export function createInMemoryDb(): Db {
  return configure(new Database(':memory:'));
}

export function setDb(db: Db): void {
  instance = db;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}
