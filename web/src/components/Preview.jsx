import React, { useEffect, useState } from 'react';
import { rawUrl, publicUrl } from '../api.js';

function kind(file) {
  const m = (file.mime || '').toLowerCase();
  const n = file.name.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (
    m.startsWith('text/') ||
    /\.(txt|md|json|js|jsx|ts|tsx|html|css|xml|yml|yaml|csv|log|py|go|rs|java|c|cpp|h|sh|toml|ini|conf)$/.test(n)
  ) {
    return 'text';
  }
  return 'other';
}

export default function Preview({ file, onClose }) {
  const k = kind(file);
  const [text, setText] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (k !== 'text') return;
    let ok = true;
    // Cap text preview at 1MB to keep the browser snappy
    fetch(rawUrl(file), { headers: { Range: 'bytes=0-1048575' } })
      .then((r) => r.text())
      .then((t) => { if (ok) setText(t); })
      .catch((e) => { if (ok) setErr(String(e)); });
    return () => { ok = false; };
  }, [file.id, k]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-head">
          <span className="name" title={file.name}>{file.name}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <a className="btn" href={publicUrl(file)} target="_blank" rel="noreferrer">新窗口打开</a>
            <a className="btn" href={publicUrl(file) + '?download=1'}>下载</a>
            <button onClick={onClose}>关闭</button>
          </div>
        </div>
        <div className="preview-body">
          {k === 'image' && <img src={rawUrl(file)} alt={file.name} />}
          {k === 'video' && <video src={rawUrl(file)} controls autoPlay />}
          {k === 'audio' && <audio src={rawUrl(file)} controls autoPlay />}
          {k === 'pdf' && <iframe src={rawUrl(file)} title={file.name} />}
          {k === 'text' && (
            err
              ? <pre>无法加载：{err}</pre>
              : text == null ? <pre>加载中…</pre> : <pre>{text}</pre>
          )}
          {k === 'other' && (
            <pre>此文件类型暂不支持在线预览，请使用"下载"按钮。</pre>
          )}
        </div>
      </div>
    </div>
  );
}
