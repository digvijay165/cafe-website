// Passwords, sessions and one-time email tokens. Raw tokens only ever live in the cookie or the
// emailed link; the database keeps their SHA-256 hashes, so a leaked backup cannot be used to log in.
const crypto = require('node:crypto');
const db = require('./db');
const config = require('./config');

const COOKIE = 'lantern_session';
const SESSION_DAYS = 30;
const TOKEN_HOURS = { verify: 24, reset: 1 };

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.pbkdf2Sync(password, salt, 210000, 32, 'sha256').toString('hex') };
}

// Unknown emails still pay for a full hash so response times do not reveal which accounts exist.
const DUMMY = hashPassword(crypto.randomBytes(16).toString('hex'));
function checkPassword(user, password) {
  const { hash } = hashPassword(password, user ? user.password_salt : DUMMY.salt);
  const expected = user ? user.password_hash : DUMMY.hash;
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex')) && Boolean(user);
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function setCookie(res, value, maxAgeSeconds) {
  const parts = [`${COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (config.production) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.query(
    `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '${SESSION_DAYS} days')`,
    [sha256(token), userId]
  );
  setCookie(res, token, SESSION_DAYS * 86400);
}

async function endSession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) await db.query('delete from sessions where token_hash = $1', [sha256(token)]);
  setCookie(res, '', 0);
}

// Attaches req.user (or null) from the session cookie.
async function loadUser(req, res, next) {
  req.user = null;
  const token = readCookie(req, COOKIE);
  if (!token) return next();
  try {
    const { rows } = await db.query(
      'select u.* from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()',
      [sha256(token)]
    );
    req.user = rows[0] || null;
    if (!req.user) setCookie(res, '', 0);
    // Accounts listed in OWNER_EMAILS / STAFF_EMAILS are promoted the next time they visit, so
    // adding an email on the host works for people who signed up earlier too.
    const role = req.user && configuredRole(req.user.email, req.user.role);
    if (req.user && role !== req.user.role) {
      await db.query('update users set role = $1 where id = $2', [role, req.user.id]);
      req.user.role = role;
    }
    next();
  } catch (error) {
    next(error);
  }
}

// The role an email should have given the env lists. Only ever promotes: demoting is done by the
// owner from the dashboard.
const RANK = { customer: 0, staff: 1, owner: 2 };
function configuredRole(email, current) {
  const wanted = config.ownerEmails.includes(email) ? 'owner' : config.staffEmails.includes(email) ? 'staff' : 'customer';
  return RANK[wanted] > RANK[current] ? wanted : current;
}

async function issueToken(userId, purpose) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.query('delete from auth_tokens where user_id = $1 and purpose = $2', [userId, purpose]);
  await db.query(
    `insert into auth_tokens (token_hash, user_id, purpose, expires_at) values ($1, $2, $3, now() + interval '${TOKEN_HOURS[purpose]} hours')`,
    [sha256(token), userId, purpose]
  );
  return token;
}

// Returns the user id the token was issued to and deletes it, or null if it is unknown or expired.
async function useToken(token, purpose) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const { rows } = await db.query(
    'delete from auth_tokens where token_hash = $1 and purpose = $2 returning user_id, expires_at > now() as valid',
    [sha256(token), purpose]
  );
  return rows[0]?.valid ? rows[0].user_id : null;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role,
    emailVerified: Boolean(user.email_verified_at), onboarded: Boolean(user.onboarded_at), createdAt: user.created_at
  };
}

module.exports = { configuredRole, hashPassword, checkPassword, startSession, endSession, loadUser, issueToken, useToken, publicUser };
