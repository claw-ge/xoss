import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, getToken, setToken, onAuthFailure } from './api.js';
import Login from './components/Login.jsx';
import Uploader from './components/Uploader.jsx';
import Breadcrumb from './components/Breadcrumb.jsx';
import FileList from './components/FileList.jsx';
import NewFolderDialog from './components/NewFolderDialog.jsx';
import Preview from './components/Preview.jsx';
import ShareDialog from './components/ShareDialog.jsx';

export default function App() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authed, setAuthed]       = useState(!!getToken());
  const [username, setUsername]   = useState('');

  // Subscribe to 401s so we log out automatically if token expires.
  useEffect(() => onAuthFailure(() => { setAuthed(false); setUsername(''); }), []);

  // Verify existing token on mount.
  useEffect(() => {
    if (!authed) return;
    api.me()
      .then((me) => setUsername(me.username))
      .catch(() => { setAuthed(false); setToken(''); });
  }, [authed]);

  const handleAuthed = (token, name) => {
    setToken(token);
    setUsername(name);
    setAuthed(true);
  };
  const handleLogout = () => {
    setToken('');
    setAuthed(false);
    setUsername('');
    setFolderId(null);
    setBreadcrumb([]);
    setFolders([]);
    setFiles([]);
  };

  // ── File-manager state ────────────────────────────────────────────────────
  const [folderId, setFolderId]       = useState(null);
  const [breadcrumb, setBreadcrumb]   = useState([]);
  const [folders, setFolders]         = useState([]);
  const [files, setFiles]             = useState([]);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [preview, setPreview]         = useState(null);
  const [shareFile, setShareFile]     = useState(null);
  const [toast, setToast]             = useState('');
  const toastTimer                    = useRef(null);

  const flash = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2000);
  };

  const refresh = useCallback(async (id = folderId) => {
    const [fld, fls, path] = await Promise.all([
      api.listFolders(id),
      api.listFiles(id),
      id ? api.folderPath(id) : Promise.resolve([]),
    ]);
    setFolders(fld);
    setFiles(fls);
    setBreadcrumb(path);
  }, [folderId]);

  useEffect(() => { if (authed) refresh(folderId); }, [authed, folderId, refresh]);

  const navigate = (id) => setFolderId(id);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleCreateFolder = async (name) => {
    await api.createFolder(name, folderId);
    setShowNewFolder(false);
    refresh();
  };

  const handleDeleteFolder = async (f) => {
    if (!confirm(`确定删除文件夹 "${f.name}" 及其全部内容？`)) return;
    await api.deleteFolder(f.id);
    refresh();
  };

  const handleDeleteFile = async (f) => {
    if (!confirm(`确定删除文件 "${f.name}"？`)) return;
    await api.deleteFile(f.id);
    refresh();
  };

  const handleCopy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      flash('链接已复制到剪贴板 ✓');
    } catch {
      prompt('复制下面的链接：', url);
    }
  };

  // Save expiry from ShareDialog, then update the local files array in-place
  // so the badge refreshes without a full reload.
  const handleSaveExpiry = async (fileId, expiresAt) => {
    const updated = await api.setExpiry(fileId, expiresAt);
    setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    setShareFile((prev) => (prev && prev.id === updated.id ? updated : prev));
    flash('有效期已更新 ✓');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (!authed) return <Login onAuthed={handleAuthed} />;

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>xoss</h1>
          <div className="muted">轻量级文件管理 · 分片并发上传 · 断点续传</div>
        </div>
        <div className="user-bar">
          <span className="muted">{username}</span>
          <button onClick={handleLogout}>退出登录</button>
        </div>
      </div>

      <div className="toolbar">
        <Breadcrumb path={breadcrumb} onNavigate={navigate} />
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowNewFolder(true)}>新建文件夹</button>
        <button onClick={() => refresh()}>刷新</button>
      </div>

      <Uploader folderId={folderId} onUploaded={() => refresh()} />

      <div style={{ height: 16 }} />

      <div className="card">
        <FileList
          folders={folders}
          files={files}
          onEnterFolder={(f) => navigate(f.id)}
          onDeleteFolder={handleDeleteFolder}
          onDeleteFile={handleDeleteFile}
          onPreview={(f) => setPreview(f)}
          onShare={(f) => setShareFile(f)}
        />
      </div>

      {showNewFolder && (
        <NewFolderDialog
          onSubmit={handleCreateFolder}
          onClose={() => setShowNewFolder(false)}
        />
      )}

      {preview && <Preview file={preview} onClose={() => setPreview(null)} />}

      {shareFile && (
        <ShareDialog
          file={shareFile}
          onCopy={handleCopy}
          onSave={(expiresAt) => handleSaveExpiry(shareFile.id, expiresAt)}
          onClose={() => setShareFile(null)}
        />
      )}

      {toast && (
        <div className="toast">{toast}</div>
      )}
    </div>
  );
}
