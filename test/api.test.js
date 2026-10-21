// End-to-end API tests against an in-memory Postgres (PGlite). Emails are captured from the log.
process.env.DATABASE_URL = 'memory://';
process.env.STAFF_EMAILS = 'staff@example.com';
process.env.OWNER_EMAILS = 'owner@example.com';
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
  assert.equal((await api('GET', '/api/health')).body.status, 'ok');
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

test('only the owner can edit the menu, hours, details and team', async () => {
  const staff = await verifiedCustomer('staff2@example.com');
  const owner = await verifiedCustomer('owner@example.com');
  assert.equal((await owner('GET', '/api/auth/me')).body.user.role, 'owner');
  const item = { category: 'Specials', name: 'Rose milk', description: 'Chilled, with basil seeds.', priceCents: 15000, tags: ['gluten-free', 'nope'] };

  // Staff and customers are refused.
  assert.equal((await staff('POST', '/api/owner/menu', item)).status, 403);
  assert.equal((await staff('GET', '/api/owner/overview')).status, 403);

  // Validation errors come back per field.
  const bad = await owner('POST', '/api/owner/menu', { name: 'x', category: '', priceCents: -5 });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ['category', 'name', 'priceCents']);

  // Add, edit, reorder and delete an item; the public menu follows.
  const created = await owner('POST', '/api/owner/menu', item);
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.item.tags, ['gluten-free']);
  assert.equal(created.body.item.slug, 'rose-milk');
  const second = await owner('POST', '/api/owner/menu', { ...item, name: 'Rose milk' });
  assert.equal(second.body.item.slug, 'rose-milk-2');
  const edited = await owner('PATCH', `/api/owner/menu/${created.body.item.id}`, { priceCents: 16000, name: 'Rose milk (large)' });
  assert.equal(edited.body.item.priceCents, 16000);
  const moved = await owner('POST', `/api/owner/menu/${second.body.item.id}/move`, { direction: 'up' });
  const specials = moved.body.items.filter(i => i.category === 'Specials').map(i => i.id);
  assert.deepEqual(specials, [second.body.item.id, created.body.item.id]);
  assert.ok((await client()('GET', '/api/menu')).body.items.some(i => i.name === 'Rose milk (large)' && i.priceCents === 16000));
  assert.equal((await owner('DELETE', `/api/owner/menu/${second.body.item.id}`)).status, 200);
  assert.equal((await owner('DELETE', `/api/owner/menu/${second.body.item.id}`)).status, 404);

  // Hours and café details.
  const badHours = await owner('PUT', '/api/owner/hours', { days: [{ day: 1, open: true, opens: '18:00', closes: '09:00' }] });
  assert.equal(badHours.status, 400);
  const hoursBefore = (await owner('GET', '/api/info')).body.hours.week;
  const allDay = Array.from({ length: 7 }, (_, day) => ({ day, open: true, opens: '00:00', closes: '23:59' }));
  assert.equal((await owner('PUT', '/api/owner/hours', { days: allDay.map((d, i) => (i === 1 ? { ...d, open: false } : d)) })).status, 200);
  const week = (await client()('GET', '/api/info')).body.hours.week;
  assert.equal(week[1].opens, null);
  assert.equal(week[2].opens, '00:00');
  await owner('PUT', '/api/owner/hours', { days: allDay });
  assert.equal(hoursBefore.length, 7);

  const badSettings = await owner('PATCH', '/api/owner/settings', { phone: 'call me', latitude: 200 });
  assert.deepEqual(Object.keys(badSettings.body.fields).sort(), ['latitude', 'phone']);
  const saved = await owner('PATCH', '/api/owner/settings', { name: 'Lantern Café Indiranagar', phone: '+91 80 1111 2222' });
  assert.equal(saved.body.settings.name, 'Lantern Café Indiranagar');
  assert.equal((await client()('GET', '/api/info')).body.cafe.phone, '+91 80 1111 2222');
  const { rows } = await db.query("select value from settings where key = 'name'");
  assert.equal(rows[0].value, 'Lantern Café Indiranagar');

  // Team: promote a customer, refuse unknown emails and self-demotion.
  await verifiedCustomer('newhire@example.com');
  const promoted = await owner('POST', '/api/owner/team', { email: 'newhire@example.com', role: 'staff' });
  assert.ok(promoted.body.team.some(member => member.email === 'newhire@example.com' && member.role === 'staff'));
  assert.equal((await owner('POST', '/api/owner/team', { email: 'ghost@example.com', role: 'staff' })).status, 404);
  assert.equal((await owner('POST', '/api/owner/team', { email: 'owner@example.com', role: 'customer' })).status, 400);
});

test('the owner sees every order, sales and customers', async () => {
  const buyer = await verifiedCustomer('regular2@example.com');
  const { body: { order } } = await placeOrder(buyer);
  const owner = client();
  await owner('POST', '/api/auth/login', { email: 'owner@example.com', password: 'correct horse' });
  const orders = await owner('GET', '/api/owner/orders?days=30');
  assert.ok(orders.body.orders.some(o => o.id === order.id && o.customer.email === 'regular2@example.com'));
  const byNumber = await owner('GET', `/api/owner/orders?q=%23${order.number}`);
  assert.deepEqual(byNumber.body.orders.map(o => o.id), [order.id]);
  const overview = await owner('GET', '/api/owner/overview?days=7');
  assert.ok(overview.body.totals.orders >= 1);
  assert.ok(overview.body.topItems.length >= 1);
  const customers = await owner('GET', '/api/owner/customers?q=regular2');
  assert.equal(customers.body.customers[0].orders, 1);
  assert.equal(customers.body.customers[0].spentCents, order.totalCents);
  // Owners can also run the staff order board.
  assert.equal((await owner('PATCH', `/api/staff/orders/${order.id}`, { status: 'preparing' })).body.order.status, 'preparing');
});

test('/healthz answers uptime monitors, without rate limits', async () => {
  const response = await fetch(`${base}/healthz`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.database, 'ok');
  assert.equal((await fetch(`${base}/healthz`, { method: 'HEAD' })).status, 200);
  // Well past the 300/minute API limit for one IP.
  for (let batch = 0; batch < 16; batch += 1) {
    const statuses = await Promise.all(Array.from({ length: 20 }, () => fetch(`${base}/healthz`).then(r => r.status)));
    assert.ok(statuses.every(status => status === 200));
  }
});

test('/healthz reports 503 when the database is down', async () => {
  const ping = db.ping;
  db.ping = () => Promise.reject(new Error('connection refused'));
  try {
    const response = await fetch(`${base}/healthz`);
    assert.equal(response.status, 503);
    assert.deepEqual((({ status, database }) => ({ status, database }))(await response.json()), { status: 'error', database: 'unreachable' });
  } finally {
    db.ping = ping;
  }
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
