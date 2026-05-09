import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import db, { FILE_DIR } from '../db.js';

const router = Router();

// List folders under a parent (null => root)
router.get('/', (req, res) => {
  const parentId = req.query.parent_id ? Number(req.query.parent_id) : null;
  const rows = parentId
    ? db.prepare('SELECT * FROM folders WHERE parent_id = ? ORDER BY name').all(parentId)
    : db.prepare('SELECT * FROM folders WHERE parent_id IS NULL ORDER BY name').all();
  res.json(rows);
});

// Breadcrumb path for a folder
router.get('/:id/path', (req, res) => {
  const id = Number(req.params.id);
  const out = [];
  let cur = db.prepare('SELECT id, name, parent_id FROM folders WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'folder not found' });
  while (cur) {
    out.unshift({ id: cur.id, name: cur.name });
    cur = cur.parent_id
      ? db.prepare('SELECT id, name, parent_id FROM folders WHERE id = ?').get(cur.parent_id)
      : null;
  }
  res.json(out);
});

// Create folder
router.post('/', (req, res) => {
  const { name, parent_id } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  const parent = parent_id ? Number(parent_id) : null;
  if (parent) {
    const exists = db.prepare('SELECT 1 FROM folders WHERE id = ?').get(parent);
    if (!exists) return res.status(400).json({ error: 'parent not found' });
  }
  const info = db
    .prepare('INSERT INTO folders (name, parent_id, created_at) VALUES (?, ?, ?)')
    .run(String(name).trim(), parent, Date.now());
  const row = db.prepare('SELECT * FROM folders WHERE id = ?').get(info.lastInsertRowid);
  res.json(row);
});

// Delete folder (cascade) and clean up any now-orphaned disk files
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id FROM folders WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'not found' });

  // Collect all descendant folder ids (including self)
  const all = [id];
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    const kids = db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(cur);
    for (const k of kids) { all.push(k.id); queue.push(k.id); }
  }
  const placeholders = all.map(() => '?').join(',');
  const files = db
    .prepare(`SELECT id, storage_key, hash FROM files WHERE folder_id IN (${placeholders})`)
    .all(...all);

  // FK cascade will remove sub-folders AND files rows
  db.prepare('DELETE FROM folders WHERE id = ?').run(id);

  // Remove disk files that are no longer referenced
  const seen = new Set();
  for (const f of files) {
    if (seen.has(f.hash)) continue;
    seen.add(f.hash);
    const still = db.prepare('SELECT 1 FROM files WHERE hash = ? LIMIT 1').get(f.hash);
    if (!still) {
      const p = path.join(FILE_DIR, f.storage_key);
      fs.rm(p, { force: true }, () => {});
    }
  }
  res.json({ ok: true, removed_files: files.length });
});

export default router;
