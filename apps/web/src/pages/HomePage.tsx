import { tools } from '../modules/tools'
import { planCards } from '../app/billing'

const audiences = ['Photographers', 'Videographers', 'Makeup artists', 'Hair stylists', 'Event planners', 'Content creators']

const journey = [
  ['01', 'Get booked', 'Put your booking link in your Instagram bio. Clients choose a package and a free time slot, without the 40-message DM back-and-forth.', 'booking'],
  ['02', 'Shoot', 'Pack from a checklist for every job, so the spare battery and the reflector actually leave the studio, and come back.', 'gear'],
  ['03', 'Deliver', 'Send a private gallery. Your client picks favourites, asks for edits on specific shots and approves the final version in writing.', 'proof'],
  ['04', 'Get paid', 'Quote before, invoice after, and see exactly who still owes you. Send a polite WhatsApp reminder in one tap.', 'invoice'],
] as const

const questions = [
  ['Is it really free to start?', 'Yes. Your booking link, invoices, payment tracker, gear checklists and your first client gallery are free with no time limit. You only pay when you need more galleries.'],
  ['How do I pay for Pro or Studio?', 'With your card, bank transfer or USSD through Paystack. Plans renew monthly and you can cancel any time from your dashboard; you keep access until the end of the month you paid for.'],
  ['Do my clients need an account?', 'No. Clients open your booking link or gallery link and use it straight away, on any phone.'],
  ['What is a gallery pass?', 'A one-time ₦2,500 payment for one extra client gallery, for when you have a busy month but do not want a subscription.'],
  ['Where is my work saved?', 'Bookings and client galleries are saved to your account. Invoices, the payment tracker, gear and expenses currently save on the device you use, so download backups of anything important.'],
]

