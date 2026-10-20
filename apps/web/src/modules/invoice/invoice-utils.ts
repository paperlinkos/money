import type { BusinessProfile, Currency, InvoiceDocument, LineItem, Totals } from './types'

export const today = () => new Date().toISOString().slice(0, 10)
export const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

export function generateDocumentNumber(type: InvoiceDocument['type'], existingNumbers: string[], date = new Date()) {
  const prefix = type === 'invoice' ? 'INV' : 'QUO'
  const year = date.getFullYear()
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`)
  const highest = existingNumbers.reduce((max, number) => Math.max(max, Number(number.match(pattern)?.[1] ?? 0)), 0)
  return `${prefix}-${year}-${String(highest + 1).padStart(4, '0')}`
}

export function createDocument(existingNumbers: string[] = [], profile: BusinessProfile = emptyBusinessProfile()): InvoiceDocument {
  return {
    id: newId(), type: 'invoice', number: generateDocumentNumber('invoice', existingNumbers), issueDate: today(), dueDate: today(), currency: 'NGN', taxRate: 7.5,
    business: profile, customer: { name: '', phone: '', email: '', address: '' }, notes: 'Thank you for your business.',
    items: [{ id: newId(), description: '', quantity: 1, price: 0, discount: 0 }], updatedAt: new Date().toISOString(),
  }
}

export function emptyBusinessProfile(): BusinessProfile { return { name: '', email: '', phone: '', address: '', bank: '' } }

export function getTotals(items: LineItem[], taxRate: number): Totals {
  const clean = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0
  const subtotal = items.reduce((sum, item) => sum + clean(item.quantity) * clean(item.price), 0)
  const discount = items.reduce((sum, item) => sum + clean(item.quantity) * clean(item.price) * Math.min(100, clean(item.discount)) / 100, 0)
  const tax = (subtotal - discount) * Math.min(100, clean(taxRate)) / 100
  return { subtotal, discount, tax, total: subtotal - discount + tax }
}

export function formatMoney(value: number, currency: Currency) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}
