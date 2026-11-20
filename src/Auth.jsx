import { useState } from 'react'
import { supabase, configOk } from './supabase'

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [f, setF] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr('')
    if (!configOk) return setErr('Your .env file is wrong. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then stop and restart npm run dev.')
    setBusy(true)
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password })
      if (error) setErr('Wrong email or password.')
    } else {
      const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.password })
      if (error) setErr(error.message)
      else if (!data.session) setErr('Turn OFF "Confirm email" in Supabase (Authentication > Sign In / Providers > Email), then try again.')
    }
    setBusy(false)
  }

  return (
    <div className="app" data-theme="dark">
      <div className="auth-wrap">
        <div className="modal">
          <div className="logo" style={{ padding: 0 }}>GYM<span>FLOW</span></div>
          <h2>{mode === 'login' ? 'Log in to your gym' : 'Create your account'}</h2>
          <label className="field">Email
            <input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </label>
          <label className="field">Password (6+ characters)
            <input className="input" type="password" value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </label>
          {err && <p className="error">{err}</p>}
          <button className="add-button" onClick={submit} disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
          <button className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'New gym owner? Create account' : 'Back to log in'}
          </button>
        </div>
      </div>
    </div>
  )
}