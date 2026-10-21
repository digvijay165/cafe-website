// Fixed-window rate limiting kept in memory. Good enough for a single server instance: counts reset
// on restart, which only ever errs on the side of letting a real customer back in.
const windows = new Map();

// Returns 0 when the action is allowed, or the number of seconds to wait before trying again.
function hit(key, max, windowMs) {
  const now = Date.now();
  let entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    windows.set(key, entry);
  }
  entry.count += 1;
  return entry.count > max ? Math.ceil((entry.resetAt - now) / 1000) : 0;
}

// Checks a limit without counting this attempt (used to lock an account after repeated failures).
function blocked(key, max) {
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= Date.now()) return 0;
  return entry.count >= max ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 0;
}

function reset(key) {
  windows.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) if (entry.resetAt <= now) windows.delete(key);
}, 60_000).unref();

module.exports = { hit, blocked, reset };
