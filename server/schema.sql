-- Little Lantern Café schema. Safe to run on every start: every statement is idempotent.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text not null default '',
  password_hash text not null,
  password_salt text not null,
  role text not null default 'customer',
  email_verified_at timestamptz,
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

-- Roles: customer, staff (order board, sold-out switches), owner (everything, including the menu,
-- hours, café details and team). Recreated so databases made before the owner role pick it up.
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('customer', 'staff', 'owner'));

create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- One-time links for email verification and password resets. Only the hash of the token is stored.
create table if not exists auth_tokens (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null check (purpose in ('verify', 'reset')),
  expires_at timestamptz not null
);

create table if not exists menu_items (
  id serial primary key,
  slug text not null unique,
  category text not null,
  name text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  tags text[] not null default '{}',
  available boolean not null default true,
  sort_order integer not null default 0
);

-- day_of_week follows JavaScript: 0 = Sunday. A day without a row is closed.
create table if not exists opening_hours (
  day_of_week integer primary key check (day_of_week between 0 and 6),
  opens text not null,
  closes text not null
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  number serial,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'received' check (status in ('received', 'preparing', 'ready', 'collected', 'cancelled')),
  pickup_at timestamptz not null,
  notes text not null default '',
  total_cents integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_items (
  id serial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id integer references menu_items(id) on delete set null,
  name text not null,
  unit_cents integer not null,
  quantity integer not null check (quantity between 1 and 20)
);

-- Café details the owner can edit (name, address, phone...). Values override the env defaults.
create table if not exists settings (
  key text primary key,
  value text not null
);

create index if not exists orders_user_idx on orders (user_id, created_at desc);
create index if not exists order_items_order_idx on order_items (order_id);

-- Cookie-free analytics: one row per page view, no user id or IP.
create table if not exists page_views (
  id bigserial primary key,
  path text not null,
  referrer text not null default '',
  viewed_at timestamptz not null default now()
);

create table if not exists error_reports (
  id bigserial primary key,
  source text not null,
  message text not null,
  detail text not null default '',
  path text not null default '',
  reported_at timestamptz not null default now()
);

-- Row level security: the server sets app.user_id and app.role at the start of every transaction
-- that touches orders, so a customer can only ever read or write their own orders, even if a query
-- forgets a WHERE clause. FORCE makes the policies apply to the table owner the app connects as.
alter table orders enable row level security;
alter table orders force row level security;
alter table order_items enable row level security;
alter table order_items force row level security;

drop policy if exists orders_owner on orders;
create policy orders_owner on orders
  using (user_id::text = current_setting('app.user_id', true) or current_setting('app.role', true) in ('staff', 'owner'))
  with check (user_id::text = current_setting('app.user_id', true) or current_setting('app.role', true) in ('staff', 'owner'));

drop policy if exists order_items_owner on order_items;
create policy order_items_owner on order_items
  using (exists (select 1 from orders o where o.id = order_id))
  with check (exists (select 1 from orders o where o.id = order_id));
