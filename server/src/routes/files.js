import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import db, { FILE_DIR } from '../db.js';

const router = Router();

// List files under a folder (null => root)
router.get('/', (req, res) => {
  const parentId = req.query.folder_id ? Number(req.query.folder_id) : null;
  const rows = parentId
    ? db.prepare('SELECT * FROM files WHERE folder_id = ? ORDER BY created_at DESC').all(parentId)
    : db.prepare('SELECT * FROM files WHERE folder_id IS NULL ORDER BY created_at DESC').all();
  res.json(rows);
});

// Delete a file (and its disk object if no other row references it)
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM files WHERE id = ?').run(row.id);
  const still = db.prepare('SELECT 1 FROM files WHERE hash = ? LIMIT 1').get(row.hash);
  if (!still) {
    fs.rm(path.join(FILE_DIR, row.storage_key), { force: true }, () => {});
  }
  res.json({ ok: true });
});

// Serve a file with Range support (needed for video/audio streaming & resumable downloads)
function streamFile(req, res, row, { disposition } = {}) {
  const filePath = path.join(FILE_DIR, row.storage_key);
  if (!fs.existsSync(filePath)) return res.status(410).send('gone');

  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', row.mime || 'application/octet-stream');
  const safeName = encodeURIComponent(row.name);
  if (disposition) {
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${safeName}"; filename*=UTF-8''${safeName}`
    );
  }

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
}

// Inline preview (used by <img>, <video>, <iframe> etc.)
router.get('/:id/raw', (req, res) => {
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).send('not found');
  streamFile(req, res, row, { disposition: 'inline' });
});

export default router;
