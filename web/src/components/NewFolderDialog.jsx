import React, { useState } from 'react';

export default function NewFolderDialog({ onSubmit, onClose }) {
  const [name, setName] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim());
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>新建文件夹</h3>
        <input
          autoFocus
          type="text"
          placeholder="请输入文件夹名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="actions">
          <button type="button" onClick={onClose}>取消</button>
          <button className="primary" type="submit" disabled={!name.trim()}>创建</button>
        </div>
      </form>
    </div>
  );
}
