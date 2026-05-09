const base = '';

async function req(path, opts = {}) {
  const res = await fetch(base + path, opts);
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`${res.status} ${msg}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  listFolders: (parentId) =>
    req('/api/folders' + (parentId ? `?parent_id=${parentId}` : '')),
  folderPath: (id) => req(`/api/folders/${id}/path`),
  createFolder: (name, parent_id) =>
    req('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent_id }),
    }),
  deleteFolder: (id) => req(`/api/folders/${id}`, { method: 'DELETE' }),

  listFiles: (folderId) =>
    req('/api/files' + (folderId ? `?folder_id=${folderId}` : '')),
  deleteFile: (id) => req(`/api/files/${id}`, { method: 'DELETE' }),

  checkUpload: (hash) => req(`/api/upload/check?hash=${encodeURIComponent(hash)}`),
  mergeUpload: (payload) =>
    req('/api/upload/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  // chunk upload uses XHR so we can track progress and cancel; see Uploader.jsx
};

export function publicUrl(file) {
  // Absolute URL so it is copy/share friendly even when opened through a proxy.
  return `${location.origin}/p/${file.id}/${encodeURIComponent(file.name)}`;
}

export function rawUrl(file) {
  return `/api/files/${file.id}/raw`;
}

export function formatSize(n) {
  if (!n && n !== 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
