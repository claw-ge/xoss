import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '../data');
export const CHUNK_DIR = path.join(DATA_DIR, 'chunks');
export const FILE_DIR = path.join(DATA_DIR, 'files');

for (const d of [DATA_DIR, CHUNK_DIR, FILE_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'sqlite.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  parent_id  INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS files (
  id          TEXT PRIMARY KEY,          -- nanoid, used in public URL
  name        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  mime        TEXT,
  hash        TEXT NOT NULL,             -- md5 of full file (dedup key)
  storage_key TEXT NOT NULL,             -- disk file name (= hash)
  folder_id   INTEGER,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER,                   -- unix ms; NULL = never expires
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_files_folder  ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_files_hash    ON files(hash);
CREATE INDEX IF NOT EXISTS idx_files_expires ON files(expires_at);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
`);

// Lightweight migration: add `expires_at` to pre-existing files tables.
const cols = db.prepare('PRAGMA table_info(files)').all().map((c) => c.name);
if (!cols.includes('expires_at')) {
  db.exec('ALTER TABLE files ADD COLUMN expires_at INTEGER');
}

export default db;
