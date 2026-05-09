import React, { useCallback, useRef, useState } from 'react';
import SparkMD5 from 'spark-md5';
import { api } from '../api.js';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

// Compute md5 hash of a file by streaming chunks into SparkMD5.
// Reports progress via onProgress(0..1).
function computeHash(file, onProgress) {
  return new Promise((resolve, reject) => {
    const spark = new SparkMD5.ArrayBuffer();
    const total = Math.ceil(file.size / CHUNK_SIZE);
    let index = 0;
    const reader = new FileReader();
    const readNext = () => {
      if (index >= total) {
        resolve(spark.end());
        return;
      }
      const start = index * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      reader.readAsArrayBuffer(file.slice(start, end));
    };
    reader.onload = (e) => {
      spark.append(e.target.result);
      index++;
      if (onProgress) onProgress(index / total);
      readNext();
    };
    reader.onerror = () => reject(reader.error);
    readNext();
  });
}

function uploadChunk(blob, hash, index, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/chunk');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`chunk ${index} failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error(`chunk ${index} network error`));
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

export default function Uploader({ folderId, onUploaded }) {
  const [items, setItems] = useState([]); // { id, name, size, progress, status, error }
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);
  const abortRefs = useRef(new Map());

  const update = (id, patch) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const handleFiles = useCallback(async (files) => {
    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setItems((list) => [
        ...list,
        { id, name: file.name, size: file.size, progress: 0, status: 'hashing' },
      ]);

      const abort = new AbortController();
      abortRefs.current.set(id, abort);

      try {
        // Hashing phase (0 -> 15% of bar)
        const hash = await computeHash(file, (p) => update(id, { progress: p * 0.15 }));

        // Check server-side for existing chunks / instant upload
        const check = await api.checkUpload(hash);
        if (check.exists) {
          update(id, { progress: 0.95, status: 'merging' });
          const row = await api.mergeUpload({
            hash,
            name: file.name,
            size: file.size,
            mime: file.type,
            total: Math.ceil(file.size / CHUNK_SIZE),
            folder_id: folderId,
          });
          update(id, { progress: 1, status: 'done' });
          onUploaded?.(row);
          continue;
        }

        const total = Math.ceil(file.size / CHUNK_SIZE) || 1;
        const uploadedSet = new Set(check.uploaded || []);
        update(id, { status: 'uploading' });

        // Sequential chunk upload — simple & predictable for resume.
        // Could parallelize with a worker pool for speed.
        for (let i = 0; i < total; i++) {
          if (uploadedSet.has(i)) {
            const base = 0.15 + (i / total) * 0.8;
            update(id, { progress: base });
            continue;
          }
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const blob = file.slice(start, end);
          await uploadChunk(blob, hash, i, (p) => {
            const base = 0.15 + (i / total) * 0.8;
            const step = (1 / total) * 0.8;
            update(id, { progress: base + p * step });
          }, abort.signal);
        }

        update(id, { progress: 0.95, status: 'merging' });
        const row = await api.mergeUpload({
          hash,
          name: file.name,
          size: file.size,
          mime: file.type,
          total,
          folder_id: folderId,
        });
        update(id, { progress: 1, status: 'done' });
        onUploaded?.(row);
      } catch (err) {
        update(id, { status: 'error', error: String(err.message || err) });
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
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) handleFiles(files);
  };

  const cancel = (id) => {
    abortRefs.current.get(id)?.abort();
  };

  const clearDone = () => setItems((l) => l.filter((it) => it.status !== 'done'));

  return (
    <div>
      <div
        className={'drop-zone' + (dragActive ? ' active' : '')}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        <div><strong>点击或拖拽文件到此处上传</strong></div>
        <div className="hint">支持大文件分片上传 / 断点续传 / 相同文件秒传</div>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={onInputChange}
        />
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
                {it.status === 'hashing' && '计算哈希'}
                {it.status === 'uploading' && `${Math.round(it.progress * 100)}%`}
                {it.status === 'merging' && '合并中'}
                {it.status === 'done' && '已完成'}
                {it.status === 'error' && '失败'}
              </span>
              {(it.status === 'uploading' || it.status === 'hashing') && (
                <button className="danger" onClick={() => cancel(it.id)}>取消</button>
              )}
            </div>
          ))}
          {items.some((it) => it.status === 'done') && (
            <div style={{ textAlign: 'right' }}>
              <button onClick={clearDone}>清除已完成</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
