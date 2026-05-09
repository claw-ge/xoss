import React, { useCallback, useRef, useState } from 'react';
import SparkMD5 from 'spark-md5';
import { api, getToken } from '../api.js';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk
const CONCURRENCY = 4;               // parallel chunk uploads

// ── MD5 hash via SparkMD5 (streaming, reports 0→1 progress) ────────────────
function computeHash(file, onProgress) {
  return new Promise((resolve, reject) => {
    const spark = new SparkMD5.ArrayBuffer();
    const total = Math.ceil(file.size / CHUNK_SIZE) || 1;
    let idx = 0;
    const reader = new FileReader();
    const readNext = () => {
      if (idx >= total) { resolve(spark.end()); return; }
      reader.readAsArrayBuffer(file.slice(idx * CHUNK_SIZE, Math.min((idx + 1) * CHUNK_SIZE, file.size)));
    };
    reader.onload = (e) => {
      spark.append(e.target.result);
      idx++;
      onProgress?.(idx / total);
      readNext();
    };
    reader.onerror = () => reject(reader.error);
    readNext();
  });
}

// ── Upload a single chunk via XHR (progress + cancel support) ───────────────
function uploadChunk(blob, hash, index, onBytes, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/chunk');
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onBytes?.(e.loaded, e.total); };
    xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`chunk ${index}: HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error(`chunk ${index}: network error`));
    xhr.onabort = () => reject(new Error('aborted'));
    if (signal) {
      if (signal.aborted) { xhr.abort(); return; }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    const fd = new FormData();
    fd.append('hash', hash);
    fd.append('index', String(index));
    fd.append('chunk', blob);
    xhr.send(fd);
  });
}

// ── Bounded concurrency pool ─────────────────────────────────────────────────
async function pool(tasks, concurrency, signal) {
  const queue = [...tasks];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      if (signal?.aborted) throw new Error('aborted');
      const task = queue.shift();
      if (task) await task();
    }
  });
  await Promise.all(workers);
}

export default function Uploader({ folderId, onUploaded }) {
  const [items, setItems] = useState([]);
  const [drag, setDrag]   = useState(false);
  const inputRef   = useRef(null);
  const abortRefs  = useRef(new Map());

  const update = (id, patch) =>
    setItems((l) => l.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const handleFiles = useCallback(async (files) => {
    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setItems((l) => [...l, { id, name: file.name, size: file.size, progress: 0, status: 'hashing', speed: '' }]);

      const abort = new AbortController();
      abortRefs.current.set(id, abort);

      try {
        // ── Phase 1: hash (fills 0→15% of progress bar) ──────────────────
        const hash = await computeHash(file, (p) => update(id, { progress: p * 0.15 }));

        // ── Phase 2: check server for existing file / uploaded chunks ─────
        const check = await api.checkUpload(hash);

        if (check.exists) {
          // Instant / dedup upload: file already stored, just register a new row.
          update(id, { progress: 0.95, status: 'merging' });
          const total = Math.ceil(file.size / CHUNK_SIZE) || 1;
          const row = await api.mergeUpload({ hash, name: file.name, size: file.size, mime: file.type, total, folder_id: folderId });
          update(id, { progress: 1, status: 'done' });
          onUploaded?.(row);
          continue;
        }

        // ── Phase 3: parallel chunk upload (fills 15→95%) ─────────────────
        const total = Math.ceil(file.size / CHUNK_SIZE) || 1;
        const uploadedSet = new Set(check.uploaded || []);
        update(id, { status: 'uploading' });

        // Per-chunk byte-level progress accumulators.
        const chunkLoaded  = new Array(total).fill(0);
        const chunkSizes   = Array.from({ length: total }, (_, i) =>
          Math.min(CHUNK_SIZE, file.size - i * CHUNK_SIZE)
        );
        const totalBytes   = chunkSizes.reduce((s, v) => s + v, 0) || 1;
        // Chunks already on the server count as fully loaded.
        for (const i of uploadedSet) if (chunkLoaded[i] !== undefined) chunkLoaded[i] = chunkSizes[i];

        let speedBytes = 0, speedTs = Date.now();

        const onBytes = (chunkIdx, loaded, _total) => {
          const prev = chunkLoaded[chunkIdx];
          chunkLoaded[chunkIdx] = loaded;
          const delta = loaded - prev;
          speedBytes += delta;
          const now = Date.now();
          if (now - speedTs >= 400) {
            const elapsed = (now - speedTs) / 1000;
            const bps = speedBytes / elapsed;
            speedBytes = 0; speedTs = now;
            const done = chunkLoaded.reduce((s, v) => s + v, 0);
            update(id, {
              progress: 0.15 + (done / totalBytes) * 0.8,
              speed: fmtSpeed(bps),
            });
          } else {
            const done = chunkLoaded.reduce((s, v) => s + v, 0);
            update(id, { progress: 0.15 + (done / totalBytes) * 0.8 });
          }
        };

        const tasks = Array.from({ length: total }, (_, i) => async () => {
          if (uploadedSet.has(i)) return;
          const blob = file.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, file.size));
          await uploadChunk(blob, hash, i, (loaded, sz) => onBytes(i, loaded, sz), abort.signal);
          chunkLoaded[i] = chunkSizes[i]; // mark full on success
        });

        await pool(tasks, CONCURRENCY, abort.signal);

        // ── Phase 4: merge ────────────────────────────────────────────────
        update(id, { progress: 0.95, status: 'merging', speed: '' });
        const row = await api.mergeUpload({ hash, name: file.name, size: file.size, mime: file.type, total, folder_id: folderId });
        update(id, { progress: 1, status: 'done', speed: '' });
        onUploaded?.(row);
      } catch (err) {
        if (err.message === 'aborted') {
          update(id, { status: 'cancelled', speed: '' });
        } else {
          update(id, { status: 'error', error: String(err.message || err), speed: '' });
        }
      } finally {
        abortRefs.current.delete(id);
      }
    }
  }, [folderId, onUploaded]);

  const onInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) handleFiles(files);
    e.target.value = '';
  };
  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) handleFiles(files);
  };

  const cancel   = (id) => abortRefs.current.get(id)?.abort();
  const clearDone = () => setItems((l) => l.filter((it) => it.status !== 'done' && it.status !== 'cancelled'));

  return (
    <div>
      <div
        className={'drop-zone' + (drag ? ' active' : '')}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <div><strong>点击或拖拽文件到此处上传</strong></div>
        <div className="hint">分片并发上传（{CONCURRENCY} 路）· 断点续传 · 相同文件秒传</div>
        <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={onInputChange} />
      </div>

      {items.length > 0 && (
        <div className="progress-list">
          {items.map((it) => (
            <div key={it.id} className={'progress-item ' + it.status}>
              <span className="name" title={it.name}>{it.name}</span>
              <div className="progress-bar">
                <div style={{ width: `${Math.round(it.progress * 100)}%` }} />
              </div>
              <span className="state">
                {it.status === 'hashing'    && '计算中'}
                {it.status === 'uploading'  && (it.speed ? it.speed : `${Math.round(it.progress * 100)}%`)}
                {it.status === 'merging'    && '合并中'}
                {it.status === 'done'       && '完成 ✓'}
                {it.status === 'cancelled'  && '已取消'}
                {it.status === 'error'      && '失败'}
              </span>
              {(it.status === 'uploading' || it.status === 'hashing') && (
                <button className="danger" onClick={() => cancel(it.id)}>取消</button>
              )}
            </div>
          ))}
          {items.some((it) => it.status === 'done' || it.status === 'cancelled') && (
            <div style={{ textAlign: 'right' }}>
              <button onClick={clearDone}>清除已完成</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtSpeed(bps) {
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
}
