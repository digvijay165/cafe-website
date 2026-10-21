// Opening-hours logic, worked out in the café's own time zone whatever the server's clock says.
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PREP_MINUTES = 15;
const SLOT_MINUTES = 15;

const formatters = new Map();
function localParts(date, timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'
    }));
  }
  const parts = Object.fromEntries(formatters.get(timeZone).formatToParts(date).map(part => [part.type, part.value]));
  const y = Number(parts.year), m = Number(parts.month), d = Number(parts.day);
  return { y, m, d, hour: Number(parts.hour), minute: Number(parts.minute), dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

function offsetAt(ms, timeZone) {
  const p = localParts(new Date(ms), timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute) - Math.floor(ms / 60000) * 60000;
}

// The instant at which the café's wall clock reads y-m-d hh:mm.
function zonedInstant(y, m, d, minutes, timeZone) {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let result = guess - offsetAt(guess, timeZone);
  const corrected = offsetAt(result, timeZone);
  if (corrected !== offsetAt(guess, timeZone)) result = guess - corrected;
  return result;
}

const toMinutes = hhmm => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function byDay(rows) {
  return new Map(rows.map(row => [row.day_of_week, { opens: row.opens, closes: row.closes }]));
}

// Calendar date k days after the café's local today.
function localDay(now, k, timeZone) {
  const today = localParts(now, timeZone);
  const date = new Date(Date.UTC(today.y, today.m - 1, today.d + k));
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(), dow: date.getUTCDay() };
}

function status(rows, now, timeZone) {
  const days = byDay(rows);
  const local = localParts(now, timeZone);
  const minutes = local.hour * 60 + local.minute;
  const today = days.get(local.dow) || null;
  const openNow = Boolean(today && minutes >= toMinutes(today.opens) && minutes < toMinutes(today.closes));
  let next = null;
  for (let k = 0; k < 8 && !openNow; k += 1) {
    const day = localDay(now, k, timeZone);
    const hours = days.get(day.dow);
    if (!hours || (k === 0 && minutes >= toMinutes(hours.opens))) continue;
    next = { day: k === 0 ? 'today' : k === 1 ? 'tomorrow' : DAYS[day.dow], opens: hours.opens };
    break;
  }
  return {
    openNow,
    today,
    closesAt: openNow ? today.closes : null,
    nextOpen: next,
    week: DAYS.map((name, dow) => ({ day: dow, name, ...(days.get(dow) || { opens: null, closes: null }) })),
    todayIndex: local.dow
  };
}

// Pickup times customers can choose from: every 15 minutes from 15 minutes after now (or opening)
// until 15 minutes before closing, across the next two days the café is open.
function pickupSlots(rows, now, timeZone) {
  const days = byDay(rows);
  const earliest = now.getTime() + PREP_MINUTES * 60000;
  const slots = [];
  let openDays = 0;
  for (let k = 0; k < 8 && openDays < 2; k += 1) {
    const day = localDay(now, k, timeZone);
    const hours = days.get(day.dow);
    if (!hours) continue;
    const label = k === 0 ? 'Today' : k === 1 ? 'Tomorrow' : DAYS[day.dow];
    let added = 0;
    for (let t = toMinutes(hours.opens) + PREP_MINUTES; t <= toMinutes(hours.closes) - PREP_MINUTES; t += SLOT_MINUTES) {
      const at = zonedInstant(day.y, day.m, day.d, t, timeZone);
      if (at < earliest) continue;
      const time = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      slots.push({ at: new Date(at).toISOString(), day: label, time });
      added += 1;
    }
    if (added) openDays += 1;
  }
  return slots;
}

module.exports = { status, pickupSlots, localParts, zonedInstant };
