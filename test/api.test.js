// End-to-end API tests against an in-memory Postgres (PGlite). Emails are captured from the log.
process.env.DATABASE_URL = 'memory://';
process.env.STAFF_EMAILS = 'staff@example.com';
// Each simulated person gets their own IP (via X-Forwarded-For) so per-IP rate limits do not collide.
process.env.TRUST_PROXY = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/db');
const hours = require('../server/hours');
const { createApp } = require('../server/app');

let base, server;
const mail = [];
const log = console.log;

test.before(async () => {
  console.log = (...args) => (String(args[0]).startsWith('[mail]') ? mail.push(args.join(' ')) : log(...args));
  await db.connect();
  // Open every day, all day, so ordering tests do not depend on when they run.
  await db.query('delete from opening_hours');
  for (let day = 0; day < 7; day += 1) await db.query("insert into opening_hours values ($1, '00:00', '23:59')", [day]);
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}`;
});

test.after(async () => {
  console.log = log;
  server.close();
  await db.close();
});

// A tiny cookie-keeping client, one per simulated person.
let clients = 0;
function client() {
  let cookie = '';
  const ip = `10.0.0.${++clients}`;
  return async (method, path, body) => {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const set = response.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
}

const lastLink = kind => mail.filter(line => line.includes(kind)).at(-1).match(/token=([a-f0-9]{64})/)[1];

async function verifiedCustomer(email) {
  const api = client();
  const signup = await api('POST', '/api/auth/signup', { name: 'Test Person', email, password: 'correct horse', acceptTerms: true });
  assert.equal(signup.status, 201);
  const verify = await api('POST', '/api/auth/verify', { token: lastLink('verify-email') });
  assert.equal(verify.body.user.emailVerified, true);
  return api;
}

async function placeOrder(api) {
  const { body: { items } } = await api('GET', '/api/menu');
  const { body: { slots } } = await api('GET', '/api/pickup-slots');
  return api('POST', '/api/orders', { items: [{ id: items[0].id, quantity: 2 }, { id: items[1].id, quantity: 1 }], pickupAt: slots[0].at, notes: 'Oat milk please' });
}

test('menu, info and health are public', async () => {
  const api = client();
  const menu = await api('GET', '/api/menu');
  assert.ok(menu.body.items.length >= 10);
  const info = await api('GET', '/api/info');
  assert.equal(info.body.hours.week.length, 7);
  assert.equal((await api('GET', '/api/health')).body.ok, true);
});

test('signup validates fields and rejects duplicates', async () => {
  const api = client();
  const bad = await api('POST', '/api/auth/signup', { name: 'A', email: 'nope', password: 'short' });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ['acceptTerms', 'email', 'name', 'password']);
  await verifiedCustomer('dup@example.com');
  const dup = await client()('POST', '/api/auth/signup', { name: 'Again', email: 'DUP@example.com', password: 'another pass', acceptTerms: true });
  assert.equal(dup.status, 409);
});

test('ordering needs a verified email, then uses server prices', async () => {
  const api = client();
  await api('POST', '/api/auth/signup', { name: 'Unverified', email: 'unverified@example.com', password: 'password123', acceptTerms: true });
  const blocked = await placeOrder(api);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'unverified');

  const customer = await verifiedCustomer('buyer@example.com');
  const { body: { items } } = await customer('GET', '/api/menu');
  const placed = await placeOrder(customer);
  assert.equal(placed.status, 201);
  assert.equal(placed.body.order.totalCents, items[0].priceCents * 2 + items[1].priceCents);
  assert.equal(placed.body.order.items.length, 2);
  assert.ok(mail.some(line => line.includes(`Order #${placed.body.order.number} confirmed`)));

  const bad = await customer('POST', '/api/orders', { items: [{ id: items[0].id, quantity: 1 }], pickupAt: '2001-01-01T00:00:00.000Z' });
  assert.equal(bad.status, 400);
});

