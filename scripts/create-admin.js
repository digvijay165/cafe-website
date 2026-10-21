// Creates (or updates) an admin account: role staff, email already confirmed. The password is read
// from the ADMIN_PASSWORD environment variable and only its hash is stored, so it never ends up in a
// file. Stop the server first when using the local PGlite database (it allows one process at a time).
//
//   ADMIN_NAME="Your Name" ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npm run admin:create
const db = require('../server/db');
const auth = require('../server/auth');

async function main() {
  const name = (process.env.ADMIN_NAME || '').trim();
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (name.length < 2 || !email.includes('@') || password.length < 8) {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (at least 8 characters).');
  }
  await db.connect();
  const { salt, hash } = auth.hashPassword(password);
  const { rows: [user] } = await db.query(
    `insert into users (name, email, password_hash, password_salt, role, email_verified_at, onboarded_at)
     values ($1, $2, $3, $4, 'staff', now(), now())
     on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash,
       password_salt = excluded.password_salt, role = 'staff', email_verified_at = coalesce(users.email_verified_at, now())
     returning id, (xmax = 0) as created`,
    [name, email, hash, salt]
  );
  // A new password signs out any existing sessions for this account.
  await db.query('delete from sessions where user_id = $1', [user.id]);
  console.log(`${user.created ? 'Created' : 'Updated'} admin account for ${email}.`);
  await db.close();
}

main().catch(async error => {
  console.error(error.message);
  await db.close().catch(() => {});
  process.exit(1);
});
