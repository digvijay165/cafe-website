// Regenerates the README screenshots in docs/screenshots.
// Usage: npm run build && node scripts/screenshots.js [path-to-chrome-or-edge]
// Starts a throwaway server on an in-memory database, places a few demo orders, drives headless
// Chrome over the DevTools protocol, then cleans up.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const PORT = 4186;
const DEBUG_PORT = 9334;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = process.argv[2] || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome'
].find(file => fs.existsSync(file));

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-shots-'));

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(url); if (response.ok) return response; } catch (error) { if (i === 99) console.error(error.cause || error); }
    await wait(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, { resolve, reject });
    socket.send(JSON.stringify({ id: messageId, method, params }));
  });
  return new Promise(resolve => socket.addEventListener('open', () => resolve({ send, close: () => socket.close() })));
}

async function main() {
  if (!CHROME) throw new Error('Chrome or Edge not found. Pass its path as the first argument.');
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) throw new Error('Run `npm run build` first.');
  fs.mkdirSync(OUT, { recursive: true });

  // Verification links are printed to the server log; keep it to pick them up.
  let log = '';
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: 'memory://', STAFF_EMAILS: 'staff@example.test', PUBLIC_URL: BASE }
  });
  server.stdout.on('data', chunk => { log += chunk; });
  const lastToken = () => [...log.matchAll(/verify-email\?token=([a-f0-9]{64})/g)].at(-1)[1];

  const browser = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${path.join(temp, 'profile')}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  try {
    await waitFor(`${BASE}/api/health`);
    const targets = await (await waitFor(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
    const page = await connect(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await page.send('Page.enable');
    await page.send('Runtime.enable');

    const size = (width, height, mobile = false) => page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile });
    const run = async expression => {
      const result = await page.send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const go = async (url, ms = 1600) => { await page.send('Page.navigate', { url: BASE + url }); await wait(ms); };
    const shot = async name => {
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
      console.log(`saved docs/screenshots/${name}.png`);
    };
    const api = (url, body, method = 'POST') => `await fetch(${JSON.stringify(url)}, { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify(body)}) }).then(r => r.json())`;
    const basket = lines => `localStorage.setItem('lantern-cart', ${JSON.stringify(JSON.stringify(lines))});`;

    await size(1440, 900);
    await go('/');
    await shot('home');

    // Demo customers place a few orders so the order and staff pages have something to show.
    const menu = await run(`return (await fetch('/api/menu').then(r => r.json())).items;`);
    const id = slug => menu.find(item => item.slug === slug).id;
    const customers = [
      ['Meera Rao', 'meera@example.test', [['flat-white', 2], ['butter-croissant', 2]], 'One with oat milk please'],
      ['Arjun Nair', 'arjun@example.test', [['masala-chai', 1], ['paneer-sandwich', 1]], ''],
      ['Zoya Khan', 'zoya@example.test', [['cold-brew', 1], ['almond-cake', 1], ['buddha-bowl', 1]], 'No sesame, allergy']
    ];
    for (const [index, [name, email, lines, notes]] of customers.entries()) {
      await run(`${api('/api/auth/logout', {})}; ${api('/api/auth/signup', { name, email, password: 'demo-customer-pass', acceptTerms: true })};`);
      await wait(200);
      await run(`${api('/api/auth/verify', { token: lastToken() })};`);
      const slots = await run(`return (await fetch('/api/pickup-slots').then(r => r.json())).slots;`);
      await run(`${api('/api/orders', { items: lines.map(([slug, quantity]) => ({ id: id(slug), quantity })), pickupAt: slots[index * 2].at, notes })};`);
    }

    // Staff move the orders along.
    await run(`${api('/api/auth/logout', {})}; ${api('/api/auth/signup', { name: 'Asha', email: 'staff@example.test', password: 'demo-staff-pass-1', acceptTerms: true })};`);
    await wait(200);
    await run(`${api('/api/auth/verify', { token: lastToken() })};`);
    const open = await run(`return (await fetch('/api/staff/orders').then(r => r.json())).orders;`);
    await run(`${api(`/api/staff/orders/${open[0].id}`, { status: 'ready' }, 'PATCH')}; ${api(`/api/staff/orders/${open[1].id}`, { status: 'preparing' }, 'PATCH')}; ${api(`/api/staff/menu/${id('banana-bread')}`, { available: false }, 'PATCH')};`);
    await go('/staff', 2000);
    await shot('staff');

    // Back to Meera's view: her order, then the menu with a basket in progress.
    await run(`${api('/api/auth/logout', {})}; ${api('/api/auth/login', { email: 'meera@example.test', password: 'demo-customer-pass' })};`);
    const mine = await run(`return (await fetch('/api/orders').then(r => r.json())).orders;`);
    await go(`/orders/${mine[0].id}`, 2000);
    await shot('order');

    await run(basket([{ id: id('cappuccino'), quantity: 1 }, { id: id('cardamom-bun'), quantity: 2 }]));
    await go('/menu', 2000);
    await shot('menu');

    await go('/checkout', 2000);
    await shot('checkout');

    await go('/visit', 4500);
    await shot('visit');

    await size(390, 844, true);
    await go('/menu', 2000);
    await run(`window.scrollTo(0, 230); await new Promise(r => setTimeout(r, 300));`);
    await shot('mobile-menu');
    await go('/', 1600);
    await shot('mobile-home');
    page.close();
  } finally {
    browser.kill();
    server.kill();
    await wait(500);
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
