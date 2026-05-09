import { Router } from 'express';
import db from '../db.js';
import { hashPassword, verifyPassword, signToken, requireAuth, hasAnyUser } from '../auth.js';

const router = Router();

// Whether first-time setup is required (no users yet).
router.get('/status', (_req, res) => {
  res.json({ needs_setup: !hasAnyUser() });
});

// Create the first admin (only allowed when no users exist).
router.post('/setup', (req, res) => {
  if (hasAnyUser()) return res.status(400).json({ error: 'already initialized' });
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username/password required' });
  if (String(password).length < 6) return res.status(400).json({ error: 'password too short' });

  const info = db.prepare(
    'INSERT INTO users(username, password_hash, created_at) VALUES (?, ?, ?)'
  ).run(String(username).trim(), hashPassword(String(password)), Date.now());

  const token = signToken({ uid: info.lastInsertRowid, username: String(username).trim() });
  res.json({ token, username: String(username).trim() });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username/password required' });
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
  if (!row || !verifyPassword(String(password), row.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = signToken({ uid: row.id, username: row.username });
  res.json({ token, username: row.username });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});

export default router;
