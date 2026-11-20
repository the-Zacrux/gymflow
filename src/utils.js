export const todayStr = () => new Date().toLocaleDateString('en-CA')
export const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}
export const daysLeft = (dateStr) =>
  Math.round((new Date(dateStr + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400000)
export const money = (n) => '₹' + Number(n).toLocaleString('en-IN')
export const fmtDate = (s) =>
  new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
export const statusOf = (m) => {
  const d = daysLeft(m.expires)
  if (d < 0) return 'Expired'
  if (d <= 7) return 'Expiring'
  return 'Active'
}
export const initials = (name) =>
  (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
export const openWhatsApp = (phone, text) =>
  window.open('https://wa.me/91' + String(phone).slice(-10) + '?text=' + encodeURIComponent(text), '_blank')