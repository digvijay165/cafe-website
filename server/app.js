// HTTP API and static site. createApp() is separate from listening so the tests can run it on a
// random port against an in-memory database.
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const db = require('./db');
const config = require('./config');
const auth = require('./auth');
const hours = require('./hours');
const mailer = require('./mailer');
const limits = require('./rate-limit');

const DIST = path.join(__dirname, '..', 'dist');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Paths the React app knows. Anything else gets the app with a real 404 status.
const CLIENT_ROUTES = [
  /^\/$/, /^\/menu$/, /^\/visit$/, /^\/cart$/, /^\/checkout$/, /^\/orders$/, /^\/orders\/[0-9a-f-]{36}$/i,
  /^\/login$/, /^\/signup$/, /^\/forgot-password$/, /^\/reset-password$/, /^\/verify-email$/, /^\/account$/,
  /^\/welcome$/, /^\/staff$/, /^\/privacy$/, /^\/terms$/
];
const ORDER_STATUSES = ['received', 'preparing', 'ready', 'collected', 'cancelled'];

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}
const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

// Lets async route handlers throw; errors land in the error handler below.
const route = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const money = cents => new Intl.NumberFormat(config.cafe.locale, { style: 'currency', currency: config.cafe.currency }).format(cents / 100);
const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function limit(req, key, max, windowMs) {
  const wait = limits.hit(key, max, windowMs);
  if (wait) fail(429, `Too many attempts. Please wait ${wait > 90 ? `${Math.ceil(wait / 60)} minutes` : `${wait} seconds`} and try again.`, { retryAfter: wait });
}

function requireUser(req) {
  if (!req.user) fail(401, 'Please log in to continue.');
  return req.user;
}

function requireStaff(req) {
  const user = requireUser(req);
  if (user.role !== 'staff') fail(403, 'This page is for café staff only.');
  return user;
}

function validatePassword(password, fields, key = 'password') {
  if (typeof password !== 'string' || password.length < 8) fields[key] = 'Use at least 8 characters.';
  else if (password.length > 200) fields[key] = 'Use 200 characters or fewer.';
}

function checkFields(fields) {
  if (Object.keys(fields).length) fail(400, 'Please fix the highlighted fields.', { fields });
}

async function sendVerificationEmail(user) {
  const token = await auth.issueToken(user.id, 'verify');
  await mailer.sendVerification(user, `${config.publicUrl}/verify-email?token=${token}`);
}

async function hoursRows() {
  const { rows } = await db.query('select day_of_week, opens, closes from opening_hours order by day_of_week');
  return rows;
}

function serializeOrder(order, items) {
  return {
    id: order.id, number: order.number, status: order.status, pickupAt: order.pickup_at, notes: order.notes,
    totalCents: order.total_cents, createdAt: order.created_at, updatedAt: order.updated_at,
    customer: order.customer_name ? { name: order.customer_name, phone: order.customer_phone } : undefined,
    items: items.filter(item => item.order_id === order.id).map(item => ({ name: item.name, unitCents: item.unit_cents, quantity: item.quantity }))
  };
}

