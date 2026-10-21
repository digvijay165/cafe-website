// Database access. In production DATABASE_URL points at PostgreSQL and queries go through a `pg`
// pool. Without it the app runs on PGlite, a real Postgres compiled to WebAssembly that stores its
// files in ./data/pgdata, so local development needs no database server and row level security,
// SQL and constraints behave exactly as they will in production. DATABASE_URL=memory:// gives a
// throwaway in-memory database (used by the tests).
const fs = require('node:fs');
const path = require('node:path');
const seed = require('./seed');

const SCHEMA = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

class PgDriver {
  constructor(url) {
    const { Pool } = require('pg');
    this.kind = 'postgres';
    this.pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_SIZE || 10) });
  }
  query(sql, params) { return this.pool.query(sql, params); }
  exec(sql) { return this.pool.query(sql); }
  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await fn((sql, params) => client.query(sql, params));
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  close() { return this.pool.end(); }
}

class PgliteDriver {
  constructor(db, kind) { this.db = db; this.kind = kind; }
  static async open(dataDir) {
    const { PGlite } = await import('@electric-sql/pglite');
    if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
    const db = dataDir ? await PGlite.create(dataDir) : await PGlite.create();
    return new PgliteDriver(db, dataDir ? 'pglite' : 'memory');
  }
  query(sql, params) { return this.db.query(sql, params); }
  exec(sql) { return this.db.exec(sql); }
  transaction(fn) { return this.db.transaction(tx => fn((sql, params) => tx.query(sql, params))); }
  close() { return this.db.close(); }
}

let driver = null;

async function connect(url = process.env.DATABASE_URL) {
  if (url && url.startsWith('postgres')) driver = new PgDriver(url);
  else if (url === 'memory://') driver = await PgliteDriver.open(null);
  else driver = await PgliteDriver.open(process.env.PGLITE_DIR || path.join(__dirname, '..', 'data', 'pgdata'));
  await driver.exec(SCHEMA);
  await createAppRole();
  await seed(driver);
  await require('./settings').load(driver);
  return driver;
}

// Superusers skip row level security even when it is forced, and PGlite (and some hosted
// databases) connect as one. So user-scoped transactions switch to cafe_app, a plain role that can
// use the tables but is always subject to the policies.
let appRole = false;
async function createAppRole() {
  try {
    await driver.exec(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'cafe_app') then create role cafe_app nologin; end if;
      end $$;
      grant usage on schema public to cafe_app;
      grant select, insert, update, delete on all tables in schema public to cafe_app;
      grant usage, select on all sequences in schema public to cafe_app;
      grant cafe_app to current_user;
    `);
    appRole = true;
  } catch (error) {
    console.warn(`[db] Could not set up the cafe_app role (${error.message}). Row level security relies on FORCE alone, so do not connect as a superuser.`);
  }
}

function query(sql, params) {
  return driver.query(sql, params);
}

// Runs fn inside a transaction with the row level security context set to this user. Every query
// on orders or order_items must go through here; outside it the policies match no rows at all.
function asUser(user, fn) {
  return driver.transaction(async q => {
    if (appRole) await q('set local role cafe_app');
    await q("select set_config('app.user_id', $1, true), set_config('app.role', $2, true)", [user.id, user.role]);
    return fn(q);
  });
}

module.exports = {
  connect,
  query,
  asUser,
  get kind() { return driver?.kind; },
  ping: () => driver.query('select 1'),
  close: () => driver?.close()
};
