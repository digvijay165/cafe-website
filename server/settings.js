// Café details the owner edits from the dashboard. They are stored in the settings table and copied
// over config.cafe, so every page, email and API response picks them up without a restart. Time
// zone, currency and locale stay in the environment: changing them would shift existing orders.
const config = require('./config');

const FIELDS = {
  name: { max: 60, min: 2, label: 'Café name' },
  tagline: { max: 140, min: 0, label: 'Tagline' },
  address: { max: 200, min: 5, label: 'Address' },
  phone: { max: 20, min: 7, label: 'Phone', pattern: /^\+?[0-9 ()-]{7,20}$/, hint: 'Use digits, spaces and an optional +.' },
  email: { max: 200, min: 3, label: 'Email', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, hint: 'Enter a valid email address.' },
  latitude: { number: true, range: [-90, 90], label: 'Latitude' },
  longitude: { number: true, range: [-180, 180], label: 'Longitude' }
};

function apply(rows) {
  for (const { key, value } of rows) {
    if (!FIELDS[key]) continue;
    config.cafe[key] = FIELDS[key].number ? Number(value) : value;
  }
}

async function load(db) {
  const { rows } = await db.query('select key, value from settings');
  apply(rows);
}

// Returns { values } ready to save, or { fields } with a message per invalid field.
function validate(input) {
  const values = {};
  const fields = {};
  for (const [key, rule] of Object.entries(FIELDS)) {
    if (input[key] === undefined) continue;
    if (rule.number) {
      const number = Number(input[key]);
      if (input[key] === '' || !Number.isFinite(number) || number < rule.range[0] || number > rule.range[1]) fields[key] = `${rule.label} must be between ${rule.range[0]} and ${rule.range[1]}.`;
      else values[key] = String(number);
      continue;
    }
    const value = typeof input[key] === 'string' ? input[key].trim() : '';
    if (value.length < rule.min || value.length > rule.max) fields[key] = rule.min ? `${rule.label} needs ${rule.min}–${rule.max} characters.` : `${rule.label} can be up to ${rule.max} characters.`;
    else if (rule.pattern && !rule.pattern.test(value)) fields[key] = rule.hint;
    else values[key] = value;
  }
  return { values, fields };
}

async function save(db, values) {
  for (const [key, value] of Object.entries(values)) {
    await db.query('insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value', [key, value]);
  }
  apply(Object.entries(values).map(([key, value]) => ({ key, value })));
}

module.exports = { load, validate, save };
