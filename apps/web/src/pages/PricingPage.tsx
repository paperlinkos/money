import { useEffect, useState } from 'react'
import { comingSoon, galleryPass, loadBilling, planCards, startCheckout, type Billing, type Product } from '../app/billing'

export function PricingPage() {
  const [billing, setBilling] = useState<Billing | null | undefined>(undefined)
  const [busy, setBusy] = useState<Product | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { void loadBilling().then(setBilling).catch(() => setBilling(null)) }, [])

  async function buy(product: Product) {
    setBusy(product); setError('')
    try { await startCheckout(product) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start checkout.'); setBusy(null) }
  }

  const current = billing?.plan
  return <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-bold tracking-[0.16em] text-emerald-700 uppercase">Pricing</p>
      <h1 className="mt-4 text-4xl font-black tracking-tight text-balance sm:text-5xl">Start free. Upgrade when clients keep coming.</h1>
      <p className="mt-5 text-lg leading-8 text-slate-600">Pay monthly with card, transfer or USSD through Paystack. Cancel any time and keep access until the end of the month you paid for.</p>
    </div>
    {error && <p role="alert" className="mx-auto mt-8 max-w-xl rounded-xl bg-rose-50 p-4 text-center text-sm font-bold text-rose-800">{error}</p>}
    <div className="mt-12 grid gap-5 lg:grid-cols-3">
      {planCards.map((plan) => {
        const featured = plan.id === 'pro'
        const isCurrent = current === plan.id
        return <article key={plan.id} className={`flex flex-col rounded-3xl border p-7 ${featured ? 'border-slate-950 bg-slate-950 text-white shadow-2xl shadow-slate-900/20' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center justify-between"><h2 className="text-xl font-black">{plan.name}</h2>{isCurrent ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">Your plan</span> : featured && <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-black text-slate-950">Most popular</span>}</div>
          <p className="mt-5"><span className="text-5xl font-black tracking-tight">{plan.price}</span> <span className={featured ? 'text-slate-400' : 'text-slate-500'}>{plan.period}</span></p>
          <p className={`mt-3 leading-7 ${featured ? 'text-slate-300' : 'text-slate-600'}`}>{plan.blurb}</p>
          <ul className="mt-7 flex-1 space-y-3 text-sm">{plan.features.map((feature) => <li key={feature} className="flex gap-3"><span className={featured ? 'text-emerald-400' : 'text-emerald-600'}>✓</span>{feature}</li>)}</ul>
          {plan.id === 'free'
            ? <a href={billing ? '/account' : '/account?mode=signup'} className="mt-8 rounded-full border border-slate-300 px-5 py-3 text-center font-bold hover:border-slate-950">{billing ? 'Go to dashboard' : 'Start free'}</a>
            : <button type="button" disabled={isCurrent || busy !== null} onClick={() => void buy(plan.id)} className={`mt-8 rounded-full px-5 py-3 font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${featured ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'bg-slate-950 text-white hover:bg-emerald-700'}`}>{isCurrent ? 'Current plan' : busy === plan.id ? 'Opening Paystack…' : `Get ${plan.name}`}</button>}
        </article>
      })}
    </div>

    <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-dashed border-slate-300 bg-white p-7 md:flex-row md:items-center md:justify-between">
      <div><p className="text-sm font-bold text-emerald-700">One-time</p><h2 className="mt-1 text-xl font-black">Gallery pass · {galleryPass.price}</h2><p className="mt-1 text-slate-600">{galleryPass.copy}</p></div>
      <button type="button" disabled={busy !== null} onClick={() => void buy('gallery_pass')} className="w-fit rounded-full border border-slate-950 px-5 py-3 font-bold hover:bg-slate-950 hover:text-white disabled:opacity-60">{busy === 'gallery_pass' ? 'Opening Paystack…' : 'Buy a gallery pass'}</button>
    </div>

    <div className="mt-12 grid gap-6 md:grid-cols-2">
      <section className="rounded-3xl bg-stone-100 p-7"><h2 className="font-black">Coming soon to every plan</h2><ul className="mt-4 space-y-2 text-sm text-slate-600">{comingSoon.map((item) => <li key={item}>• {item}</li>)}</ul></section>
      <section className="rounded-3xl bg-stone-100 p-7"><h2 className="font-black">What counts as a gallery?</h2><p className="mt-4 text-sm leading-6 text-slate-600">One client project, such as a wedding or a brand shoot, with as many photos, stills or PDFs and versions as you need. Archive finished projects to free up a slot.</p></section>
    </div>
  </div>
}

export function BillingReturnPage() {
  const reference = new URLSearchParams(window.location.search).get('reference')
  const [state, setState] = useState<{ status: 'checking' | 'success' | 'pending' | 'declined' | 'failed'; billing?: Billing & { paymentKind?: string } }>({ status: reference ? 'checking' : 'failed' })

  useEffect(() => {
    if (!reference) return
    void fetch('/api/billing/verify', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference }) })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) return setState({ status: 'failed' })
        setState({ status: body.paymentStatus === 'success' ? 'success' : body.paymentStatus === 'failed' ? 'declined' : 'pending', billing: body })
      })
      .catch(() => setState({ status: 'pending' }))
  }, [reference])

  const copy = {
    checking: ['Confirming your payment…', 'This takes a few seconds.'],
    success: ['Payment received. Thank you!', state.billing?.paymentKind === 'gallery_pass' ? 'Your gallery pass has been added to your account.' : `You are now on ${state.billing?.plan === 'studio' ? 'Studio' : 'Pro'}. Your new limits are active.`],
    pending: ['We are still confirming your payment', 'Paystack has not confirmed it yet. Refresh this page in a minute; you will not be charged twice.'],
    declined: ['Your payment did not go through', 'You have not been charged and your plan has not changed. You can try again with another card, bank transfer or USSD.'],
    failed: ['We could not confirm this payment', 'If money left your account, contact us with your Paystack receipt and we will sort it out.'],
  }[state.status]

  return <section className="mx-auto max-w-lg px-5 py-24 text-center">
    <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full text-2xl font-black ${state.status === 'success' ? 'bg-emerald-100 text-emerald-700' : state.status === 'failed' || state.status === 'declined' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{state.status === 'success' ? '✓' : state.status === 'failed' || state.status === 'declined' ? '!' : '…'}</div>
    <h1 className="mt-6 text-3xl font-black tracking-tight">{copy[0]}</h1>
    <p className="mt-3 leading-7 text-slate-600">{copy[1]}</p>
    <div className="mt-8 flex justify-center gap-3"><a href="/account" className="rounded-full bg-slate-950 px-5 py-3 font-bold text-white">Go to dashboard</a>{state.status === 'pending' && <button type="button" onClick={() => window.location.reload()} className="rounded-full border border-slate-300 px-5 py-3 font-bold">Check again</button>}{state.status === 'declined' && <a href="/pricing" className="rounded-full border border-slate-300 px-5 py-3 font-bold">Try again</a>}</div>
  </section>
}
