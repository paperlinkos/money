import { useEffect, useState, type FormEvent } from 'react'

type InboxMessage = { id: string; kind: string; message: string; contact: string; would_pay: string; created_at: string }
type Inbox = { messages: InboxMessage[]; disk: { usedPercent: number; freeGb: number; warning: boolean } }

const input = 'mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5'
const primary = 'mt-5 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60'

async function post(url: string, body?: unknown) {
  const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}))
  if (!response.ok) throw Error(data.error ?? 'Something went wrong. Please try again.')
  return data
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true)
    void post('/api/auth/forgot-password', { email }).then((result) => setSent(result.delivery === 'email'
      ? 'If that email has an account, a reset link is on its way. It works once and expires in one hour.'
      : 'Request received. If that email has an account, we will email a reset link to that address, usually within one working day.')).catch((failure: Error) => setError(failure.message)).finally(() => setBusy(false))
  }
  return <section className="mx-auto max-w-md px-5 py-10">
    <a href="/account" className="text-sm font-bold text-emerald-700">← Sign in</a>
    <h1 className="mt-4 text-3xl font-black">Forgot your password?</h1>
    {sent ? <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">{sent}</p>
      : <form onSubmit={submit} className="mt-6 rounded-2xl border bg-white p-5">
        <label className="block text-sm font-bold">Account email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={input} /></label>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <button disabled={busy} className={primary}>{busy ? 'Sending…' : 'Ask for a reset link'}</button>
      </form>}
  </section>
}

export function ResetPasswordPage() {
  const [token] = useState(() => window.location.hash.slice(1))
  const [pass, setPass] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Keep the single-use token out of browser history once it has been read.
  useEffect(() => { window.history.replaceState(null, '', window.location.pathname) }, [])
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true)
    void post('/api/auth/reset-password', { token, password: pass }).then(() => setDone(true)).catch((failure: Error) => setError(failure.message)).finally(() => setBusy(false))
  }
  return <section className="mx-auto max-w-md px-5 py-10">
    <h1 className="text-3xl font-black">Choose a new password</h1>
    {done ? <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"><p role="status">Your password is changed and you have been signed out of your other devices.</p><a href="/account" className="mt-3 inline-block font-bold underline">Sign in</a></div>
      : !token ? <p className="mt-6 text-slate-600">This reset link is incomplete. <a href="/forgot-password" className="font-bold text-emerald-700">Ask for a new one</a>.</p>
        : <form onSubmit={submit} className="mt-6 rounded-2xl border bg-white p-5">
          <label className="block text-sm font-bold">New password<input type="password" required minLength={8} autoComplete="new-password" value={pass} onChange={(event) => setPass(event.target.value)} className={input} /></label>
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <button disabled={busy} className={primary}>{busy ? 'Saving…' : 'Save new password'}</button>
        </form>}
  </section>
}

export function InboxPage() {
  const [inbox, setInbox] = useState<Inbox | null | undefined>(undefined)
  const [notice, setNotice] = useState('')
  const load = () => fetch('/api/auth/inbox', { credentials: 'include' }).then(async (response) => setInbox(response.ok ? await response.json() as Inbox : null)).catch(() => setInbox(null))
  useEffect(() => { void load() }, [])
  const act = (work: () => Promise<unknown>) => { setNotice(''); void work().catch((failure: Error) => setNotice(failure.message)) }
  const done = (id: string) => act(() => post(`/api/auth/inbox/${id}/done`).then(load))
  const emailLink = (id: string) => act(async () => {
    const { email, url } = await post(`/api/auth/inbox/${id}/reset-link`) as { email: string; url: string }
    const body = `Hello,\n\nUse this link to choose a new PaperlinkOS password. It works once and expires in one hour.\n\n${url}\n\nIf you did not ask for this, you can ignore this email.`
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Reset your PaperlinkOS password')}&body=${encodeURIComponent(body)}`
    setNotice(`Your email app should open with a message to ${email}. Send it within the hour.`)
  })
  if (inbox === undefined) return <section className="mx-auto max-w-3xl px-5 py-10"><p className="text-sm text-slate-600">Loading…</p></section>
  if (!inbox) return <section className="mx-auto max-w-3xl px-5 py-10"><h1 className="text-3xl font-black">Page not found</h1><a href="/account" className="mt-4 inline-block font-bold text-emerald-700">Go to your dashboard</a></section>
  return <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
    <a href="/account" className="text-sm font-bold text-emerald-700">← Dashboard</a>
    <h1 className="mt-4 text-3xl font-black">Support inbox</h1>
    <p className={`mt-4 rounded-xl p-3 text-sm font-bold ${inbox.disk.warning ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>Server storage: {inbox.disk.usedPercent}% used, {inbox.disk.freeGb} GB free.{inbox.disk.warning && ' Running low: add storage soon.'}</p>
    {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{notice}</p>}
    {inbox.messages.length === 0 ? <p className="mt-8 text-slate-600">No open messages.</p> : <ul className="mt-6 space-y-4">{inbox.messages.map((item) => <li key={item.id} className="rounded-2xl border bg-white p-5">
      <p className="text-xs font-bold tracking-wide text-emerald-700 uppercase">{item.kind === 'password' ? 'Password help' : item.kind} · {new Date(item.created_at).toLocaleString('en-NG')}</p>
      <p className="mt-2 leading-7 whitespace-pre-wrap">{item.message}</p>
      <p className="mt-2 text-sm text-slate-600">From: {item.contact || 'No contact given'}{item.would_pay && ` · Would pay: ${item.would_pay}`}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {item.kind === 'password' && <button type="button" onClick={() => emailLink(item.id)} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white">Email reset link</button>}
        <button type="button" onClick={() => done(item.id)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold">Mark done</button>
      </div>
    </li>)}</ul>}
  </section>
}