async function ordersWithItems(q, orders) {
  if (!orders.length) return [];
  const { rows } = await q('select * from order_items where order_id = any($1::uuid[]) order by id', [orders.map(order => order.id)]);
  return orders.map(order => serializeOrder(order, rows));
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data:", "connect-src 'self'",
    'frame-src https://www.openstreetmap.org', "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"
  ].join('; '));
  if (config.production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

// Cookies are SameSite=Lax; on top of that, refuse state-changing requests sent from another site.
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Cross-site request refused.' });
  next();
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

  app.use(securityHeaders);
  app.use('/api', sameOrigin, express.json({ limit: '32kb' }), auth.loadUser);
  app.use('/api', (req, res, next) => {
    try { limit(req, `api:${req.ip}`, 300, 60_000); next(); } catch (error) { next(error); }
  });

  // ---- Site information ----------------------------------------------------------------------

  app.get('/api/health', route(async (req, res) => {
    const started = Date.now();
    await db.ping();
    res.json({ ok: true, database: db.kind, latencyMs: Date.now() - started, email: mailer.enabled ? 'resend' : 'log' });
  }));

  app.get('/api/info', route(async (req, res) => {
    res.json({ cafe: config.cafe, hours: hours.status(await hoursRows(), new Date(), config.cafe.timeZone) });
  }));

  app.get('/api/menu', route(async (req, res) => {
    const { rows } = await db.query('select id, slug, category, name, description, price_cents, tags, available from menu_items order by sort_order, id');
    res.set('Cache-Control', 'no-cache');
    res.json({
      items: rows.map(row => ({
        id: row.id, slug: row.slug, category: row.category, name: row.name, description: row.description,
        priceCents: row.price_cents, tags: row.tags, available: row.available
      }))
    });
  }));

  app.get('/api/pickup-slots', route(async (req, res) => {
    const rows = await hoursRows();
    const now = new Date();
    res.json({ slots: hours.pickupSlots(rows, now, config.cafe.timeZone), openNow: hours.status(rows, now, config.cafe.timeZone).openNow });
  }));

  // ---- Accounts ------------------------------------------------------------------------------

  app.get('/api/auth/me', (req, res) => res.json({ user: auth.publicUser(req.user) }));

  app.post('/api/auth/signup', route(async (req, res) => {
    limit(req, `signup:${req.ip}`, 5, 60 * 60_000);
    const name = clean(req.body.name, 60);
    const email = clean(req.body.email, 200).toLowerCase();
    const fields = {};
    if (name.length < 2) fields.name = 'Tell us your name (at least 2 characters).';
    if (!EMAIL.test(email)) fields.email = 'Enter a valid email address.';
    validatePassword(req.body.password, fields);
    if (req.body.acceptTerms !== true) fields.acceptTerms = 'Please accept the terms to create an account.';
    checkFields(fields);
    const { rows: existing } = await db.query('select id from users where email = $1', [email]);
    if (existing.length) fail(409, 'An account with this email already exists. Try logging in instead.', { fields: { email: 'Already registered.' } });
    const { salt, hash } = auth.hashPassword(req.body.password);
    const role = config.staffEmails.includes(email) ? 'staff' : 'customer';
    const { rows: [user] } = await db.query(
      'insert into users (name, email, password_hash, password_salt, role) values ($1, $2, $3, $4, $5) returning *',
      [name, email, hash, salt, role]
    );
    await sendVerificationEmail(user);
    await auth.startSession(res, user.id);
    res.status(201).json({ user: auth.publicUser(user) });
  }));

  app.post('/api/auth/login', route(async (req, res) => {
    const email = clean(req.body.email, 200).toLowerCase();
    limit(req, `login-ip:${req.ip}`, 20, 15 * 60_000);
    const locked = limits.blocked(`login-email:${email}`, 5);
    if (locked) fail(429, `Too many failed attempts for this account. Try again in ${Math.ceil(locked / 60)} minutes or reset your password.`);
    const { rows: [user] } = await db.query('select * from users where email = $1', [email]);
    if (!auth.checkPassword(user, String(req.body.password || ''))) {
      limits.hit(`login-email:${email}`, 5, 15 * 60_000);
      fail(401, 'That email and password do not match.');
    }
    limits.reset(`login-email:${email}`);
    await auth.startSession(res, user.id);
    res.json({ user: auth.publicUser(user) });
  }));

  app.post('/api/auth/logout', route(async (req, res) => {
    await auth.endSession(req, res);
    res.json({ ok: true });
  }));

  app.post('/api/auth/verify', route(async (req, res) => {
    limit(req, `verify:${req.ip}`, 20, 15 * 60_000);
    const userId = await auth.useToken(req.body.token, 'verify');
    if (!userId) fail(400, 'This confirmation link has expired or was already used. Log in and send yourself a new one.');
    const { rows: [user] } = await db.query('update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1 returning *', [userId]);
    res.json({ user: auth.publicUser(user) });
  }));

  app.post('/api/auth/resend-verification', route(async (req, res) => {
    const user = requireUser(req);
    limit(req, `resend:${user.id}`, 3, 60 * 60_000);
    if (user.email_verified_at) return res.json({ ok: true, alreadyVerified: true });
    await sendVerificationEmail(user);
    res.json({ ok: true });
  }));

  // Always answers the same way so it cannot be used to find out who has an account.
  app.post('/api/auth/forgot', route(async (req, res) => {
    const email = clean(req.body.email, 200).toLowerCase();
    if (!EMAIL.test(email)) fail(400, 'Enter a valid email address.', { fields: { email: 'Enter a valid email address.' } });
    limit(req, `forgot-ip:${req.ip}`, 5, 15 * 60_000);
    limit(req, `forgot-email:${email}`, 3, 60 * 60_000);
    const { rows: [user] } = await db.query('select * from users where email = $1', [email]);
    if (user) {
      const token = await auth.issueToken(user.id, 'reset');
      await mailer.sendPasswordReset(user, `${config.publicUrl}/reset-password?token=${token}`);
    }
    res.json({ ok: true });
  }));

  app.post('/api/auth/reset', route(async (req, res) => {
    limit(req, `reset:${req.ip}`, 10, 15 * 60_000);
    const fields = {};
    validatePassword(req.body.password, fields);
    checkFields(fields);
    const userId = await auth.useToken(req.body.token, 'reset');
    if (!userId) fail(400, 'This reset link has expired or was already used. Request a new one.');
    const { salt, hash } = auth.hashPassword(req.body.password);
    // A reset signs out every device and proves the person controls the inbox.
    await db.query('update users set password_hash = $1, password_salt = $2, email_verified_at = coalesce(email_verified_at, now()) where id = $3', [hash, salt, userId]);
    await db.query('delete from sessions where user_id = $1', [userId]);
    await auth.startSession(res, userId);
    const { rows: [user] } = await db.query('select * from users where id = $1', [userId]);
    res.json({ user: auth.publicUser(user) });
  }));

  app.patch('/api/account', route(async (req, res) => {
    const user = requireUser(req);
    const name = clean(req.body.name, 60);
    const phone = clean(req.body.phone, 20);
    const fields = {};
    if (name.length < 2) fields.name = 'Tell us your name (at least 2 characters).';
    if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) fields.phone = 'Enter a phone number with digits only, e.g. +91 98765 43210.';
    checkFields(fields);
    const { rows: [updated] } = await db.query('update users set name = $1, phone = $2 where id = $3 returning *', [name, phone, user.id]);
    res.json({ user: auth.publicUser(updated) });
  }));

  app.post('/api/account/password', route(async (req, res) => {
    const user = requireUser(req);
    limit(req, `password:${user.id}`, 5, 15 * 60_000);
    const fields = {};
    if (!auth.checkPassword(user, String(req.body.current || ''))) fields.current = 'That is not your current password.';
    validatePassword(req.body.next, fields, 'next');
    checkFields(fields);
    const { salt, hash } = auth.hashPassword(req.body.next);
    await db.query('update users set password_hash = $1, password_salt = $2 where id = $3', [hash, salt, user.id]);
    await db.query('delete from sessions where user_id = $1', [user.id]);
    await auth.startSession(res, user.id);
    res.json({ ok: true });
  }));

  app.post('/api/account/onboarded', route(async (req, res) => {
    const user = requireUser(req);
    const { rows: [updated] } = await db.query('update users set onboarded_at = coalesce(onboarded_at, now()) where id = $1 returning *', [user.id]);
    res.json({ user: auth.publicUser(updated) });
  }));

  app.delete('/api/account', route(async (req, res) => {
    const user = requireUser(req);
    limit(req, `delete:${user.id}`, 5, 15 * 60_000);
    if (!auth.checkPassword(user, String(req.body.password || ''))) fail(400, 'That password is not right.', { fields: { password: 'That password is not right.' } });
    // Orders, sessions and tokens go with the account (on delete cascade).
    await db.asUser(user, q => q('delete from users where id = $1', [user.id]));
    await auth.endSession(req, res);
    res.json({ ok: true });
  }));

  // ---- Orders --------------------------------------------------------------------------------

  app.post('/api/orders', route(async (req, res) => {
    const user = requireUser(req);
    if (!user.email_verified_at) fail(403, 'Please confirm your email address before ordering. Check your inbox for the link.', { code: 'unverified' });
    limit(req, `order:${user.id}`, 10, 60 * 60_000);

    const lines = Array.isArray(req.body.items) ? req.body.items : [];
    const quantities = new Map();
    for (const line of lines) {
      const id = Number(line?.id), quantity = Number(line?.quantity);
      if (!Number.isInteger(id) || !Number.isInteger(quantity) || quantity < 1) fail(400, 'Your basket has an item we could not read. Please remove it and add it again.');
      quantities.set(id, (quantities.get(id) || 0) + quantity);
    }
    if (!quantities.size) fail(400, 'Your basket is empty.');
    if (quantities.size > 30) fail(400, 'That is a big order! Please call us for orders of more than 30 different items.');
    for (const quantity of quantities.values()) if (quantity > 20) fail(400, 'You can order up to 20 of any one item online. Call us for larger orders.');

    // Prices always come from the database, never from the browser.
    const { rows: menu } = await db.query('select id, name, price_cents, available from menu_items where id = any($1::int[])', [[...quantities.keys()]]);
    const byId = new Map(menu.map(item => [item.id, item]));
    const unavailable = [...quantities.keys()].filter(id => !byId.get(id)?.available);
    if (unavailable.length) {
      const names = unavailable.map(id => byId.get(id)?.name).filter(Boolean);
      fail(409, names.length ? `Sorry, ${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} sold out right now. Please remove ${names.length > 1 ? 'them' : 'it'} from your basket.` : 'Something in your basket is no longer on the menu.', { unavailable });
    }

    const slots = hours.pickupSlots(await hoursRows(), new Date(), config.cafe.timeZone);
    const slot = slots.find(candidate => candidate.at === req.body.pickupAt);
    if (!slot) fail(400, 'That pickup time is no longer available. Please choose another.', { fields: { pickupAt: 'Choose a pickup time.' } });
    const notes = clean(req.body.notes, 300);
    const items = [...quantities].map(([id, quantity]) => ({ id, quantity, name: byId.get(id).name, unit: byId.get(id).price_cents }));
    const total = items.reduce((sum, item) => sum + item.unit * item.quantity, 0);

    const order = await db.asUser(user, async q => {
      const { rows: [created] } = await q(
        'insert into orders (user_id, pickup_at, notes, total_cents) values ($1, $2, $3, $4) returning *',
        [user.id, slot.at, notes, total]
      );
      for (const item of items) {
        await q('insert into order_items (order_id, menu_item_id, name, unit_cents, quantity) values ($1, $2, $3, $4, $5)', [created.id, item.id, item.name, item.unit, item.quantity]);
      }
      return (await ordersWithItems(q, [created]))[0];
    });
    mailer.sendOrderConfirmation(user, order, items, `${slot.day.toLowerCase()} at ${slot.time}`, money(total))
      .catch(error => console.error('[mail] order confirmation failed:', error.message));
    res.status(201).json({ order });
  }));

  app.get('/api/orders', route(async (req, res) => {
    const user = requireUser(req);
    // Row level security limits this to the user's own orders; the WHERE clause keeps staff
    // accounts' "my orders" page personal too.
    const orders = await db.asUser(user, async q => {
      const { rows } = await q('select * from orders where user_id = $1 order by created_at desc limit 50', [user.id]);
      return ordersWithItems(q, rows);
    });
    res.json({ orders });
  }));

  app.get('/api/orders/:id', route(async (req, res) => {
    const user = requireUser(req);
    if (!UUID.test(req.params.id)) fail(404, 'We could not find that order.');
    const order = await db.asUser(user, async q => {
      const { rows } = await q('select * from orders where id = $1', [req.params.id]);
      return (await ordersWithItems(q, rows))[0];
    });
    if (!order) fail(404, 'We could not find that order.');
    res.json({ order });
  }));

  app.post('/api/orders/:id/cancel', route(async (req, res) => {
    const user = requireUser(req);
    if (!UUID.test(req.params.id)) fail(404, 'We could not find that order.');
    const order = await db.asUser(user, async q => {
      const { rows } = await q(
        "update orders set status = 'cancelled', updated_at = now() where id = $1 and user_id = $2 and status = 'received' returning *",
        [req.params.id, user.id]
      );
      return (await ordersWithItems(q, rows))[0];
    });
    if (!order) fail(409, 'This order can no longer be cancelled online because we have started making it. Please call us.');
    res.json({ order });
  }));

  // ---- Staff ---------------------------------------------------------------------------------

  app.get('/api/staff/orders', route(async (req, res) => {
    const staff = requireStaff(req);
    const active = req.query.view !== 'all';
    const orders = await db.asUser(staff, async q => {
      const { rows } = await q(
        `select o.*, u.name as customer_name, u.phone as customer_phone from orders o join users u on u.id = o.user_id
         ${active ? "where o.status in ('received', 'preparing', 'ready')" : "where o.created_at > now() - interval '7 days'"}
         order by o.pickup_at limit 200`
      );
      return ordersWithItems(q, rows);
    });
    res.json({ orders });
  }));

  app.patch('/api/staff/orders/:id', route(async (req, res) => {
    const staff = requireStaff(req);
    if (!UUID.test(req.params.id)) fail(404, 'Order not found.');
    if (!ORDER_STATUSES.includes(req.body.status)) fail(400, 'Unknown order status.');
    const order = await db.asUser(staff, async q => {
      const { rows } = await q('update orders set status = $1, updated_at = now() where id = $2 returning *', [req.body.status, req.params.id]);
      return (await ordersWithItems(q, rows))[0];
    });
    if (!order) fail(404, 'Order not found.');
    res.json({ order });
  }));

  app.patch('/api/staff/menu/:id', route(async (req, res) => {
    requireStaff(req);
    const id = Number(req.params.id);
    const { available, priceCents } = req.body;
    if (available !== undefined && typeof available !== 'boolean') fail(400, 'available must be true or false.');
    if (priceCents !== undefined && (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 10_000_000)) fail(400, 'Enter a valid price.');
    const { rows: [item] } = await db.query(
      'update menu_items set available = coalesce($1, available), price_cents = coalesce($2, price_cents) where id = $3 returning id, available, price_cents',
      [available ?? null, priceCents ?? null, id]
    );
    if (!item) fail(404, 'Menu item not found.');
    res.json({ item: { id: item.id, available: item.available, priceCents: item.price_cents } });
  }));

  app.get('/api/staff/stats', route(async (req, res) => {
    const staff = requireStaff(req);
    const [views, pages, errors, sales] = await Promise.all([
      db.query("select to_char(date_trunc('day', viewed_at), 'YYYY-MM-DD') as day, count(*)::int as views from page_views where viewed_at > now() - interval '7 days' group by 1 order by 1"),
      db.query("select path, count(*)::int as views from page_views where viewed_at > now() - interval '7 days' group by 1 order by 2 desc limit 8"),
      db.query('select source, message, path, reported_at from error_reports order by reported_at desc limit 10'),
      db.asUser(staff, q => q("select count(*)::int as orders, coalesce(sum(total_cents), 0)::int as revenue from orders where status <> 'cancelled' and created_at > now() - interval '1 day'"))
    ]);
    res.json({ views: views.rows, pages: pages.rows, errors: errors.rows, today: sales.rows[0] });
  }));

  // ---- Analytics and error tracking -----------------------------------------------------------

  app.post('/api/telemetry/view', route(async (req, res) => {
    limit(req, `view:${req.ip}`, 120, 60_000);
    const pathName = clean(req.body.path, 200);
    if (!pathName.startsWith('/')) fail(400, 'Bad path.');
    let referrer = '';
    try { referrer = req.body.referrer ? new URL(req.body.referrer).host : ''; } catch {}
    if (referrer === req.headers.host) referrer = '';
    await db.query('insert into page_views (path, referrer) values ($1, $2)', [pathName.replace(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi, ':id'), referrer.slice(0, 200)]);
    res.status(204).end();
  }));

  app.post('/api/telemetry/error', route(async (req, res) => {
    limit(req, `error:${req.ip}`, 20, 60_000);
    await db.query('insert into error_reports (source, message, detail, path) values ($1, $2, $3, $4)', ['browser', clean(req.body.message, 500) || 'Unknown error', clean(req.body.detail, 4000), clean(req.body.path, 200)]);
    res.status(204).end();
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // ---- Static site ---------------------------------------------------------------------------

  app.use(express.static(DIST, {
    index: false,
    setHeaders(res, file) {
      // Webpack puts a content hash in asset names, so they can be cached forever.
      if (/\.[0-9a-f]{8,}\.(js|css)$/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
    }
  }));

  app.get('*', (req, res) => {
    const index = path.join(DIST, 'index.html');
    if (!fs.existsSync(index)) return res.status(503).type('text').send('The site has not been built yet. Run `npm run build`.');
    res.status(CLIENT_ROUTES.some(pattern => pattern.test(req.path)) ? 200 : 404);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error instanceof HttpError) {
      if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      return res.status(error.status).json({ error: error.message, fields: error.fields, code: error.code });
    }
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request could not be read.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
    console.error(`[error] ${req.method} ${req.path}:`, error);
    db.query('insert into error_reports (source, message, detail, path) values ($1, $2, $3, $4)', ['server', String(error.message).slice(0, 500), String(error.stack || '').slice(0, 4000), req.path]).catch(() => {});
    res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
  });

  return app;
}

module.exports = { createApp };
