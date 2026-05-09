import crypto from 'node:crypto';
import db from './db.js';

// Server-side secret used to sign tokens. Persisted in `meta` so tokens
// survive restarts. If JWT_SECRET env is set, it overrides the stored one.
function getOrCreateSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('jwt_secret');
  if (row) return row.value;
  const s = crypto.randomBytes(48).toString('hex');
  db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)').run('jwt_secret', s);
  return s;
}
const SECRET = getOrCreateSecret();

// scrypt-based password hashing: "scrypt$<N>$<r>$<p>$<salt>$<hash>"
const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1, KEY_LEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, saltHex, keyHex] = stored.split('$');
    if (algo !== 'scrypt') return false;
    const key = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), KEY_LEN, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    const expected = Buffer.from(keyHex, 'hex');
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// Minimal signed token (HMAC-SHA256 over base64url JSON payload). 7 day expiry by default.
const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000;
const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64urlDecode = (s) => Buffer.from(
  s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4), 'base64',
);

export function signToken(payload) {
  const body = { ...payload, iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS };
  const part = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', SECRET).update(part).digest();
  return `${part}.${b64url(sig)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const idx = token.indexOf('.');
  if (idx < 0) return null;
  const part = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(part).digest());
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const body = JSON.parse(b64urlDecode(part).toString('utf8'));
    if (!body.exp || body.exp < Date.now()) return null;
    return body;
  } catch {
    return null;
  }
}

// Express middleware: require a valid bearer token.
export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  const token = m ? m[1] : null;
  const payload = verifyToken(token);
  if (!payload || !payload.uid) return res.status(401).json({ error: 'unauthorized' });
  req.user = { id: payload.uid, username: payload.username };
  next();
}

export function hasAnyUser() {
  return !!db.prepare('SELECT 1 FROM users LIMIT 1').get();
}
