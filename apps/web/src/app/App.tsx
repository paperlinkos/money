import { useEffect } from 'react'
import { SiteFooter, SiteHeader } from './layout'
import { HomePage } from '../pages/HomePage'
import { InvoicePage } from '../modules/invoice/InvoicePage'
import { DebtPage } from '../modules/debts/DebtPage'
import { GearPage } from '../modules/gear/GearPage'
import { BookingPage } from '../modules/booking/BookingPage'
import { ProviderBooking, PublicBooking } from '../modules/booking/AccountBooking'
import { ExpensePage } from '../modules/expenses/ExpensePage'
import { ProofPage } from '../modules/proof/ProofPage'
import { PublicReviewPage } from '../modules/proof/PublicReviewPage'
import { ContactPage, FeedbackPage, FutureToolPage, PricingPage, PrivacyPage, ToolsPage } from '../pages/InfoPages'

export function App() {
  const path = window.location.pathname
  const publicBookingSlug = path.match(/^\/book\/([a-z0-9-]{3,60})\/?$/)?.[1]
  const reviewToken = path.match(/^\/review\/([A-Za-z0-9_-]{20,})\/?$/)?.[1]
  const page = reviewToken ? <PublicReviewPage token={reviewToken} /> : publicBookingSlug ? <PublicBooking slug={publicBookingSlug} />
    : path === '/book' || path === '/book/' ? <PublicBookingDirectory />
    : path === '/tools/booking/account' ? <ProviderBooking />
    : path === '/tools/invoice' ? <InvoicePage />
      : path === '/tools/debts' ? <DebtPage />
        : path === '/tools/gear' ? <GearPage />
          : path === '/tools/booking' ? <BookingPage />
            : path === '/tools/expenses' ? <ExpensePage />
              : path === '/tools/proof' ? <ProofPage />
              : path === '/tools' ? <ToolsPage />
                : path === '/tools/inventory' ? <FutureToolPage name="Inventory Tool" />
                  : path === '/pricing' ? <PricingPage />
                    : path === '/privacy' ? <PrivacyPage />
                      : path === '/contact' ? <ContactPage />
                        : path === '/feedback' ? <FeedbackPage />
                          : <HomePage />
  const titles: Record<string, string> = {
    '/tools/invoice': 'Create an invoice — Northstar', '/tools/debts': 'Debt & Payment Tracker — Northstar', '/tools/gear': 'GearList — Northstar', '/tools/booking': 'Appointment & Booking Manager — Northstar', '/tools/expenses': 'SpendTrack — Northstar', '/tools': 'Tools — Northstar', '/tools/inventory': 'Inventory Tool — Northstar', '/pricing': 'Pricing — Northstar', '/privacy': 'Privacy — Northstar', '/contact': 'Contact — Northstar', '/feedback': 'Feedback — Northstar',
  }
  const descriptions: Record<string, string> = {
    '/tools/invoice': 'Create a professional invoice or quotation from your browser.',
    '/tools/debts': 'Track customer debts, repayments, balances, and payment reminders from your browser.',
    '/tools/gear': 'Manage gear, gig checklists, and local rental enquiries with GearList.',
    '/tools/booking': 'Manage service appointments, availability, and local booking requests.',
    '/tools/expenses': 'Track local business expenses, categories, projects, and reports.',
    '/tools': 'Explore focused business tools from Northstar.',
    '/tools/inventory': 'A future Northstar tool. It is not available yet.',
    '/pricing': 'Free invoice creation today, with proposed future Northstar plans.',
    '/privacy': 'How Northstar handles locally stored invoice data in this prototype.',
    '/contact': 'Contact and feedback information for Northstar Invoice Maker.',
    '/feedback': 'Share product feedback for the Northstar Invoice Maker prototype.',
  }
  useEffect(() => {
    document.title = titles[path]?.replaceAll('Northstar', 'PaperlinkOS') ?? 'Free Invoice & Quotation Maker — PaperlinkOS'
    document.querySelector('meta[name="description"]')?.setAttribute('content', descriptions[path] ?? 'Create clear invoices and quotations from your browser, free to start.')
    const baseUrl = import.meta.env.VITE_SITE_URL?.replace(/\/$/, '')
    const canonical = baseUrl ? `${baseUrl}${path === '/' ? '/' : path}` : path
    let canonicalElement = document.querySelector('link[rel="canonical"]')
    if (!canonicalElement) {
      canonicalElement = document.createElement('link')
      canonicalElement.setAttribute('rel', 'canonical')
      document.head.appendChild(canonicalElement)
    }
    canonicalElement.setAttribute('href', canonical)
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', canonical)
  }, [path])

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-slate-950">
      <SiteHeader />
      <main className="flex-1">
        {page}
      </main>
      <SiteFooter />
    </div>
  )
}

function PublicBookingDirectory() { return <section className="mx-auto max-w-xl px-5 py-10"><h1 className="text-3xl font-black">Open a booking page</h1><p className="mt-2 text-slate-600">Ask your provider for their Paperlink Booking link. In local development, booking pages are only available on this Mac.</p></section> }
