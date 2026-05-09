import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import db, { FILE_DIR } from './db.js';
import foldersRouter from './routes/folders.js';
import filesRouter from './routes/files.js';
import uploadRouter from './routes/upload.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/folders', foldersRouter);
app.use('/api/files', filesRouter);
app.use('/api/upload', uploadRouter);

// Public download/preview link: /p/<id>/<filename>
// Supports Range requests so browsers can stream video/audio.
app.get('/p/:id/:name?', (req, res) => {
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).send('not found');
  const filePath = path.join(FILE_DIR, row.storage_key);
  if (!fs.existsSync(filePath)) return res.status(410).send('gone');

  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', row.mime || 'application/octet-stream');
  // Default to inline so images/videos open in the browser; `?download=1` forces download
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

app.listen(PORT, () => {
  console.log(`[xoss] server listening on http://localhost:${PORT}`);
});
