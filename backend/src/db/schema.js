/**
 * db/schema.js
 *
 * Dual-mode database layer:
 *   - DATABASE_URL set → PostgreSQL (via pg pool)
 *   - DATABASE_URL unset → SQLite (via better-sqlite3, for local dev)
 *
 * Schema is managed by the migration runner (backend/migrate.js).
 * On startup this module runs all pending migrations automatically.
 *
 * Exports a unified db object:
 *   db.query(sql, params) → Promise<{ rows, rowCount }>
 *   db.isPostgres         → boolean
 */

const USE_POSTGRES = !!process.env.DATABASE_URL;

if (USE_POSTGRES) {
  const pg = require('./postgres');

  // Run migrations on startup then export the pool
  const { runMigrations } = require('./migrationRunner');
  runMigrations(pg).catch(err => {
    console.error('[DB] Migration failed:', err.message);
    process.exit(1);
  });

  module.exports = pg;

} else {
  const Database = require('better-sqlite3');
  const path     = require('path');

  let sqlite;
  try {
    sqlite = new Database(path.join(__dirname, '../../market.db'));
  } catch (err) {
    console.error('[DB] Failed to open SQLite database:', err.message);
    process.exit(1);
  }

  // Build a SQLite adapter compatible with the migration runner
  const sqliteAdapter = {
    async query(sql, params = []) {
      let i = 0;
      const text = sql.replace(/\$\d+/g, () => { i++; return '?'; });
      if (/^\s*(SELECT|WITH)/i.test(text)) {
        const rows = sqlite.prepare(text).all(...params);
        return { rows, rowCount: rows.length };
      }
      const info = sqlite.prepare(text).run(...params);
      const returning = sql.match(/RETURNING\s+(\w+)/i);
      const rows = returning ? [{ [returning[1]]: info.lastInsertRowid }] : [];
      return { rows, rowCount: info.changes };
    },
    async exec(sql) { sqlite.exec(sql); },
    isPostgres: false,
    placeholder: () => '?',
  };

  // Run migrations synchronously at startup (SQLite is sync-friendly)
  const { runMigrations } = require('./migrationRunner');
  runMigrations(sqliteAdapter).catch(err => {
    console.error('[DB] Migration failed:', err.message);
    process.exit(1);
  });

  // Expose pg-compatible async query() on the sqlite instance
  sqlite.query     = sqliteAdapter.query;
  sqlite.isPostgres = false;

  module.exports = sqlite;
}