export function HomePage() {
  return <>
    <section className="relative overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.28),transparent_40%),radial-gradient(circle_at_10%_90%,rgba(251,146,60,0.18),transparent_40%)]" />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm font-bold text-emerald-300">For Nigerian creatives</p>
          <h1 className="mt-6 max-w-xl text-5xl font-black tracking-[-0.05em] text-balance sm:text-6xl">Run your creative business from one link.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">Bookings, client galleries, invoices and payment tracking in one place. Spend less time in DMs chasing approvals and balances, and more time shooting.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a className="rounded-full bg-emerald-500 px-6 py-3 font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400" href="/account?mode=signup">Start free</a>
            <a className="rounded-full border border-white/20 px-6 py-3 font-bold text-white transition hover:bg-white/10" href="#how-it-works">See how it works</a>
          </div>
          <p className="mt-5 text-sm text-slate-400">Free forever plan. No card needed.</p>
        </div>
        <HeroPreview />
      </div>
    </section>

    <section className="border-b border-slate-900/10 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-6 text-sm font-bold text-slate-500 sm:px-8"><span className="text-slate-900">Built for</span>{audiences.map((item) => <span key={item}>{item}</span>)}</div>
    </section>

    <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <p className="text-sm font-bold tracking-[0.16em] text-emerald-700 uppercase">How it works</p>
      <h2 className="mt-4 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">From the first DM to the final payment.</h2>
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {journey.map(([step, title, copy, id]) => {
          const tool = tools.find((item) => item.id === id)
          return <article key={step} className="group rounded-3xl border border-slate-200 bg-white p-7 transition hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-900/5">
            <div className="flex items-center justify-between"><span className="text-sm font-black text-emerald-700">{step}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{tool?.name}</span></div>
            <h3 className="mt-8 text-2xl font-black tracking-tight">{title}</h3>
            <p className="mt-3 leading-7 text-slate-600">{copy}</p>
            {tool?.href && <a href={tool.href} className="mt-6 inline-flex text-sm font-bold text-emerald-700 group-hover:text-emerald-800">Try {tool.short.toLowerCase()} →</a>}
          </article>
        })}
      </div>
    </section>

    <section className="border-y border-slate-900/10 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div>
          <p className="text-sm font-bold tracking-[0.16em] text-emerald-700 uppercase">Client galleries</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">“Which one did you like again?” Never again.</h2>
          <p className="mt-5 leading-8 text-slate-600">Your client opens one private link, taps a heart on their favourites, comments on the exact photo they want retouched and approves the final edit. You get a clear record of what was approved and when, instead of a screenshot in WhatsApp.</p>
          <a href="/tools/proof" className="mt-7 inline-flex rounded-full bg-slate-950 px-5 py-3 font-bold text-white hover:bg-emerald-700">Create your first gallery free</a>
        </div>
        <GalleryPreview />
      </div>
    </section>

    <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><p className="text-sm font-bold tracking-[0.16em] text-emerald-700 uppercase">Pricing</p><h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Less than one transport fare to a shoot.</h2></div>
        <a href="/pricing" className="font-bold text-emerald-700 hover:text-emerald-800">Compare plans →</a>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {planCards.map((plan) => <article key={plan.id} className={`rounded-3xl border p-7 ${plan.id === 'pro' ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center justify-between"><h3 className="text-lg font-black">{plan.name}</h3>{plan.id === 'pro' && <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-black text-slate-950">Most popular</span>}</div>
          <p className="mt-4"><span className="text-4xl font-black tracking-tight">{plan.price}</span> <span className={plan.id === 'pro' ? 'text-slate-400' : 'text-slate-500'}>{plan.period}</span></p>
          <p className={`mt-3 text-sm leading-6 ${plan.id === 'pro' ? 'text-slate-300' : 'text-slate-600'}`}>{plan.blurb}</p>
        </article>)}
      </div>
    </section>

    <section className="mx-auto max-w-4xl px-5 pb-20 sm:px-8">
      <h2 className="text-center text-3xl font-black tracking-tight">Questions creatives ask us</h2>
      <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-6">{questions.map(([question, answer]) => <details key={question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-slate-900">{question}<span className="text-xl text-emerald-700 transition group-open:rotate-45">+</span></summary><p className="mt-3 max-w-2xl leading-7 text-slate-600">{answer}</p></details>)}</div>
    </section>

    <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
      <div className="rounded-3xl bg-emerald-500 px-6 py-12 text-slate-950 sm:px-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div><h2 className="max-w-xl text-3xl font-black tracking-tight sm:text-4xl">Your next client is one link away.</h2><p className="mt-3 max-w-xl leading-7 text-emerald-950">Set up your booking page in about five minutes. It is free.</p></div>
          <a href="/account?mode=signup" className="w-fit rounded-full bg-slate-950 px-6 py-3 font-bold text-white hover:bg-slate-800">Start free</a>
        </div>
      </div>
    </section>
  </>
}

const tiles = ['from-amber-200 to-orange-400', 'from-rose-200 to-fuchsia-400', 'from-sky-200 to-indigo-400', 'from-emerald-200 to-teal-500', 'from-orange-200 to-rose-400', 'from-violet-200 to-purple-500']

function HeroPreview() {
  return <div className="relative mx-auto w-full max-w-sm">
    <div className="rounded-[2.5rem] border border-white/10 bg-white/5 p-3 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="overflow-hidden rounded-[2rem] bg-stone-50 text-slate-950">
        <div className="bg-gradient-to-br from-orange-300 via-rose-400 to-fuchsia-500 px-5 pb-10 pt-6"><p className="text-xs font-bold text-white/80">/book/tolu-captures</p></div>
        <div className="-mt-7 px-5 pb-6">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border-4 border-stone-50 bg-slate-950 text-lg font-black text-white">T</div>
          <p className="mt-2 text-lg font-black">Tolu Captures</p>
          <p className="text-xs text-slate-500">Portraits & events · Lekki, Lagos</p>
          <div className="mt-4 space-y-2">
            {[['Studio portrait', '1 hr', '₦45,000'], ['Birthday shoot', '3 hrs', '₦120,000'], ['Wedding coverage', 'Full day', '₦450,000']].map(([name, time, price], index) => <div key={name} className={`flex items-center justify-between rounded-xl border p-3 text-sm ${index === 1 ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}><div><p className="font-bold">{name}</p><p className="text-xs text-slate-500">{time}</p></div><p className="font-black">{price}</p></div>)}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-xs font-bold">{['10:00', '11:30', '14:00', '16:30'].map((time, index) => <span key={time} className={`rounded-lg py-2 ${index === 2 ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>{time}</span>)}</div>
          <p className="mt-3 rounded-xl bg-emerald-600 py-3 text-center text-sm font-black text-white">Request booking</p>
        </div>
      </div>
    </div>
    <div className="absolute -bottom-7 -left-8 hidden rounded-2xl bg-white p-3 text-slate-950 shadow-xl sm:block"><p className="text-xs font-bold text-slate-500">Gallery</p><p className="text-sm font-black">Bisi approved 24 photos ✓</p></div>
    <div className="absolute -right-6 top-4 hidden rounded-2xl bg-white p-3 text-slate-950 shadow-xl sm:block"><p className="text-xs font-bold text-slate-500">Payment recorded</p><p className="text-sm font-black text-emerald-700">+ ₦120,000</p></div>
  </div>
}

function GalleryPreview() {
  return <div className="rounded-3xl border border-slate-200 bg-stone-50 p-4 sm:p-6">
    <div className="flex items-center justify-between"><div><p className="font-black">Bisi & Femi — Engagement</p><p className="text-sm text-slate-500">Version 2 · shared with Bisi</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">Approved</span></div>
    <div className="mt-5 grid grid-cols-3 gap-2">
      {tiles.map((tile, index) => <div key={tile} className={`relative aspect-[4/5] rounded-xl bg-gradient-to-br ${tile}`}>{index % 2 === 0 && <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white text-sm text-rose-500 shadow">♥</span>}{index === 4 && <span className="absolute inset-x-2 bottom-2 rounded-lg bg-white/95 p-2 text-[11px] font-bold leading-4 text-slate-800 shadow">“Can you soften the shadow on my face?”</span>}</div>)}
    </div>
  </div>
}
