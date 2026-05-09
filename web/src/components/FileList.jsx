import React from 'react';
import { formatSize, formatExpiry, publicUrl } from '../api.js';

function iconFor(file) {
  const m = (file.mime || '').toLowerCase();
  const n = file.name.toLowerCase();
  if (m.startsWith('image/')) return '🖼️';
  if (m.startsWith('video/')) return '🎬';
  if (m.startsWith('audio/')) return '🎵';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return '📕';
  if (/\.(zip|rar|7z|tar|gz|bz2|xz)$/.test(n)) return '🗜️';
  if (/\.(txt|md|json|js|jsx|ts|tsx|html|css|xml|yml|yaml|log|py|go|rs|java|c|cpp|h|sh)$/.test(n)) return '📄';
  return '📦';
}

function ExpiryBadge({ expiresAt }) {
  if (!expiresAt) return null;
  const diff = expiresAt - Date.now();
  const expired = diff <= 0;
  const soon = !expired && diff < 24 * 3600 * 1000; // < 1 day
  return (
    <span className={'expiry-badge' + (expired ? ' expired' : soon ? ' soon' : '')}>
      {expired ? '已过期' : formatExpiry(expiresAt)}
    </span>
  );
}

export default function FileList({
  folders, files,
  onEnterFolder, onDeleteFolder,
  onDeleteFile, onPreview, onShare,
}) {
  if (folders.length === 0 && files.length === 0) {
    return <div className="empty">此目录为空。拖拽文件到上方区域即可上传。</div>;
  }

  return (
    <ul className="file-list">
      {folders.map((f) => (
        <li key={'folder-' + f.id}>
          <span className="icon">📁</span>
          <span className="name">
            <a onClick={() => onEnterFolder(f)}>{f.name}</a>
          </span>
          <span className="meta">文件夹</span>
          <span className="actions">
            <button className="danger" onClick={() => onDeleteFolder(f)}>删除</button>
          </span>
        </li>
      ))}
      {files.map((f) => (
        <li key={'file-' + f.id}>
          <span className="icon">{iconFor(f)}</span>
          <span className="name">
            <a onClick={() => onPreview(f)} title={f.name}>{f.name}</a>
            <ExpiryBadge expiresAt={f.expires_at} />
          </span>
          <span className="meta">{formatSize(f.size)}</span>
          <span className="actions">
            <button onClick={() => onPreview(f)}>预览</button>
            <button onClick={() => onShare(f)}>分享</button>
            <button className="danger" onClick={() => onDeleteFile(f)}>删除</button>
          </span>
        </li>
      ))}
    </ul>
  );
}
