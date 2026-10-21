// Writes every table to backups/cafe-<timestamp>.json. Works with both PostgreSQL and the local
// PGlite database, so it doubles as a way to move data between them. For large production databases
// prefer `pg_dump` (see the README); this is the simple, always-available option.
const fs = require('node:fs');
const path = require('node:path');
const db = require('../server/db');

const TABLES = ['users', 'menu_items', 'opening_hours', 'orders', 'order_items', 'page_views', 'error_reports'];

async function main() {
  await db.connect();
  const backup = { createdAt: new Date().toISOString(), tables: {} };
  // Orders are protected by row level security, so read them with the staff context.
  await db.asUser({ id: '00000000-0000-0000-0000-000000000000', role: 'staff' }, async q => {
    for (const table of TABLES) backup.tables[table] = (await q(`select * from ${table}`)).rows;
  });
  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `cafe-${backup.createdAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(backup));
  console.log(`Backed up ${TABLES.map(t => `${backup.tables[t].length} ${t}`).join(', ')} to ${file}`);
  await db.close();
}

main().catch(async error => {
  console.error('Backup failed:', error.message);
  await db.close().catch(() => {});
  process.exit(1);
});
