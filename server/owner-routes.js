// Owner-only API: sales overview, full order history, menu editing, opening hours, café details,
// team roles and the customer list. Staff routes (order board, sold-out switches) also accept owners.
const db = require('./db');
const config = require('./config');
const settings = require('./settings');

const TAGS = ['vegan', 'gluten-free'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ROLES = ['customer', 'staff', 'owner'];

const slugify = text => text.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 50) || 'item';

function serializeItem(row) {
  return {
    id: row.id, slug: row.slug, category: row.category, name: row.name, description: row.description,
    priceCents: row.price_cents, tags: row.tags, available: row.available, sortOrder: row.sort_order
  };
}

module.exports = function ownerRoutes(app, { route, fail, requireOwner, checkFields, clean, ordersWithItems, ORDER_STATUSES, EMAIL }) {
  const tz = () => config.cafe.timeZone;

  // ---- Overview -----------------------------------------------------------------------------

  app.get('/api/owner/overview', route(async (req, res) => {
    const owner = requireOwner(req);
    const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const result = await db.asUser(owner, async q => {
      const since = `now() - interval '${days} days'`;
      const [totals, byDay, topItems, byStatus, today] = await Promise.all([
        q(`select count(*)::int as orders, coalesce(sum(total_cents), 0)::int as revenue, count(distinct user_id)::int as customers
           from orders where status <> 'cancelled' and created_at > ${since}`),
        q(`select to_char(created_at at time zone $1, 'YYYY-MM-DD') as day, count(*)::int as orders, coalesce(sum(total_cents), 0)::int as revenue
           from orders where status <> 'cancelled' and created_at > ${since} group by 1 order by 1`, [tz()]),
        q(`select i.name, sum(i.quantity)::int as quantity, sum(i.quantity * i.unit_cents)::int as revenue
           from order_items i join orders o on o.id = i.order_id
           where o.status <> 'cancelled' and o.created_at > ${since} group by i.name order by 2 desc, 3 desc limit 8`),
        q(`select status, count(*)::int as orders from orders where created_at > ${since} group by status`),
        q(`select count(*)::int as orders, coalesce(sum(total_cents), 0)::int as revenue from orders
           where status <> 'cancelled' and (created_at at time zone $1)::date = (now() at time zone $1)::date`, [tz()])
      ]);
      return {
        days,
        totals: { ...totals.rows[0], averageCents: totals.rows[0].orders ? Math.round(totals.rows[0].revenue / totals.rows[0].orders) : 0 },
        today: today.rows[0],
        byDay: byDay.rows,
        topItems: topItems.rows,
        byStatus: Object.fromEntries(byStatus.rows.map(row => [row.status, row.orders]))
      };
    });
    res.json(result);
  }));

  // ---- Orders -------------------------------------------------------------------------------

  app.get('/api/owner/orders', route(async (req, res) => {
    const owner = requireOwner(req);
    const status = ORDER_STATUSES.includes(req.query.status) ? req.query.status : null;
    const days = [1, 7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const search = clean(req.query.q, 100);
    const number = /^#?\d+$/.test(search) ? Number(search.replace('#', '')) : null;
    const orders = await db.asUser(owner, async q => {
      const { rows } = await q(
        `select o.*, u.name as customer_name, u.phone as customer_phone, u.email as customer_email
         from orders o join users u on u.id = o.user_id
         where o.created_at > now() - make_interval(days => $1::int)
           and ($2::text is null or o.status = $2)
           and ($3 = '' or o.number = $4::int or u.name ilike '%' || $3 || '%' or u.email ilike '%' || $3 || '%')
         order by o.created_at desc limit 300`,
        [days, status, search, number]
      );
      const withItems = await ordersWithItems(q, rows);
      return withItems.map((order, index) => ({ ...order, customer: { ...order.customer, email: rows[index].customer_email } }));
    });
    res.json({ orders });
  }));

  // ---- Menu ---------------------------------------------------------------------------------

  function readItem(body, partial) {
    const fields = {};
    const values = {};
    if (!partial || body.name !== undefined) {
      values.name = clean(body.name, 60);
      if (values.name.length < 2) fields.name = 'Give the item a name (2–60 characters).';
    }
    if (!partial || body.category !== undefined) {
      values.category = clean(body.category, 30);
      if (values.category.length < 2) fields.category = 'Choose or type a category (2–30 characters).';
    }
    if (!partial || body.description !== undefined) {
      values.description = clean(body.description, 200);
    }
    if (!partial || body.priceCents !== undefined) {
      values.priceCents = Number(body.priceCents);
      if (!Number.isInteger(values.priceCents) || values.priceCents < 0 || values.priceCents > 10_000_000) fields.priceCents = 'Enter a price between 0 and 1,00,000.';
    }
    if (!partial || body.tags !== undefined) {
      values.tags = Array.isArray(body.tags) ? [...new Set(body.tags.filter(tag => TAGS.includes(tag)))] : [];
    }
    if (!partial || body.available !== undefined) {
      if (body.available !== undefined && typeof body.available !== 'boolean') fields.available = 'Choose available or sold out.';
      values.available = body.available !== false;
    }
    checkFields(fields);
    return values;
  }

  async function uniqueSlug(name, exceptId = 0) {
    const base = slugify(name);
    const { rows } = await db.query('select slug from menu_items where (slug = $1 or slug like $2) and id <> $3', [base, `${base}-%`, exceptId]);
    const taken = new Set(rows.map(row => row.slug));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  // Next sort position at the end of a category; a new category goes after everything else.
  async function endOfCategory(category) {
    const { rows: [inCategory] } = await db.query('select max(sort_order) as max from menu_items where category = $1', [category]);
    if (inCategory.max !== null) return inCategory.max + 1;
    const { rows: [all] } = await db.query('select coalesce(max(sort_order), 0) as max from menu_items');
    return Math.ceil((all.max + 1) / 100) * 100;
  }

  app.get('/api/owner/menu', route(async (req, res) => {
    requireOwner(req);
    const { rows } = await db.query('select * from menu_items order by sort_order, id');
    res.json({ items: rows.map(serializeItem), categories: [...new Set(rows.map(row => row.category))], tags: TAGS });
  }));

  app.post('/api/owner/menu', route(async (req, res) => {
    requireOwner(req);
    const item = readItem(req.body, false);
    const { rows: [created] } = await db.query(
      `insert into menu_items (slug, category, name, description, price_cents, tags, available, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [await uniqueSlug(item.name), item.category, item.name, item.description, item.priceCents, item.tags, item.available, await endOfCategory(item.category)]
    );
    res.status(201).json({ item: serializeItem(created) });
  }));

  app.patch('/api/owner/menu/:id', route(async (req, res) => {
    requireOwner(req);
    const id = Number(req.params.id);
    const { rows: [current] } = await db.query('select * from menu_items where id = $1', [id]);
    if (!current) fail(404, 'That menu item no longer exists.');
    const changes = readItem(req.body, true);
    const next = {
      name: changes.name ?? current.name,
      category: changes.category ?? current.category,
      description: changes.description ?? current.description,
      priceCents: changes.priceCents ?? current.price_cents,
      tags: changes.tags ?? current.tags,
      available: changes.available ?? current.available
    };
    const slug = next.name !== current.name ? await uniqueSlug(next.name, id) : current.slug;
    const sortOrder = next.category !== current.category ? await endOfCategory(next.category) : current.sort_order;
    const { rows: [updated] } = await db.query(
      `update menu_items set slug = $1, category = $2, name = $3, description = $4, price_cents = $5, tags = $6, available = $7, sort_order = $8
       where id = $9 returning *`,
      [slug, next.category, next.name, next.description, next.priceCents, next.tags, next.available, sortOrder, id]
    );
    res.json({ item: serializeItem(updated) });
  }));

  // Past orders keep their own copy of the name and price, so deleting an item never changes them.
  app.delete('/api/owner/menu/:id', route(async (req, res) => {
    requireOwner(req);
    const { rows } = await db.query('delete from menu_items where id = $1 returning id', [Number(req.params.id)]);
    if (!rows.length) fail(404, 'That menu item no longer exists.');
    res.json({ ok: true });
  }));

  app.post('/api/owner/menu/:id/move', route(async (req, res) => {
    requireOwner(req);
    const id = Number(req.params.id);
    const step = req.body.direction === 'up' ? -1 : req.body.direction === 'down' ? 1 : 0;
    if (!step) fail(400, 'direction must be up or down.');
    const { rows: [item] } = await db.query('select category from menu_items where id = $1', [id]);
    if (!item) fail(404, 'That menu item no longer exists.');
    const { rows } = await db.query('select id, sort_order from menu_items where category = $1 order by sort_order, id', [item.category]);
    const index = rows.findIndex(row => row.id === id);
    const target = index + step;
    if (target >= 0 && target < rows.length) {
      const base = Math.min(...rows.map(row => row.sort_order));
      [rows[index], rows[target]] = [rows[target], rows[index]];
      for (const [position, row] of rows.entries()) await db.query('update menu_items set sort_order = $1 where id = $2', [base + position, row.id]);
    }
    const { rows: all } = await db.query('select * from menu_items order by sort_order, id');
    res.json({ items: all.map(serializeItem) });
  }));

  // ---- Opening hours ------------------------------------------------------------------------

  app.put('/api/owner/hours', route(async (req, res) => {
    const owner = requireOwner(req);
    const days = Array.isArray(req.body.days) ? req.body.days : [];
    const fields = {};
    const rows = [];
    for (let day = 0; day < 7; day += 1) {
      const entry = days.find(d => Number(d?.day) === day);
      if (!entry || !entry.open) continue;
      if (!TIME.test(entry.opens) || !TIME.test(entry.closes)) fields[`day${day}`] = 'Use times like 07:30.';
      else if (entry.opens >= entry.closes) fields[`day${day}`] = 'Closing time must be after opening time.';
      else rows.push([day, entry.opens, entry.closes]);
    }
    checkFields(fields);
    await db.asUser(owner, async q => {
      await q('delete from opening_hours');
      for (const row of rows) await q('insert into opening_hours (day_of_week, opens, closes) values ($1, $2, $3)', row);
    });
    res.json({ ok: true });
  }));

  // ---- Café details -------------------------------------------------------------------------

  app.get('/api/owner/settings', route(async (req, res) => {
    requireOwner(req);
    const { name, tagline, address, phone, email, latitude, longitude, timeZone, currency } = config.cafe;
    res.json({ settings: { name, tagline, address, phone, email, latitude, longitude }, fixed: { timeZone, currency } });
  }));

  app.patch('/api/owner/settings', route(async (req, res) => {
    requireOwner(req);
    const { values, fields } = settings.validate(req.body || {});
    checkFields(fields);
    await settings.save(db, values);
    const { name, tagline, address, phone, email, latitude, longitude } = config.cafe;
    res.json({ settings: { name, tagline, address, phone, email, latitude, longitude } });
  }));

  // ---- Team ---------------------------------------------------------------------------------

  async function team() {
    const { rows } = await db.query("select id, name, email, role, created_at from users where role in ('staff', 'owner') order by role desc, name");
    return rows.map(row => ({
      id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.created_at,
      fromConfig: config.ownerEmails.includes(row.email) || config.staffEmails.includes(row.email)
    }));
  }

  app.get('/api/owner/team', route(async (req, res) => {
    requireOwner(req);
    res.json({ team: await team() });
  }));

  app.post('/api/owner/team', route(async (req, res) => {
    const owner = requireOwner(req);
    const email = clean(req.body.email, 200).toLowerCase();
    const role = req.body.role;
    if (!EMAIL.test(email)) fail(400, 'Enter a valid email address.', { fields: { email: 'Enter a valid email address.' } });
    if (!ROLES.includes(role)) fail(400, 'Choose a role.');
    if (email === owner.email) fail(400, 'You cannot change your own role. Ask another owner to do it.');
    const { rows } = await db.query('update users set role = $1 where email = $2 returning id', [role, email]);
    if (!rows.length) fail(404, `No account uses ${email} yet. Ask them to sign up first, then add them here.`, { fields: { email: 'No account with this email yet.' } });
    // Signs them out everywhere so the new role applies straight away.
    await db.query('delete from sessions where user_id = $1', [rows[0].id]);
    res.json({ team: await team() });
  }));

  // ---- Customers ----------------------------------------------------------------------------

  app.get('/api/owner/customers', route(async (req, res) => {
    const owner = requireOwner(req);
    const search = clean(req.query.q, 100);
    const customers = await db.asUser(owner, async q => {
      const { rows } = await q(
        `select u.id, u.name, u.email, u.phone, u.created_at, u.email_verified_at is not null as verified,
           count(o.id) filter (where o.status <> 'cancelled')::int as orders,
           coalesce(sum(o.total_cents) filter (where o.status <> 'cancelled'), 0)::int as spent,
           max(o.created_at) as last_order
         from users u left join orders o on o.user_id = u.id
         where u.role = 'customer' and ($1 = '' or u.name ilike '%' || $1 || '%' or u.email ilike '%' || $1 || '%' or u.phone ilike '%' || $1 || '%')
         group by u.id order by last_order desc nulls last, u.created_at desc limit 300`,
        [search]
      );
      return rows;
    });
    res.json({
      customers: customers.map(row => ({
        id: row.id, name: row.name, email: row.email, phone: row.phone, verified: row.verified,
        joinedAt: row.created_at, orders: row.orders, spentCents: row.spent, lastOrderAt: row.last_order
      }))
    });
  }));
};
