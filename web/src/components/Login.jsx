import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Login({ onAuthed }) {
  const [needsSetup, setNeedsSetup] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.authStatus()
      .then((s) => setNeedsSetup(!!s.needs_setup))
      .catch(() => setNeedsSetup(false));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!username.trim() || !password) { setErr('请填写用户名和密码'); return; }
    if (needsSetup && password !== confirm) { setErr('两次输入的密码不一致'); return; }
    if (needsSetup && password.length < 6) { setErr('密码至少 6 位'); return; }

    setBusy(true);
    try {
      const fn = needsSetup ? api.setupAdmin : api.login;
      const { token, username: name } = await fn(username.trim(), password);
      onAuthed(token, name);
    } catch (e) {
      setErr(needsSetup ? '初始化失败：' + e.message : '登录失败：用户名或密码错误');
    } finally {
      setBusy(false);
    }
  };

  if (needsSetup === null) return <div className="login-wrap"><div className="muted">加载中…</div></div>;

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>xoss</h1>
        <div className="muted">
          {needsSetup ? '初次使用：请创建管理员账号' : '请登录'}
        </div>
        <input
          type="text"
          placeholder="用户名"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="密码"
          autoComplete={needsSetup ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {needsSetup && (
          <input
            type="password"
            placeholder="确认密码"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
        {err && <div className="error">{err}</div>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? '处理中…' : (needsSetup ? '创建并登录' : '登录')}
        </button>
      </form>
    </div>
  );
}
