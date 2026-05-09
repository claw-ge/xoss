const base = '';
const TOKEN_KEY = 'xoss.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

// Listeners get notified when the server rejects our token so the UI can log out.
const authListeners = new Set();
export function onAuthFailure(fn) {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}
function handleAuthFail() {
  setToken('');
  for (const fn of authListeners) fn();
}

function authHeaders(extra) {
  const t = getToken();
  return t ? { ...(extra || {}), Authorization: `Bearer ${t}` } : (extra || {});
}

async function req(path, opts = {}) {
  const res = await fetch(base + path, {
    ...opts,
    headers: authHeaders(opts.headers),
  });
  if (res.status === 401) {
    handleAuthFail();
    throw new Error('401 unauthorized');
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`${res.status} ${msg}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  // auth
  authStatus: () => req('/api/auth/status'),
  setupAdmin: (username, password) =>
    req('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  login: (username, password) =>
    req('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  me: () => req('/api/auth/me'),

  // folders
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

  // files
  listFiles: (folderId) =>
    req('/api/files' + (folderId ? `?folder_id=${folderId}` : '')),
  deleteFile: (id) => req(`/api/files/${id}`, { method: 'DELETE' }),
  setExpiry: (id, expires_at) =>
    req(`/api/files/${id}/expiry`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_at }),
    }),

  // upload
  checkUpload: (hash) => req(`/api/upload/check?hash=${encodeURIComponent(hash)}`),
  mergeUpload: (payload) =>
    req('/api/upload/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  // chunk upload uses XHR (see Uploader.jsx) so we can track progress + cancel.
  authHeaders, // exported so Uploader can attach Authorization to XHR
};

export function publicUrl(file) {
  return `${location.origin}/p/${file.id}/${encodeURIComponent(file.name)}`;
}

export function rawUrl(file) {
  // rawUrl is used by <img>/<video>/<iframe> which can't set an Authorization header.
  // We fall back to the public /p link (which does not require auth) for in-app preview.
  return publicUrl(file);
}

export function formatSize(n) {
  if (!n && n !== 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatExpiry(ms) {
  if (!ms) return '永久有效';
  const diff = ms - Date.now();
  if (diff <= 0) return '已过期';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
