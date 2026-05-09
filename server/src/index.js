import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import db, { FILE_DIR } from './db.js';
import { requireAuth } from './auth.js';
import authRouter from './routes/auth.js';
import foldersRouter from './routes/folders.js';
import filesRouter from './routes/files.js';
import uploadRouter from './routes/upload.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Auth routes are public; everything else under /api needs a valid token.
app.use('/api/auth', authRouter);
app.use('/api/folders', requireAuth, foldersRouter);
app.use('/api/files', requireAuth, filesRouter);
app.use('/api/upload', requireAuth, uploadRouter);

// Public download/preview link: /p/<id>/<filename>
// Supports Range requests so browsers can stream video/audio.
// Enforces per-file expiry (410 Gone after `expires_at`).
app.get('/p/:id/:name?', (req, res) => {
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).send('not found');
  if (row.expires_at && row.expires_at < Date.now()) return res.status(410).send('link expired');
  const filePath = path.join(FILE_DIR, row.storage_key);
  if (!fs.existsSync(filePath)) return res.status(410).send('gone');

  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', row.mime || 'application/octet-stream');
  const disp = req.query.download ? 'attachment' : 'inline';
  const safe = encodeURIComponent(row.name);
  res.setHeader(
    'Content-Disposition',
    `${disp}; filename="${safe}"; filename*=UTF-8''${safe}`
  );

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (!m) return res.status(416).end();
    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? parseInt(m[2], 10) : total - 1;
    if (start >= total || end >= total || start > end) {
      res.setHeader('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.setHeader('Content-Length', total);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Periodic expiry sweep: once per hour, purge expired files (rows + disk if orphaned).
function sweepExpired() {
  const now = Date.now();
  const expired = db.prepare(
    'SELECT id, storage_key, hash FROM files WHERE expires_at IS NOT NULL AND expires_at < ?'
  ).all(now);
  if (!expired.length) return;
  const delStmt = db.prepare('DELETE FROM files WHERE id = ?');
  for (const f of expired) {
    delStmt.run(f.id);
    const still = db.prepare('SELECT 1 FROM files WHERE hash = ? LIMIT 1').get(f.hash);
    if (!still) fs.rm(path.join(FILE_DIR, f.storage_key), { force: true }, () => {});
  }
  console.log(`[xoss] swept ${expired.length} expired file(s)`);
}
setInterval(sweepExpired, 60 * 60 * 1000);
sweepExpired();

app.listen(PORT, () => {
  console.log(`[xoss] server listening on http://localhost:${PORT}`);
});
