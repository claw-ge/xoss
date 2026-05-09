import React, { useMemo, useState } from 'react';
import { publicUrl, formatExpiry } from '../api.js';

const PRESETS = [
  { label: '永久', value: 0 },
  { label: '1 小时', value: 60 * 60 * 1000 },
  { label: '1 天',  value: 24 * 60 * 60 * 1000 },
  { label: '7 天',  value: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 天', value: 30 * 24 * 60 * 60 * 1000 },
];

// Format a Date into the value shape required by <input type="datetime-local">.
function toLocalInput(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ShareDialog({ file, onSave, onCopy, onClose }) {
  const [preset, setPreset] = useState(() => {
    if (!file.expires_at) return 0;
    const diff = file.expires_at - Date.now();
    const match = PRESETS.find((p) => p.value && Math.abs(p.value - diff) < 60 * 1000);
    return match ? match.value : -1; // -1 => custom
  });
  const [custom, setCustom] = useState(() =>
    file.expires_at ? toLocalInput(file.expires_at) : toLocalInput(Date.now() + 24 * 3600 * 1000)
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const targetExpiresAt = useMemo(() => {
    if (preset === 0) return null;
    if (preset === -1) {
      const t = new Date(custom).getTime();
      return Number.isFinite(t) ? t : null;
    }
    return Date.now() + preset;
  }, [preset, custom]);

  const url = publicUrl(file);

  const save = async () => {
    setErr('');
    if (preset !== 0 && (!targetExpiresAt || targetExpiresAt <= Date.now())) {
      setErr('请选择一个将来的时间');
      return;
    }
    setBusy(true);
    try {
      await onSave(targetExpiresAt);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal share" onClick={(e) => e.stopPropagation()}>
        <h3>分享 · {file.name}</h3>

        <div className="field">
          <label>公网链接</label>
          <div className="link-row">
            <input type="text" readOnly value={url} onFocus={(e) => e.target.select()} />
            <button className="primary" onClick={() => onCopy(url)}>复制</button>
          </div>
        </div>

        <div className="field">
          <label>有效期</label>
          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className={preset === p.value ? 'active' : ''}
                onClick={() => setPreset(p.value)}
              >{p.label}</button>
            ))}
            <button
              type="button"
              className={preset === -1 ? 'active' : ''}
              onClick={() => setPreset(-1)}
            >自定义</button>
          </div>
          {preset === -1 && (
            <input
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              style={{ marginTop: 8 }}
            />
          )}
          <div className="muted" style={{ marginTop: 6 }}>
            当前：{formatExpiry(file.expires_at)}
            {preset !== 0 && targetExpiresAt && (
              <> · 保存后：{formatExpiry(targetExpiresAt)}</>
            )}
            {preset === 0 && <> · 保存后：永久有效</>}
          </div>
        </div>

        {err && <div className="error">{err}</div>}

        <div className="actions">
          <button type="button" onClick={onClose}>关闭</button>
          <button type="button" className="primary" onClick={save} disabled={busy}>
            {busy ? '保存中…' : '保存有效期'}
          </button>
        </div>
      </div>
    </div>
  );
}
