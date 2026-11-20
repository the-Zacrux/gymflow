import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { todayStr, addDays, daysLeft, money, fmtDate, statusOf, initials, openWhatsApp } from './utils'

const METHODS = ['cash', 'upi', 'card', 'other']
const PRESETS = [
  { name: 'Monthly', days: 30, bonus: 0 },
  { name: '3 Months', days: 90, bonus: 0 },
  { name: '5+1 Months', days: 150, bonus: 30 },
  { name: '11+1 Yearly', days: 330, bonus: 30 },
]

/* ---------- Popup used for Renew (cash/UPI) and Collect due ---------- */
function PayModal({ title, plans, planId, amount, onClose, onConfirm }) {
  const [pid, setPid] = useState(planId)
  const [amt, setAmt] = useState(amount)
  const [method, setMethod] = useState('cash')
  const pickPlan = (id) => {
    setPid(id)
    const p = plans?.find((x) => x.id === id)
    if (p) setAmt(p.price)
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {plans && (
          <label className="field">Plan
            <select className="input" value={pid || ''} onChange={(e) => pickPlan(e.target.value)}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} – {money(p.price)}</option>)}
            </select>
          </label>
        )}
        <label className="field">Amount received now (₹)
          <input className="input" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} />
        </label>
        <div className="chips">
          {METHODS.map((m) => (
            <button key={m} className={'tab' + (method === m ? ' on' : '')} onClick={() => setMethod(m)}>{m.toUpperCase()}</button>
          ))}
        </div>
        <p className="muted">If you receive less than the plan price, the rest is saved as "due".</p>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="add-button" onClick={() => onConfirm({ planId: pid, amount: Number(amt) || 0, method })}>Save</button>
        </div>
      </div>
    </div>
  )
}

