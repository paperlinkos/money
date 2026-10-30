import { useEffect, useState } from 'react'

const navigation = [
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Free tools', href: '/tools' },
]

type SignedInBusiness = { name: string }
type HeaderNotification = {
  id: number
  event_type: 'booking_requested' | 'confirmed' | 'rescheduled' | 'cancelled'
  recipient: string
  status: 'pending' | 'sent' | 'failed' | 'skipped'
  created_at: string
}

async function currentBusiness() {
  const response = await fetch('/api/auth/me', { credentials: 'include' })
  if (!response.ok) return null
  const body = await response.json() as { business?: SignedInBusiness }
  return body.business ?? null
}

function HeaderNotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<HeaderNotification[]>([])

  useEffect(() => {
    void fetch('/api/booking/notifications', { credentials: 'include' })
      .then(async (response) => response.ok ? response.json() as Promise<HeaderNotification[]> : [])
      .then(setNotifications)
      .catch(() => setNotifications([]))
  }, [])

  const pending = notifications.filter((item) => item.status === 'pending').length
  const labels: Record<HeaderNotification['event_type'], string> = {
    booking_requested: 'New booking request',
    confirmed: 'Booking confirmed',
    rescheduled: 'Booking rescheduled',
    cancelled: 'Booking cancelled',
  }

  return <div className="relative">
    <button type="button" aria-label="Open notifications" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="relative grid h-10 w-10 place-items-center rounded-full text-slate-800 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 22h4" /></svg>{pending > 0 && <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">{pending > 9 ? '9+' : pending}</span>}</button>
    {open && <section className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"><div className="flex items-center justify-between gap-3"><h2 className="font-black text-slate-950">Notifications</h2><button type="button" onClick={() => setOpen(false)} className="text-sm font-bold text-slate-500">Close</button></div><p className="mt-1 text-xs leading-5 text-slate-500">Booking activity appears here. Pending items are not delivered by email yet.</p>{notifications.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No Booking notifications yet.</p> : <div className="mt-3 max-h-80 space-y-1 overflow-y-auto">{notifications.slice(0, 12).map((item) => <a key={item.id} href="/tools/booking/account?tab=appointments" onClick={() => setOpen(false)} className="block rounded-lg p-3 text-sm hover:bg-emerald-50"><div className="flex items-center justify-between gap-2"><b>{labels[item.event_type]}</b><span className="text-xs font-bold text-slate-500">{item.status === 'pending' ? 'Pending' : item.status}</span></div><p className="mt-1 truncate text-slate-600">{item.recipient}</p><p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p></a>)}</div>}</section>}
  </div>
}

function HeaderProfileMenu({ business, onSignOut }: { business: SignedInBusiness; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const initial = business.name.trim().charAt(0).toUpperCase() || 'A'

  return <div className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`Open account menu for ${business.name}`} className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-sm font-black text-emerald-800 transition hover:bg-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2">{initial}</button>
    {open && <section className="absolute right-0 z-40 mt-2 w-52 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"><p className="truncate px-3 py-2 text-sm font-bold text-slate-900">{business.name}</p><a href="/account" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">Dashboard</a><a href="/profile" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">My profile</a><button type="button" onClick={onSignOut} className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-rose-700 hover:bg-rose-50">Sign out</button></section>}
  </div>
}

export function SiteHeader() {
  const [business, setBusiness] = useState<SignedInBusiness | null>(null)
  const [checkedSession, setCheckedSession] = useState(false)

  useEffect(() => {
    const refreshSession = () => {
      void currentBusiness()
        .then(setBusiness)
        .catch(() => setBusiness(null))
        .finally(() => setCheckedSession(true))
    }
    refreshSession()
    window.addEventListener('paperlinkos:authchange', refreshSession)
    return () => window.removeEventListener('paperlinkos:authchange', refreshSession)
  }, [])

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setBusiness(null)
    window.dispatchEvent(new Event('paperlinkos:authchange'))
    window.location.assign('/')
  }

  return (
    <header className="border-b border-slate-900/10 bg-stone-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <a className="text-lg font-black tracking-tight" href="/" aria-label="PaperlinkOS home">
          Paperlink<span className="text-emerald-600">OS</span>
        </a>
        <nav aria-label="Main navigation">
          <ul className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:gap-5">
            {navigation.map((item) => (
              <li className="hidden sm:block" key={item.href}><a className="transition hover:text-emerald-700" href={item.href}>{item.label}</a></li>
            ))}
            {business ? (
              <><li><a className="rounded-full bg-slate-950 px-3 py-2 text-white transition hover:bg-emerald-700 sm:px-4" href="/account">Dashboard</a></li><li><HeaderNotificationBell /></li><li><HeaderProfileMenu business={business} onSignOut={() => void signOut()} /></li></>
            ) : checkedSession ? (
              <>
                <li className="hidden sm:block"><a className="rounded-full px-3 py-2 transition hover:text-emerald-700" href="/account">Sign in</a></li>
                <li><a className="rounded-full bg-slate-950 px-4 py-2 font-bold text-white transition hover:bg-emerald-700" href="/account?mode=signup">Start free</a></li>
              </>
            ) : null}
          </ul>
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-900/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>© {new Date().getFullYear()} PaperlinkOS. The business side of creative work.</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 font-medium text-slate-800" aria-label="Footer navigation"><a href="/pricing" className="hover:text-emerald-700">Pricing</a><a href="/tools" className="hover:text-emerald-700">Free tools</a><a href="/privacy" className="hover:text-emerald-700">Privacy</a><a href="/contact" className="hover:text-emerald-700">Contact</a><a href="/feedback" className="hover:text-emerald-700">Feedback</a></nav>
      </div>
    </footer>
  )
}
