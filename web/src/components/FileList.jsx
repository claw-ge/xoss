import React from 'react';
import { formatSize, publicUrl } from '../api.js';

function iconFor(file) {
  const m = (file.mime || '').toLowerCase();
  const n = file.name.toLowerCase();
  if (m.startsWith('image/')) return '🖼️';
  if (m.startsWith('video/')) return '🎬';
  if (m.startsWith('audio/')) return '🎵';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return '📕';
  if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return '🗜️';
  if (/\.(txt|md|json|js|jsx|ts|tsx|html|css|xml|yml|yaml|log|py)$/.test(n)) return '📄';
  return '📦';
}

export default function FileList({ folders, files, onEnterFolder, onDeleteFolder, onDeleteFile, onPreview, onCopy }) {
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
          </span>
          <span className="meta">{formatSize(f.size)}</span>
          <span className="actions">
            <button onClick={() => onPreview(f)}>预览</button>
            <button onClick={() => onCopy(publicUrl(f))}>复制链接</button>
            <button className="danger" onClick={() => onDeleteFile(f)}>删除</button>
          </span>
        </li>
      ))}
    </ul>
  );
}
