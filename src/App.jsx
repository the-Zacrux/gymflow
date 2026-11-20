import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Auth from './Auth'
import OwnerPanel from './OwnerPanel'
import './App.css'

function SetupGym({ onDone, onLogout }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const save = async () => {
    if (name.trim().length < 2) return setErr('Enter your gym name')
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('gyms').insert({ owner_id: u.user.id, name: name.trim() })
    if (error) setErr(error.message)
    else onDone()
  }
  return (
    <div className="app" data-theme="dark">
      <div className="auth-wrap">
        <div className="modal">
          <h2>What is your gym called?</h2>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {err && <p className="error">{err}</p>}
          <button className="add-button" onClick={save}>Start using GymFlow</button>
          <button className="link" onClick={onLogout}>Log out</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [gym, setGym] = useState(undefined) // undefined = loading, null = no gym yet

  const loadGym = async () => {
    const { data: u } = await supabase.auth.getUser()
    if (!u.user) return setGym(undefined)
    const { data } = await supabase.from('gyms').select('*').eq('owner_id', u.user.id).maybeSingle()
    setGym(data)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadGym()
    else setGym(undefined)
  }, [session])

  const logout = () => supabase.auth.signOut()

  if (session === undefined) return <div className="app" data-theme="dark" />
  if (!session) return <Auth />
  if (gym === undefined) return <div className="app" data-theme="dark" />
  if (gym === null) return <SetupGym onDone={loadGym} onLogout={logout} />
  return <OwnerPanel gym={gym} onLogout={logout} />
}