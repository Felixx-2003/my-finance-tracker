'use client';

import { FormEvent, useState } from 'react';
import { LockKeyhole, Wallet } from 'lucide-react';
import './login.css';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Could not sign in.');
      const next = new URLSearchParams(location.search).get('next');
      location.assign(next?.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  }

  return <main className="login-page"><form className="login-card" onSubmit={submit}>
    <span className="login-mark"><Wallet size={26}/></span>
    <h1>MyFinance</h1><p>Your money, privately in one place.</p>
    <label htmlFor="password">Password</label>
    <div className="login-input"><LockKeyhole size={19}/><input id="password" type="password" autoComplete="current-password" autoFocus value={password} onChange={event=>setPassword(event.target.value)} required/></div>
    {error && <p className="login-error" role="alert">{error}</p>}
    <button className="primary wide" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
  </form></main>;
}
