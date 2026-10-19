// Applies db/migrations/*.sql in filename order, once each.
// Applied files are recorded in the schema_migrations table, so this is safe to run on every deploy.
// Each migration runs on its own; if one fails, later ones are not attempted and the error is raised.
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

async function runMigrations(conn, { log = console.log } = {}) {
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name        VARCHAR(255) PRIMARY KEY,
    applied_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const [rows] = await conn.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  const ran = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    log(`Applying migration ${file}`);
    await conn.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    ran.push(file);
  }
  if (!ran.length) log('Migrations: up to date');
  return ran;
}

module.exports = { runMigrations, MIGRATIONS_DIR };
