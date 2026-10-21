# Little Lantern Café

Website for a neighbourhood café: menu, location, opening hours and online ordering for pickup. Customers browse the menu, fill a basket, pick a 15-minute pickup slot and pay at the counter. An admin (staff) dashboard handles incoming orders, sold-out items and site stats.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 18 + React Router, bundled with **Webpack** | Many interactive pages (basket, checkout, live order status) |
| UI | **Bootstrap 5** with a custom café theme | Responsive grid and accessible form styles out of the box |
| Backend | **Node.js** + Express | Same language as the frontend, small and fast |
| Database | **PostgreSQL** (production), **PGlite** (local) | Relational data (users → orders → items) and row level security. PGlite is real Postgres in WebAssembly, so local development needs no database server |
| Mobile | **PWA** (manifest + service worker) | Installable on phones; menu and hours still work offline. No app-store build needed |
| DevOps | **Docker**, Docker Compose, **NGINX**, GitHub Actions CI | One command brings up NGINX + app + Postgres |

Left out on purpose: Redis, message queues, Kubernetes, and graph or NoSQL databases. A single café doesn't need them. The places to add them are under [Scaling later](#scaling-later).

## Run it locally

```bash
npm install
npm run build
npm start
```

Open http://localhost:3000. Data lives in `./data/pgdata`. Emails (verification, password reset, order confirmation) print to the terminal until you set `RESEND_API_KEY`.

```bash
npm test            # API tests on an in-memory Postgres
npm run watch       # rebuild the frontend on change (run npm start alongside)
```

## Admin accounts

Admins have the `staff` role and see a **Staff** link with three tabs: Orders (live board, refreshes every 15 s), Sold out (toggle item availability) and Insights (page views, top pages, recent errors, last-24 h orders).

- Any account that signs up with an email listed in `STAFF_EMAILS` (in `.env`) becomes an admin.
- To create or reset an admin directly (the password is hashed and never written to a file):

```bash
ADMIN_NAME="Name" ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npm run admin:create
```

Stop the server first when using the local PGlite database. With Docker: `docker compose exec -e ADMIN_NAME=... -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... app node scripts/create-admin.js`.

## Deploy

```bash
cp .env.example .env     # set PUBLIC_URL, STAFF_EMAILS, RESEND_API_KEY, POSTGRES_PASSWORD
docker compose up -d --build
```

Add HTTPS in front before going live (certbot with NGINX, or a host that terminates TLS). In production the session cookie is `Secure`, so logging in only works over HTTPS. Any Node host with a Postgres `DATABASE_URL` works too (Render, Railway, Fly.io, AWS, Azure). Run `npm run build`, then `npm start`.

## Production checklist

| Item | Where |
| --- | --- |
| Login / logout | `server/auth.js`: PBKDF2 passwords, http-only SameSite session cookie, sessions stored hashed |
| Password reset | One-time, 1-hour link; resetting signs out every device |
| Email verification | 24-hour link; needed before the first order |
| Loading states | Spinners and skeletons (`Loading` in `client/components/ui.jsx`) |
| Empty states | Empty basket, no orders, no search results, no open orders |
| Clear error messages | Each API error carries a readable message, with per-field errors on forms |
| Form validation | In the browser on submit, and again on the server |
| Rate limiting | Per IP and per account on login, signup, reset and orders; NGINX `limit_req` on `/api` |
| Database backups | `npm run backup` / `npm run restore -- <file> --yes`; use `pg_dump` for large databases |
| Row level security | Postgres policies on `orders` and `order_items` (`server/schema.sql`), tested in `test/api.test.js` |
| API keys off the frontend | Only the server holds secrets (`RESEND_API_KEY`, `DATABASE_URL`); prices are always recomputed on the server |
| Mobile layout | Responsive Bootstrap grid, collapsible nav, floating basket bar on phones |
| Custom 404 page | Unknown URLs return HTTP 404 with a styled page |
| Analytics | Cookie-free, first-party page views (respects Do Not Track) |
| Error tracking | Browser and server errors are stored and shown under Staff → Insights |
| Privacy policy / Terms | `/privacy`, `/terms` (templates: have them reviewed before launch) |
| Delete account button | Account page; needs the password, removes orders too |
| Onboarding flow | `/welcome` after sign-up explains ordering in three steps |
| Captions & meta | Alt text, table captions, ARIA labels, page titles, Open Graph and description tags |

## Scaling later

- **Several app servers:** move rate-limit counters to **Redis** (`server/rate-limit.js` is the only file to change) and put NGINX or a load balancer in front.
- **Order notifications** (SMS, kitchen printer): publish an event when an order is created and consume it from a queue (**SQS** or **Kafka**) instead of sending inline.
- **Payments:** add Razorpay or Stripe Checkout on the server; the order total is already computed there.
