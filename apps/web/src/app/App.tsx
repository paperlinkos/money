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
import { ContactPage, FeedbackPage, FutureToolPage, PrivacyPage, TermsPage, ToolsPage } from '../pages/InfoPages'
import { ForgotPasswordPage, InboxPage, ResetPasswordPage } from '../pages/SupportPages'
import { BillingReturnPage, PricingPage } from '../pages/PricingPage'
import { AccountDashboard, AccountProfilePage } from '../pages/AccountPages'

export function App() {
  const path = window.location.pathname
  const query = new URLSearchParams(window.location.search)
  const requestedBookingTab = query.get('tab')
  const bookingTab = requestedBookingTab === 'appointments' || requestedBookingTab === 'setup' || requestedBookingTab === 'profile' ? requestedBookingTab : 'overview'
  const publicBookingSlug = path.match(/^\/book\/([a-z0-9-]{3,60})\/?$/)?.[1]
  const reviewToken = path.match(/^\/review\/([A-Za-z0-9_-]{20,})\/?$/)?.[1]
  const page = reviewToken ? <PublicReviewPage token={reviewToken} /> : publicBookingSlug ? <PublicBooking slug={publicBookingSlug} />
    : path === '/book' || path === '/book/' ? <PublicBookingDirectory />
    : path === '/tools/booking/account' ? <ProviderBooking initialMode={query.get('mode') === 'signup' ? 'signup' : 'signin'} initialTab={bookingTab} />
    : path === '/account' ? <AccountDashboard initialMode={query.get('mode') === 'signup' ? 'signup' : 'signin'} />
    : path === '/account/inbox' ? <InboxPage />
    : path === '/forgot-password' ? <ForgotPasswordPage />
    : path === '/reset-password' ? <ResetPasswordPage />
    : path === '/profile' ? <AccountProfilePage />
    : path === '/billing/return' ? <BillingReturnPage />
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
                      : path === '/terms' ? <TermsPage />
                      : path === '/contact' ? <ContactPage />
                        : path === '/feedback' ? <FeedbackPage />
                          : <HomePage />
  const titles: Record<string, string> = {
    '/account': 'Dashboard', '/profile': 'My profile', '/tools/booking/account': 'Booking workspace', '/billing/return': 'Payment',
    '/tools/invoice': 'Invoices & quotations', '/tools/debts': 'Payment tracker', '/tools/gear': 'Gear checklists', '/tools/booking': 'Booking manager (offline)', '/tools/expenses': 'Expense tracker', '/tools/proof': 'Client galleries', '/tools': 'Free tools for creatives', '/tools/inventory': 'Inventory', '/pricing': 'Pricing', '/privacy': 'Privacy', '/terms': 'Terms and refunds', '/forgot-password': 'Forgot password', '/reset-password': 'Reset password', '/account/inbox': 'Support inbox', '/contact': 'Contact', '/feedback': 'Feedback',
  }
  const descriptions: Record<string, string> = {
    '/account': 'Your PaperlinkOS dashboard.', '/profile': 'Manage your PaperlinkOS account profile.', '/tools/booking/account': 'Manage your services, availability and client appointment requests.',
    '/tools/invoice': 'Create a professional invoice or quotation from your phone or browser, free.',
    '/tools/debts': 'Track what clients owe you, record part-payments and send WhatsApp reminders.',
    '/tools/gear': 'Pack for every shoot with gear checklists and prepare rental lists.',
    '/tools/booking': 'Manage service appointments and availability on this device.',
    '/tools/expenses': 'Track shoot expenses and receipts per project.',
    '/tools/proof': 'Private client galleries with favourites, comments, revision requests and approvals.',
    '/tools': 'Free invoice, payment, gear and expense tools for Nigerian creatives.',
    '/tools/inventory': 'A future PaperlinkOS tool. It is not available yet.',
    '/pricing': 'PaperlinkOS plans for creatives: Free, Pro ₦5,000/month and Studio ₦12,000/month.',
    '/privacy': 'How PaperlinkOS handles your data.',
    '/terms': 'PaperlinkOS terms of use, cancellations and refunds.',
    '/contact': 'Contact PaperlinkOS.',
    '/feedback': 'Share product feedback with PaperlinkOS.',
  }
  useEffect(() => {
    document.title = titles[path] ? `${titles[path]} — PaperlinkOS` : 'PaperlinkOS — Bookings, client galleries and invoices for creatives'
    document.querySelector('meta[name="description"]')?.setAttribute('content', descriptions[path] ?? 'Bookings, client galleries, invoices and payment tracking for Nigerian photographers, videographers and makeup artists. Free to start.')
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

  const publicReview = Boolean(reviewToken)

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-slate-950">
      {!publicReview && <SiteHeader />}
      <main className="flex-1">
        {page}
      </main>
      {!publicReview && <SiteFooter />}
    </div>
  )
}

function PublicBookingDirectory() { return <section className="mx-auto max-w-xl px-5 py-10"><h1 className="text-3xl font-black">Open a booking page</h1><p className="mt-2 text-slate-600">Ask your provider for their PaperlinkOS booking link.</p></section> }
