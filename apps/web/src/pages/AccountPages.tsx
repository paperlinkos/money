import { useEffect, useState } from 'react'
import { ProviderBooking } from '../modules/booking/AccountBooking'
import { tools } from '../modules/tools'
import { comingSoon, loadBilling, openBillingPortal, startCheckout, type Billing } from '../app/billing'

type Account = {
  account: { email: string; isAdmin?: boolean }
  business: { name: string; slug: string }
}

async function loadAccount() {
  const response = await fetch('/api/auth/me', { credentials: 'include' })
  if (!response.ok) return null
  return response.json() as Promise<Account>
}

function AccountLoading() {
  return <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8"><p className="text-sm text-slate-600">Loading your account…</p></section>
}

export function AccountDashboard({ initialMode = 'signin' }: { initialMode?: 'signin' | 'signup' }) {
  const [account, setAccount] = useState<Account | null | undefined>(undefined)
  const [billing, setBilling] = useState<Billing | null | undefined>(undefined)
  const [galleries, setGalleries] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadAccount().then(setAccount).catch(() => setAccount(null))
    void loadBilling().then(setBilling).catch(() => setBilling(null))
    void fetch('/api/proof/projects', { credentials: 'include' }).then(async (response) => response.ok ? setGalleries((await response.json()).length) : undefined).catch(() => undefined)
  }, [])

  if (account === undefined) return <AccountLoading />
  if (!account) return <ProviderBooking initialMode={initialMode} />

  const bookingUrl = `${window.location.origin}/book/${account.business.slug}`
  const copyLink = async () => { try { await navigator.clipboard.writeText(bookingUrl); setMessage('Booking link copied.') } catch { setMessage(bookingUrl) } }
  const act = (work: () => Promise<void>) => { setMessage(''); void work().catch((error) => setMessage(error instanceof Error ? error.message : 'Something went wrong.')) }
  const plan = billing?.plan
  const allowance = billing?.galleryAllowance
  const used = galleries ?? 0
  const atLimit = allowance != null && used >= allowance

  return <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
    <p className="text-sm font-bold text-emerald-700">Dashboard</p>
    <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Welcome back, {account.business.name}</h1>
    {account.account.isAdmin && <a href="/account/inbox" className="mt-3 inline-block text-sm font-bold text-emerald-700">Open support inbox →</a>}
    {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{message}</p>}

    <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-3xl bg-slate-950 p-6 text-white sm:p-7">
        <p className="text-sm font-bold text-emerald-300">Your booking link</p>
        <p className="mt-3 break-all text-xl font-black sm:text-2xl">{bookingUrl.replace(/^https?:\/\//, '')}</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">Put it in your Instagram bio and WhatsApp status. Clients pick a package and a free slot; you confirm.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => void copyLink()} className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400">Copy link</button>
          <a href={`https://wa.me/?text=${encodeURIComponent(`Book a session with ${account.business.name}: ${bookingUrl}`)}`} target="_blank" rel="noreferrer" className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold hover:bg-white/10">Share on WhatsApp</a>
          <a href="/tools/booking/account?tab=appointments" className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold hover:bg-white/10">View appointments</a>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-7">
        <div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-500">Your plan</p>{billing?.status === 'past_due' && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">Payment failed</span>}{billing?.status === 'non_renewing' && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">Cancelled</span>}</div>
        <p className="mt-2 text-3xl font-black capitalize">{plan ?? (billing === undefined ? '…' : 'Unavailable')}</p>
        <div className="mt-5">
          <div className="flex justify-between text-sm"><span className="font-bold">Client galleries</span><span className="text-slate-600">{galleries ?? '–'} of {billing ? (allowance == null ? 'unlimited' : allowance) : '–'}</span></div>
          {allowance != null && <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${atLimit ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (used / Math.max(allowance, 1)) * 100)}%` }} /></div>}
        </div>
        {billing && <div className="mt-4 flex justify-between text-sm"><span className="font-bold">Storage</span><span className="text-slate-600">{(billing.storageUsedBytes / 1024 ** 3).toFixed(1)} of {(billing.storageLimitBytes / 1024 ** 3).toFixed(0)} GB</span></div>}
        {billing?.currentPeriodEnd && plan !== 'free' && <p className="mt-4 text-sm text-slate-600">{billing.status === 'non_renewing' ? 'Access ends' : 'Renews'} on {new Date(billing.currentPeriodEnd).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
        {billing?.status === 'past_due' && <p className="mt-2 text-sm text-amber-800">Your last renewal did not go through. Update your card to keep your plan.</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          {plan && plan !== 'studio' && <a href="/pricing" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">{plan === 'free' ? 'Upgrade' : 'Upgrade to Studio'}</a>}
          {billing?.canManage && <button type="button" onClick={() => act(openBillingPortal)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold hover:border-slate-950">Manage subscription</button>}
          {plan === 'free' && <button type="button" onClick={() => act(() => startCheckout('gallery_pass'))} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold hover:border-slate-950">+1 gallery · ₦2,500</button>}
        </div>
      </section>
    </div>

    <h2 className="mt-12 text-xl font-black">Your workspace</h2>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => <a key={tool.id} href={tool.href} className="group rounded-3xl border border-slate-200 bg-white p-6 transition hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-900/5">
        <div className="flex items-center justify-between"><span className="text-xs font-bold tracking-[0.12em] text-emerald-700 uppercase">{tool.category}</span>{tool.guestAccess && <span className="text-xs text-slate-400">Saved on this device</span>}</div>
        <h3 className="mt-4 text-lg font-black group-hover:text-emerald-800">{tool.name}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{tool.description}</p>
      </a>)}
    </div>

    <section className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white p-6"><h2 className="font-black">Coming soon</h2><ul className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">{comingSoon.map((item) => <li key={item}>• {item}</li>)}</ul></section>
  </section>
}

export function AccountProfilePage() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined)

  useEffect(() => { void loadAccount().then(setAccount).catch(() => setAccount(null)) }, [])

  if (account === undefined) return <AccountLoading />
  if (!account) return <ProviderBooking initialMode="signin" />

  return <section className="mx-auto max-w-2xl px-5 py-10 sm:px-8">
    <a href="/account" className="text-sm font-bold text-emerald-700">← Dashboard</a>
    <h1 className="mt-4 text-3xl font-black">My profile</h1>
    <p className="mt-2 text-slate-600">Account identity is separate from the business details used by individual PaperlinkOS tools.</p>
    <section className="mt-7 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-black">Account email</h2>
      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{account.account.email}</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">Email changes are not available yet. To change your password, <a href="/forgot-password" className="font-bold text-emerald-700">ask for a reset link</a>.</p>
    </section>
    <section className="mt-5 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-black">Tool business settings</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Your Booking business name, public booking URL and WhatsApp contact live inside Booking, where they affect the client-facing booking page.</p>
      <a href="/tools/booking/account?tab=profile" className="mt-4 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Manage Booking business settings</a>
    </section>
  </section>
}
