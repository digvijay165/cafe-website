// Restores a backup made by scripts/backup.js, replacing everything currently in the database.
//   npm run restore -- backups/cafe-2026-10-22T10-00-00-000Z.json --yes
const fs = require('node:fs');
const db = require('../server/db');

// Parents before children, so foreign keys are satisfied on insert.
const TABLES = ['users', 'menu_items', 'opening_hours', 'orders', 'order_items', 'page_views', 'error_reports'];
const SEQUENCES = [['menu_items', 'id'], ['orders', 'number'], ['order_items', 'id'], ['page_views', 'id'], ['error_reports', 'id']];

async function main() {
  const [file, confirm] = process.argv.slice(2);
  if (!file || confirm !== '--yes') throw new Error('Usage: npm run restore -- <backup.json> --yes   (this replaces all current data)');
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  await db.connect();
  await db.asUser({ id: '00000000-0000-0000-0000-000000000000', role: 'staff' }, async q => {
    for (const table of [...TABLES].reverse()) await q(`delete from ${table}`);
    await q('delete from sessions');
    await q('delete from auth_tokens');
    for (const table of TABLES) {
      for (const row of backup.tables[table] || []) {
        const columns = Object.keys(row);
        await q(`insert into ${table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`, columns.map(c => row[c]));
      }
    }
  });
  // Sequence changes need the table owner, not the restricted role used above.
  for (const [table, column] of SEQUENCES) {
    await db.query(`select setval(pg_get_serial_sequence('${table}', '${column}'), coalesce((select max(${column}) from ${table}), 0) + 1, false)`);
  }
  console.log(`Restored ${file}. Everyone will need to log in again.`);
  await db.close();
}

main().catch(async error => {
  console.error('Restore failed:', error.message);
  await db.close().catch(() => {});
  process.exit(1);
});