test('row level security keeps orders private', async () => {
  const alice = await verifiedCustomer('alice@example.com');
  const bob = await verifiedCustomer('bob@example.com');
  const { body: { order } } = await placeOrder(alice);
  assert.equal((await bob('GET', `/api/orders/${order.id}`)).status, 404);
  assert.equal((await bob('GET', '/api/orders')).body.orders.length, 0);
  assert.equal((await bob('POST', `/api/orders/${order.id}/cancel`)).status, 409);
  assert.equal((await alice('GET', '/api/orders')).body.orders.length, 1);

  // At the database level, queries with no WHERE clause still cannot see or change Alice's order.
  const { rows: [bobUser] } = await db.query("select * from users where email = 'bob@example.com'");
  const seen = await db.asUser(bobUser, q => q('select * from orders'));
  assert.equal(seen.rows.length, 0);
  const changed = await db.asUser(bobUser, q => q("update orders set status = 'cancelled'"));
  assert.equal(changed.affectedRows ?? changed.rowCount, 0);
  const items = await db.asUser(bobUser, q => q('select * from order_items'));
  assert.equal(items.rows.length, 0);
});

test('staff can see and move orders; customers cannot reach staff routes', async () => {
  const customer = await verifiedCustomer('regular@example.com');
  const { body: { order } } = await placeOrder(customer);
  assert.equal((await customer('GET', '/api/staff/orders')).status, 403);
  const staff = await verifiedCustomer('staff@example.com');
  const list = await staff('GET', '/api/staff/orders');
  assert.ok(list.body.orders.some(o => o.id === order.id));
  const moved = await staff('PATCH', `/api/staff/orders/${order.id}`, { status: 'preparing' });
  assert.equal(moved.body.order.status, 'preparing');
  assert.equal((await customer('POST', `/api/orders/${order.id}/cancel`)).status, 409);
  const stats = await staff('GET', '/api/staff/stats');
  assert.equal(stats.status, 200);
});

test('password reset signs out other sessions and lets the new password in', async () => {
  const first = await verifiedCustomer('forgetful@example.com');
  const anon = client();
  assert.equal((await anon('POST', '/api/auth/forgot', { email: 'forgetful@example.com' })).status, 200);
  assert.equal((await anon('POST', '/api/auth/forgot', { email: 'nobody@example.com' })).status, 200);
  const reset = await anon('POST', '/api/auth/reset', { token: lastLink('reset-password'), password: 'brand new pass' });
  assert.equal(reset.status, 200);
  assert.equal((await first('GET', '/api/auth/me')).body.user, null);
  const login = await client()('POST', '/api/auth/login', { email: 'forgetful@example.com', password: 'brand new pass' });
  assert.equal(login.status, 200);
  const reuse = await anon('POST', '/api/auth/reset', { token: lastLink('reset-password'), password: 'another one' });
  assert.equal(reuse.status, 400);
});

test('login locks an account after repeated failures', async () => {
  await verifiedCustomer('locked@example.com');
  const api = client();
  for (let i = 0; i < 5; i += 1) assert.equal((await api('POST', '/api/auth/login', { email: 'locked@example.com', password: 'wrong wrong' })).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { email: 'locked@example.com', password: 'correct horse' })).status, 429);
});

test('deleting an account removes it and its orders', async () => {
  const api = await verifiedCustomer('leaving@example.com');
  await placeOrder(api);
  assert.equal((await api('DELETE', '/api/account', { password: 'nope nope' })).status, 400);
  assert.equal((await api('DELETE', '/api/account', { password: 'correct horse' })).status, 200);
  assert.equal((await api('GET', '/api/auth/me')).body.user, null);
  const { rows } = await db.query("select count(*)::int as n from users where email = 'leaving@example.com'");
  assert.equal(rows[0].n, 0);
});

test('cross-site posts are refused', async () => {
  const response = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Origin: 'https://evil.example' } });
  assert.equal(response.status, 403);
});

test('pickup slots respect the café time zone', () => {
  const rows = [{ day_of_week: 4, opens: '08:00', closes: '10:00' }];
  // Thursday 22 Oct 2026, 08:20 in Kolkata (02:50 UTC).
  const now = new Date('2026-10-22T02:50:00Z');
  const slots = hours.pickupSlots(rows, now, 'Asia/Kolkata');
  assert.equal(slots[0].time, '08:45');
  assert.equal(slots[0].day, 'Today');
  assert.equal(slots[0].at, '2026-10-22T03:15:00.000Z');
  assert.equal(slots.at(-1).time, '09:45');
  assert.equal(slots.find(slot => slot.day !== 'Today').day, 'Thursday');
  const state = hours.status(rows, now, 'Asia/Kolkata');
  assert.equal(state.openNow, true);
  assert.equal(state.closesAt, '10:00');
});
