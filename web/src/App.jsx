import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Uploader from './components/Uploader.jsx';
import Breadcrumb from './components/Breadcrumb.jsx';
import FileList from './components/FileList.jsx';
import NewFolderDialog from './components/NewFolderDialog.jsx';
import Preview from './components/Preview.jsx';

export default function App() {
  const [folderId, setFolderId] = useState(null); // null = root
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useState('');

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

  useEffect(() => { refresh(folderId); }, [folderId, refresh]);

  const navigate = (id) => setFolderId(id);

  const handleCreateFolder = async (name) => {
    await api.createFolder(name, folderId);
    setShowNewFolder(false);
    refresh();
  };

  const handleDeleteFolder = async (f) => {
    if (!confirm(`确定删除文件夹 "${f.name}" 及其全部内容?`)) return;
    await api.deleteFolder(f.id);
    refresh();
  };

  const handleDeleteFile = async (f) => {
    if (!confirm(`确定删除文件 "${f.name}"?`)) return;
    await api.deleteFile(f.id);
    refresh();
  };

  const handleCopy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      flash('链接已复制到剪贴板');
    } catch {
      // Fallback: show the url for manual copy
      prompt('复制下面的链接:', url);
    }
  };

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  };

  return (
    <div className="app">
      <div className="header">
        <div>
          <h1>xoss</h1>
          <div className="muted">轻量级文件管理 · 分片上传 · 断点续传</div>
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
          onCopy={handleCopy}
        />
      </div>

      {showNewFolder && (
        <NewFolderDialog
          onSubmit={handleCreateFolder}
          onClose={() => setShowNewFolder(false)}
        />
      )}

      {preview && <Preview file={preview} onClose={() => setPreview(null)} />}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1f2328', color: 'white', padding: '8px 14px',
          borderRadius: 6, fontSize: 13, zIndex: 100,
        }}>{toast}</div>
      )}
    </div>
  );
}
