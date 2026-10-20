const navigation = [
  { label: 'Tools', href: '/tools' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/pricing' },
]

export function SiteHeader() {
  return (
    <header className="border-b border-slate-900/10 bg-stone-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <a className="text-lg font-black tracking-tight" href="/" aria-label="PaperlinkOS home">
          Paperlink<span className="text-emerald-600">OS</span>
        </a>
        <nav aria-label="Main navigation">
          <ul className="flex items-center gap-3 text-sm font-medium text-slate-700 sm:gap-6">
            {navigation.map((item) => (
              <li key={item.href}><a className="transition hover:text-emerald-700" href={item.href}>{item.label}</a></li>
            ))}
            <li><a className="rounded-full bg-slate-950 px-3 py-2 text-white transition hover:bg-emerald-700 sm:px-4" href="/tools/invoice">Create invoice</a></li>
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
        <p>© {new Date().getFullYear()} PaperlinkOS. Simple tools for independent work.</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 font-medium text-slate-800" aria-label="Footer navigation"><a href="/#tools" className="hover:text-emerald-700">Tools</a><a href="/privacy" className="hover:text-emerald-700">Privacy</a><a href="/contact" className="hover:text-emerald-700">Contact</a><a href="/feedback" className="hover:text-emerald-700">Feedback</a></nav>
      </div>
    </footer>
  )
}