export default function OwnerPanel({ gym, onLogout }) {
  const [g, setG] = useState(gym)
  const [tab, setTab] = useState('Dashboard')
  const [plans, setPlans] = useState([])
  const [members, setMembers] = useState([])
  const [payments, setPayments] = useState([])
  const [attendance, setAttendance] = useState([])
  const [closures, setClosures] = useState([])
  const [toast, setToast] = useState('')
  const [pay, setPay] = useState(null) // { kind: 'renew' | 'collect', m }
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('All')
  const [planForm, setPlanForm] = useState({ name: '', days: 30, bonus: 0, price: '' })
  const [mf, setMf] = useState({ name: '', phone: '', planId: '', start: todayStr(), paid: '', method: 'cash' })
  const [bc, setBc] = useState({ day: todayStr(), reason: '', started: false, sent: [] })
  const [nudged, setNudged] = useState([])

  const t = todayStr()
  const notify = (m) => { setToast(m); setTimeout(() => setToast(''), 2600) }

  const load = useCallback(async () => {
    const [p, m, pay2, att, cl] = await Promise.all([
      supabase.from('plans').select('*').eq('gym_id', gym.id).order('price'),
      supabase.from('members').select('*, plans(name, days, bonus_days, price)').eq('gym_id', gym.id).order('created_at', { ascending: false }),
      supabase.from('payments').select('*').eq('gym_id', gym.id).order('paid_on', { ascending: false }),
      supabase.from('attendance').select('id, member_id, day').eq('gym_id', gym.id).gte('day', addDays(todayStr(), -30)),
      supabase.from('closures').select('*').eq('gym_id', gym.id).gte('day', todayStr()).order('day'),
    ])
    setPlans(p.data || []); setMembers(m.data || []); setPayments(pay2.data || [])
    setAttendance(att.data || []); setClosures(cl.data || [])
  }, [gym.id])
  useEffect(() => { load() }, [load])

  /* ---------- Plans ---------- */
  const addPlan = async () => {
    if (!planForm.name.trim() || planForm.price === '') return notify('Enter plan name and price')
    const { error } = await supabase.from('plans').insert({
      gym_id: gym.id, name: planForm.name.trim(), days: Number(planForm.days),
      bonus_days: Number(planForm.bonus) || 0, price: Number(planForm.price),
    })
    if (error) return notify(error.message)
    setPlanForm({ name: '', days: 30, bonus: 0, price: '' })
    load()
  }
  const updatePrice = async (p, v) => {
    if (Number(v) === Number(p.price)) return
    await supabase.from('plans').update({ price: Number(v) }).eq('id', p.id)
    notify('Price updated'); load()
  }
  const deletePlan = async (p) => {
    if (!window.confirm('Delete the ' + p.name + ' plan? Members keep their dates.')) return
    await supabase.from('plans').delete().eq('id', p.id); load()
  }

  /* ---------- Members ---------- */
  const pickPlanForForm = (id) => {
    const p = plans.find((x) => x.id === id)
    setMf({ ...mf, planId: id, paid: p ? p.price : '' })
  }
  const addMember = async () => {
    const plan = plans.find((p) => p.id === mf.planId)
    if (mf.name.trim().length < 2) return notify('Enter the full name')
    if (!/^\d{10}$/.test(mf.phone)) return notify('Phone must be 10 digits')
    if (!plan) return notify('Choose a plan (add plans first)')
    const paid = Number(mf.paid) || 0
    const { data: mem, error } = await supabase.from('members').insert({
      gym_id: gym.id, name: mf.name.trim(), phone: mf.phone, plan_id: plan.id, joined: mf.start,
      expires: addDays(mf.start, plan.days + plan.bonus_days), due: Math.max(plan.price - paid, 0),
    }).select().single()
    if (error) return notify(error.message)
    if (paid > 0) await supabase.from('payments').insert({ gym_id: gym.id, member_id: mem.id, amount: paid, method: mf.method })
    setMf({ name: '', phone: '', planId: '', start: todayStr(), paid: '', method: 'cash' })
    notify(mem.name + ' added'); load()
  }
  const renew = async (m, { planId, amount, method }) => {
    const plan = plans.find((p) => p.id === planId)
    if (!plan) return notify('Choose a plan first')
    const start = daysLeft(m.expires) > 0 ? m.expires : todayStr()
    await supabase.from('members').update({
      plan_id: plan.id, expires: addDays(start, plan.days + plan.bonus_days),
      due: Number(m.due) + Math.max(plan.price - amount, 0), last_reminded: null,
    }).eq('id', m.id)
    if (amount > 0) await supabase.from('payments').insert({ gym_id: gym.id, member_id: m.id, amount, method })
    setPay(null); notify(m.name + ' renewed'); load()
  }
  const collect = async (m, { amount, method }) => {
    const amt = Math.min(amount, Number(m.due))
    if (amt <= 0) return setPay(null)
    await supabase.from('payments').insert({ gym_id: gym.id, member_id: m.id, amount: amt, method })
    await supabase.from('members').update({ due: Number(m.due) - amt }).eq('id', m.id)
    setPay(null); notify(money(amt) + ' collected from ' + m.name); load()
  }
  const freeze = async (m) => {
    const n = Number(window.prompt('Freeze membership: add how many days to the end date?', '7'))
    if (!n) return
    await supabase.from('members').update({ expires: addDays(m.expires, n) }).eq('id', m.id)
    notify(m.name + ' extended by ' + n + ' days'); load()
  }
  const removeMember = async (m) => {
    if (!window.confirm('Remove ' + m.name + '? Their history is deleted too.')) return
    await supabase.from('members').delete().eq('id', m.id); load()
  }

  /* ---------- Attendance ---------- */
  const present = (id) => attendance.some((a) => a.member_id === id && a.day === t)
  const toggleAttendance = async (m) => {
    if (present(m.id)) await supabase.from('attendance').delete().eq('member_id', m.id).eq('day', t)
    else await supabase.from('attendance').insert({ gym_id: gym.id, member_id: m.id, day: t })
    load()
  }

  /* ---------- WhatsApp messages ---------- */
  const reminderText = (m) => {
    const d = daysLeft(m.expires)
    const when = d < 0 ? 'ended on ' + fmtDate(m.expires) : d === 0 ? 'ends today' : 'ends on ' + fmtDate(m.expires) + ' (' + d + ' days left)'
    return `Hi ${m.name}, this is ${g.name}. Your membership ${when}. Please renew${g.upi_id ? ' (UPI: ' + g.upi_id + ')' : ''} to continue your fitness journey. 💪`
  }
  const dueReminders = members.filter((m) => {
    const d = daysLeft(m.expires)
    return d <= g.remind_days && d >= -30 && m.last_reminded !== t
  })
  const sendReminder = async (m) => {
    openWhatsApp(m.phone, reminderText(m)) // open first, then save
    await supabase.from('members').update({ last_reminded: t }).eq('id', m.id)
    load()
  }

  const activeMembers = members.filter((m) => daysLeft(m.expires) >= 0)
  const bcText = (m) =>
    `Hi ${m.name}, ${g.name} will be CLOSED on ${fmtDate(bc.day)}${bc.reason ? ' (' + bc.reason + ')' : ''}. Sorry for the inconvenience, see you soon! 💪`
  const startBroadcast = async () => {
    await supabase.from('closures').upsert({ gym_id: gym.id, day: bc.day, reason: bc.reason }, { onConflict: 'gym_id,day' })
    setBc({ ...bc, started: true, sent: [] }); load()
  }
  const sendBc = (m) => { openWhatsApp(m.phone, bcText(m)); setBc((b) => ({ ...b, sent: [...b.sent, m.id] })) }
  const removeClosure = async (c) => { await supabase.from('closures').delete().eq('id', c.id); load() }

  const seenRecently = new Set(attendance.filter((a) => a.day >= addDays(t, -7)).map((a) => a.member_id))
  const inactive = activeMembers.filter((m) => !seenRecently.has(m.id) && !nudged.includes(m.id))
  const nudge = (m) => {
    openWhatsApp(m.phone, `Hi ${m.name}, we miss you at ${g.name}! 💪 Come back this week and keep your progress going.`)
    setNudged((n) => [...n, m.id])
  }

  /* ---------- Settings ---------- */
  const saveSettings = async () => {
    const { error } = await supabase.from('gyms').update({
      name: g.name, phone: g.phone, timings: g.timings, upi_id: g.upi_id, remind_days: Number(g.remind_days) || 3,
    }).eq('id', gym.id)
    notify(error ? error.message : 'Settings saved')
  }

  /* ---------- Numbers ---------- */
  const monthKey = t.slice(0, 7)
  const monthRevenue = payments.filter((p) => p.paid_on.startsWith(monthKey)).reduce((s, p) => s + Number(p.amount), 0)
  const pending = members.reduce((s, m) => s + Number(m.due), 0)
  const todayPays = payments.filter((p) => p.paid_on === t)
  const bars = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i))
    const key = d.toLocaleDateString('en-CA').slice(0, 7)
    return { label: d.toLocaleDateString('en-IN', { month: 'short' }), total: payments.filter((p) => p.paid_on.startsWith(key)).reduce((s, p) => s + Number(p.amount), 0) }
  })
  const max = Math.max(...bars.map((b) => b.total), 1)
  const closedToday = closures.find((c) => c.day === t)
  const memberOf = (id) => members.find((m) => m.id === id)
  const expected = members
    .filter((m) => daysLeft(m.expires) >= 0 && daysLeft(m.expires) <= 7)
    .reduce((s, m) => s + Number(m.plans?.price || 0), 0)
  const receiptText = (p) => {
    const m = memberOf(p.member_id)
    return `Receipt from ${g.name}: ${money(p.amount)} received (${p.method.toUpperCase()}) on ${fmtDate(p.paid_on)} from ${m?.name}. Membership valid till ${m ? fmtDate(m.expires) : '-'}. Thank you! 💪`
  }
  const exportCsv = () => {
    const rows = [['Name', 'Phone', 'Plan', 'Started', 'Ends', 'Due']].concat(
      members.map((m) => [m.name, m.phone, m.plans?.name || '', m.joined, m.expires, m.due]))
    const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'members.csv'
    a.click()
  }
  const list = members.filter((m) =>
    (filter === 'All' || statusOf(m) === filter) &&
    (m.name.toLowerCase().includes(q.toLowerCase()) || m.phone.includes(q)))

  const tabs = [
    ['Dashboard', 'Dashboard'], ['Members', 'Members'], ['Attendance', 'Attendance'],
    ['Payments', 'Payments'],
    ['Reminders', 'Reminders' + (dueReminders.length ? ' (' + dueReminders.length + ')' : '')],
    ['Plans', 'Plans & prices'], ['Settings', 'Settings'],
  ]

  return (
    <div className="app" data-theme="dark">
      <aside className="sidebar">
        <div className="logo">GYM<span>FLOW</span></div>
        <nav>
          {tabs.map(([key, label]) => (
            <button key={key} className={'nav-item' + (tab === key ? ' active' : '')} onClick={() => setTab(key)}>{label}</button>
          ))}
        </nav>
        <div className="sidebar-foot">{g.name}<br /><button className="link" onClick={onLogout}>Log out</button></div>
      </aside>

      <main className="main">
        <header className="header">
          <div><p className="welcome">{g.name}</p><h1>{tab === 'Plans' ? 'Plans & prices' : tab}</h1></div>
        </header>

        {closedToday && <div className="banner">Gym is marked CLOSED today{closedToday.reason ? ': ' + closedToday.reason : ''}</div>}

        {/* ================= DASHBOARD ================= */}
        {tab === 'Dashboard' && (
          <>
            <section className="stats">
              <div className="stat-card"><p className="stat-label">Active members</p><p className="stat-value">{activeMembers.length}</p><p className="muted">{members.length} total</p></div>
              <div className="stat-card"><p className="stat-label">This month's revenue</p><p className="stat-value">{money(monthRevenue)}</p></div>
              <div className="stat-card"><p className="stat-label">Present today</p><p className="stat-value">{attendance.filter((a) => a.day === t).length}</p></div>
              <div className="stat-card"><p className="stat-label">Pending dues</p><p className={'stat-value' + (pending ? ' warn' : '')}>{money(pending)}</p></div>
            </section>
            <section className="grid-2">
              <div className="content-card">
                <h2>Revenue, last 6 months</h2>
                <div className="chart">
                  {bars.map((b) => (
                    <div className="bar-col" key={b.label}>
                      <span className="bar-val">{b.total ? Math.round(b.total / 1000) + 'k' : '0'}</span>
                      <div className="bar" style={{ height: (b.total / max) * 100 + '%' }} />
                      <span className="bar-label">{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="content-card">
                <h2>Collected today</h2>
                <ul className="list">
                  {METHODS.map((k) => (
                    <li key={k}><div className="grow"><strong>{k.toUpperCase()}</strong></div>
                      <strong>{money(todayPays.filter((p) => p.method === k).reduce((s, p) => s + Number(p.amount), 0))}</strong></li>
                  ))}
                </ul>
              </div>
            </section>
            <div className="content-card">
              <h2>Plans ending soon</h2>
              <p className="muted">Expected from renewals in the next 7 days: {money(expected)}</p>
              {members.filter((m) => daysLeft(m.expires) <= 7 && daysLeft(m.expires) >= -30).length === 0 && <p className="empty">Nobody is expiring this week.</p>}
              <ul className="list">
                {members.filter((m) => daysLeft(m.expires) <= 7 && daysLeft(m.expires) >= -30).map((m) => (
                  <li key={m.id}>
                    <div className="avatar">{initials(m.name)}</div>
                    <div className="grow"><strong>{m.name}</strong><span className="muted">{fmtDate(m.expires)}</span></div>
                    <button className="btn-small" onClick={() => openWhatsApp(m.phone, reminderText(m))}>WhatsApp</button>
                    <button className="btn-small gold" onClick={() => setPay({ kind: 'renew', m })}>Renew</button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* ================= MEMBERS ================= */}
        {tab === 'Members' && (
          <>
            <div className="content-card">
              <h2>Add a member</h2>
              <p className="muted">For old members, set the date their membership started.</p>
              <div className="form-row">
                <label className="field">Full name<input className="input" value={mf.name} onChange={(e) => setMf({ ...mf, name: e.target.value })} /></label>
                <label className="field">Phone (10 digits)<input className="input" maxLength={10} value={mf.phone} onChange={(e) => setMf({ ...mf, phone: e.target.value.replace(/\D/g, '') })} /></label>
                <label className="field">Plan
                  <select className="input" value={mf.planId} onChange={(e) => pickPlanForForm(e.target.value)}>
                    <option value="">Choose…</option>
                    {plans.map((p) => <option key={p.id} value={p.id}>{p.name} – {money(p.price)}</option>)}
                  </select>
                </label>
                <label className="field">Started on<input className="input" type="date" value={mf.start} onChange={(e) => setMf({ ...mf, start: e.target.value })} /></label>
                <label className="field">Paid now (₹)<input className="input" type="number" value={mf.paid} onChange={(e) => setMf({ ...mf, paid: e.target.value })} /></label>
                <label className="field">Paid by
                  <select className="input" value={mf.method} onChange={(e) => setMf({ ...mf, method: e.target.value })}>
                    {METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                  </select>
                </label>
              </div>
              <button className="add-button" onClick={addMember}>Add member</button>
            </div>
            <div className="content-card">
              <div className="toolbar">
                <input className="input" placeholder="Search by name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
                <div className="tabs">
                  {['All', 'Active', 'Expiring', 'Expired'].map((f) => (
                    <button key={f} className={'tab' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)}>{f}</button>
                  ))}
                  <button className="tab" onClick={exportCsv}>Download CSV</button>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Member</th><th>Plan</th><th>Ends</th><th>Status</th><th>Due</th><th></th></tr></thead>
                  <tbody>
                    {list.map((m) => (
                      <tr key={m.id}>
                        <td><div className="who"><div className="avatar">{initials(m.name)}</div><div><strong>{m.name}</strong><span className="muted">{m.phone}</span></div></div></td>
                        <td>{m.plans?.name || '–'}</td>
                        <td>{fmtDate(m.expires)}</td>
                        <td><span className={'pill ' + statusOf(m).toLowerCase()}>{statusOf(m)}</span></td>
                        <td>{Number(m.due) ? money(m.due) : '–'}</td>
                        <td className="row-actions">
                          <button className="btn-small gold" onClick={() => setPay({ kind: 'renew', m })}>Renew</button>
                          {Number(m.due) > 0 && <button className="btn-small gold" onClick={() => setPay({ kind: 'collect', m })}>Collect due</button>}
                          <button className="btn-small" onClick={() => openWhatsApp(m.phone, reminderText(m))}>WhatsApp</button>
                          <button className="btn-small" onClick={() => freeze(m)}>Freeze</button>
                          <button className="btn-small danger" onClick={() => removeMember(m)}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {list.length === 0 && <p className="empty">No members found.</p>}
              </div>
            </div>
          </>
        )}

        {/* ================= ATTENDANCE ================= */}
        {tab === 'Attendance' && (
          <div className="content-card">
            <div className="toolbar">
              <input className="input" placeholder="Search member" value={q} onChange={(e) => setQ(e.target.value)} />
              <span className="muted">{attendance.filter((a) => a.day === t).length} present today · {fmtDate(t)}</span>
            </div>
            <ul className="list">
              {activeMembers.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())).map((m) => (
                <li key={m.id}>
                  <div className="avatar">{initials(m.name)}</div>
                  <div className="grow"><strong>{m.name}</strong><span className="muted">{m.plans?.name}</span></div>
                  {present(m.id)
                    ? <button className="btn-small" onClick={() => toggleAttendance(m)}>✓ Present (undo)</button>
                    : <button className="btn-small gold" onClick={() => toggleAttendance(m)}>Mark present</button>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ================= PAYMENTS ================= */}
        {tab === 'Payments' && (
          <>
            <div className="content-card">
              <h2>Pending dues</h2>
              {members.filter((m) => Number(m.due) > 0).length === 0 && <p className="empty">No pending dues. 🎉</p>}
              <ul className="list">
                {members.filter((m) => Number(m.due) > 0).map((m) => (
                  <li key={m.id}>
                    <div className="avatar">{initials(m.name)}</div>
                    <div className="grow"><strong>{m.name}</strong><span className="muted">{m.phone}</span></div>
                    <strong className="warn">{money(m.due)}</strong>
                    <button className="btn-small" onClick={() => openWhatsApp(m.phone, `Hi ${m.name}, a gentle reminder from ${g.name}: ${money(m.due)} is pending on your membership. Please pay at your convenience${g.upi_id ? ' (UPI: ' + g.upi_id + ')' : ''}. Thank you!`)}>WhatsApp</button>
                    <button className="btn-small gold" onClick={() => setPay({ kind: 'collect', m })}>Collect</button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="content-card">
              <h2>Payment history</h2>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Member</th><th>Amount</th><th>Paid by</th><th></th></tr></thead>
                  <tbody>
                    {payments.slice(0, 60).map((p) => (
                      <tr key={p.id}>
                        <td>{fmtDate(p.paid_on)}</td>
                        <td>{memberOf(p.member_id)?.name || '–'}</td>
                        <td><strong>{money(p.amount)}</strong></td>
                        <td>{p.method.toUpperCase()}</td>
                        <td className="row-actions">
                          {memberOf(p.member_id) && <button className="btn-small" onClick={() => openWhatsApp(memberOf(p.member_id).phone, receiptText(p))}>Send receipt</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {payments.length === 0 && <p className="empty">No payments yet.</p>}
              </div>
            </div>
          </>
        )}

        {/* ================= REMINDERS ================= */}
        {tab === 'Reminders' && (
          <>
            <div className="content-card">
              <h2>Renewal reminders for today ({dueReminders.length})</h2>
              <p className="muted">Everyone whose plan ends within {g.remind_days} days (or just ended). Tap Send: WhatsApp opens with the message ready, you press send. They come back every day until the member renews.</p>
              {dueReminders.length === 0 && <p className="empty">All reminders sent for today. 🎉</p>}
              <ul className="list">
                {dueReminders.map((m) => (
                  <li key={m.id}>
                    <div className="avatar">{initials(m.name)}</div>
                    <div className="grow"><strong>{m.name}</strong><span className="muted">{daysLeft(m.expires) < 0 ? 'Expired ' + -daysLeft(m.expires) + ' days ago' : daysLeft(m.expires) + ' days left'}</span></div>
                    <button className="btn-small gold" onClick={() => sendReminder(m)}>Send on WhatsApp</button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="content-card">
              <h2>Gym closed? Tell everyone</h2>
              <div className="form-row">
                <label className="field">Closed on<input className="input" type="date" value={bc.day} onChange={(e) => setBc({ ...bc, day: e.target.value, started: false })} /></label>
                <label className="field">Reason (optional)<input className="input" placeholder="e.g. Diwali, repair work" value={bc.reason} onChange={(e) => setBc({ ...bc, reason: e.target.value, started: false })} /></label>
              </div>
              {!bc.started
                ? <button className="add-button" onClick={startBroadcast}>Mark closed &amp; prepare messages</button>
                : (
                  <ul className="list">
                    {activeMembers.map((m) => (
                      <li key={m.id}>
                        <div className="avatar">{initials(m.name)}</div>
                        <div className="grow"><strong>{m.name}</strong></div>
                        {bc.sent.includes(m.id) ? <span className="pill active">Sent</span> : <button className="btn-small gold" onClick={() => sendBc(m)}>Send</button>}
                      </li>
                    ))}
                  </ul>
                )}
              {closures.length > 0 && (
                <>
                  <hr />
                  <p className="muted">Upcoming closed days</p>
                  <ul className="list">
                    {closures.map((c) => (
                      <li key={c.id}><div className="grow"><strong>{fmtDate(c.day)}</strong><span className="muted">{c.reason}</span></div>
                        <button className="btn-small danger" onClick={() => removeClosure(c)}>Cancel</button></li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="content-card">
              <h2>"We miss you" ({inactive.length})</h2>
              <p className="muted">Active members who haven't been marked present in the last 7 days. Win them back before they quit.</p>
              <ul className="list">
                {inactive.slice(0, 15).map((m) => (
                  <li key={m.id}><div className="avatar">{initials(m.name)}</div><div className="grow"><strong>{m.name}</strong></div>
                    <button className="btn-small" onClick={() => nudge(m)}>Send</button></li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* ================= PLANS ================= */}
        {tab === 'Plans' && (
          <>
            <div className="content-card">
              <h2>Your plans</h2>
              <p className="muted">You decide the prices. Change a price and press outside the box to save.</p>
              {plans.length === 0 && <p className="empty">No plans yet. Add your first one below.</p>}
              <ul className="list">
                {plans.map((p) => (
                  <li key={p.id}>
                    <div className="grow"><strong>{p.name}</strong><span className="muted">{p.days} days{p.bonus_days ? ' + ' + p.bonus_days + ' bonus' : ''}</span></div>
                    <span className="muted">₹</span>
                    <input className="input" style={{ width: 110 }} type="number" defaultValue={p.price} onBlur={(e) => updatePrice(p, e.target.value)} />
                    <button className="btn-small danger" onClick={() => deletePlan(p)}>Delete</button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="content-card">
              <h2>Add a plan</h2>
              <div className="chips" style={{ marginTop: 10 }}>
                {PRESETS.map((p) => (
                  <button key={p.name} className="tab" onClick={() => setPlanForm({ ...planForm, name: p.name, days: p.days, bonus: p.bonus })}>{p.name}</button>
                ))}
              </div>
              <div className="form-row">
                <label className="field">Plan name<input className="input" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} /></label>
                <label className="field">Days<input className="input" type="number" value={planForm.days} onChange={(e) => setPlanForm({ ...planForm, days: e.target.value })} /></label>
                <label className="field">Bonus days (free)<input className="input" type="number" value={planForm.bonus} onChange={(e) => setPlanForm({ ...planForm, bonus: e.target.value })} /></label>
                <label className="field">Price (₹)<input className="input" type="number" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} /></label>
              </div>
              <button className="add-button" onClick={addPlan}>Save plan</button>
            </div>
          </>
        )}

        {/* ================= SETTINGS ================= */}
        {tab === 'Settings' && (
          <div className="content-card narrow">
            <h2>Gym details</h2>
            <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
              <label className="field">Gym name<input className="input" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></label>
              <label className="field">Gym phone<input className="input" value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} /></label>
              <label className="field">Timings<input className="input" value={g.timings} onChange={(e) => setG({ ...g, timings: e.target.value })} /></label>
              <label className="field">Your UPI ID (shown in reminders)<input className="input" value={g.upi_id} onChange={(e) => setG({ ...g, upi_id: e.target.value })} /></label>
              <label className="field">Send renewal reminders in the last ___ days<input className="input" type="number" value={g.remind_days} onChange={(e) => setG({ ...g, remind_days: e.target.value })} /></label>
            </div>
            <button className="add-button" onClick={saveSettings}>Save settings</button>
          </div>
        )}
      </main>

      {pay?.kind === 'renew' && (
        <PayModal title={'Renew ' + pay.m.name} plans={plans} planId={pay.m.plan_id || plans[0]?.id}
          amount={pay.m.plans?.price ?? plans[0]?.price ?? 0} onClose={() => setPay(null)} onConfirm={(r) => renew(pay.m, r)} />
      )}
      {pay?.kind === 'collect' && (
        <PayModal title={'Collect due from ' + pay.m.name} amount={pay.m.due} onClose={() => setPay(null)} onConfirm={(r) => collect(pay.m, r)} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}