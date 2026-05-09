import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import db, { CHUNK_DIR, FILE_DIR } from '../db.js';

const router = Router();

// Chunk files are tiny-ish and we stream them to disk ourselves, so use memory storage
// but cap per-chunk size to something sensible. 20MB chunks should be more than enough.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
});

function chunkDirFor(hash) {
  return path.join(CHUNK_DIR, hash);
}

// 1) Check if a file with this hash already exists (instant upload),
//    and list which chunk indexes are already on disk for resume.
router.get('/check', (req, res) => {
  const { hash } = req.query;
  if (!hash) return res.status(400).json({ error: 'hash required' });

  const existing = db.prepare('SELECT id, name, size FROM files WHERE hash = ? LIMIT 1').get(hash);
  if (existing) {
    return res.json({ exists: true, uploaded: [] });
  }
  const dir = chunkDirFor(hash);
  let uploaded = [];
  if (fs.existsSync(dir)) {
    uploaded = fs.readdirSync(dir)
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n))
      .sort((a, b) => a - b);
  }
  res.json({ exists: false, uploaded });
});

// 2) Upload a single chunk
router.post('/chunk', upload.single('chunk'), (req, res) => {
  const { hash, index } = req.body;
  if (!hash || index === undefined || !req.file) {
    return res.status(400).json({ error: 'hash, index, chunk required' });
  }
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0) {
    return res.status(400).json({ error: 'invalid index' });
  }
  const dir = chunkDirFor(hash);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, String(idx)), req.file.buffer);
  res.json({ ok: true });
});

// 3) Merge chunks into a final file and register it in DB.
router.post('/merge', (req, res) => {
  const { hash, name, size, mime, total, folder_id } = req.body || {};
  if (!hash || !name || !total) return res.status(400).json({ error: 'hash,name,total required' });

  // If the file (by hash) already exists on disk, just register a new row (instant upload / dedup)
  const storageKey = hash;
  const finalPath = path.join(FILE_DIR, storageKey);

  if (!fs.existsSync(finalPath)) {
    const dir = chunkDirFor(hash);
    if (!fs.existsSync(dir)) return res.status(400).json({ error: 'no chunks uploaded' });

    const present = new Set(fs.readdirSync(dir).map((n) => Number(n)));
    for (let i = 0; i < Number(total); i++) {
      if (!present.has(i)) return res.status(400).json({ error: `missing chunk ${i}` });
    }

    // Synchronous concat via fd so the file is fully written before we respond.
    // We avoid buffering the entire file in memory by writing chunk-by-chunk.
    const fd = fs.openSync(finalPath, 'w');
    try {
      for (let i = 0; i < Number(total); i++) {
        const buf = fs.readFileSync(path.join(dir, String(i)));
        fs.writeSync(fd, buf, 0, buf.length);
      }
    } finally {
      fs.closeSync(fd);
    }
    fs.rm(dir, { recursive: true, force: true }, () => {});
  } else {
    // Clean up any stray chunks if the file already exists
    fs.rm(chunkDirFor(hash), { recursive: true, force: true }, () => {});
  }

  // Validate folder_id
  let folderId = folder_id ? Number(folder_id) : null;
  if (folderId) {
    const ok = db.prepare('SELECT 1 FROM folders WHERE id = ?').get(folderId);
    if (!ok) folderId = null;
  }

  const id = nanoid(10);
  db.prepare(
    `INSERT INTO files (id, name, size, mime, hash, storage_key, folder_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, Number(size) || 0, mime || null, hash, storageKey, folderId, Date.now());

  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
  res.json(row);
});

export default router;
