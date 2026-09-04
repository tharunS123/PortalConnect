import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './client.js';
import { getDb } from './client.js';
import { logger } from '../lib/logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Migrations live next to this file as `NNN_name.sql` and run in filename order.
 * Applied filenames are recorded so each migration runs exactly once.
 */
function migrationsDir(): string {
  const local = path.join(here, 'migrations');
  if (fs.existsSync(local)) return local;
  // When compiled to `dist/`, the .sql files stay in the source tree.
  return path.resolve(here, '../../src/db/migrations');
}

export function runMigrations(db: Db = getDb()): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db
      .prepare<[], { name: string }>('SELECT name FROM schema_migrations')
      .all()
      .map((row) => row.name),
  );

  const dir = migrationsDir();
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const executed: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');

    // Each migration is atomic: a failure part-way leaves the schema untouched.
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    })();

    executed.push(file);
  }

  return executed;
}

// Allow `tsx src/db/migrate.ts` as a standalone command.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const executed = runMigrations();
  if (executed.length === 0) {
    logger.info('No pending migrations — schema is up to date.');
  } else {
    logger.info({ migrations: executed }, `Applied ${executed.length} migration(s).`);
  }
}
