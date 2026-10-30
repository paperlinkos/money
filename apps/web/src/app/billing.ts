export type PlanId = 'free' | 'pro' | 'studio'
export type Product = 'pro' | 'studio' | 'gallery_pass'
export type Billing = { plan: PlanId; status: string | null; currentPeriodEnd: string | null; galleryCredits: number; galleryAllowance: number | null; canManage: boolean; billingConfigured: boolean }

// Mirrors apps/api/src/core/plans.ts. The API is the source of truth for limits.
export const planCards = [
  { id: 'free' as const, name: 'Free', price: '₦0', period: 'forever', blurb: 'Everything you need to look professional from day one.', features: ['Your own booking link', '1 client gallery', 'Invoices & quotations', 'Payment & debt tracker', 'Gear checklists and expense tracker'] },
  { id: 'pro' as const, name: 'Pro', price: '₦5,000', period: 'per month', blurb: 'For creatives delivering work to clients every week.', features: ['Everything in Free', '15 active client galleries', 'Version history & client approvals', 'Priority WhatsApp support'] },
  { id: 'studio' as const, name: 'Studio', price: '₦12,000', period: 'per month', blurb: 'For busy studios that never want to hit a limit.', features: ['Everything in Pro', 'Unlimited client galleries', 'Early access to new features'] },
]
export const galleryPass = { price: '₦2,500', copy: 'One extra client gallery, yours to keep. No subscription.' }
export const comingSoon = ['WhatsApp alerts for new bookings', 'Take deposits when clients book', 'Invoices saved to your account across devices']

export async function loadBilling(): Promise<Billing | null> {
  const response = await fetch('/api/billing/me', { credentials: 'include' })
  if (!response.ok) return null
  return response.json() as Promise<Billing>
}

// Sends the person to Paystack checkout, or to sign up first if they have no account.
export async function startCheckout(product: Product) {
  const response = await fetch('/api/billing/checkout', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product }) })
  if (response.status === 401) return window.location.assign(`/account?mode=signup&next=${encodeURIComponent('/pricing')}`)
  const body = await response.json().catch(() => ({})) as { url?: string; error?: string }
  if (!response.ok || !body.url) throw Error(body.error ?? 'Could not start checkout.')
  window.location.assign(body.url)
}

export async function openBillingPortal() {
  const response = await fetch('/api/billing/manage', { method: 'POST', credentials: 'include' })
  const body = await response.json().catch(() => ({})) as { url?: string; error?: string }
  if (!response.ok || !body.url) throw Error(body.error ?? 'Could not open subscription settings.')
  window.location.assign(body.url)
}
