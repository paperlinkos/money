import { emptyBusinessProfile } from './invoice-utils'
import type { BusinessProfile, Customer, InvoiceDocument } from './types'

const DOCUMENTS_KEY = 'northstar.invoice.documents.v2'
const LEGACY_DOCUMENTS_KEY = 'northstar.invoice.drafts.v1'
const PROFILE_KEY = 'northstar.invoice.profile.v1'
const CUSTOMERS_KEY = 'northstar.invoice.customers.v1'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch { return fallback }
}

export function loadDocuments() {
  const current = read<InvoiceDocument[]>(DOCUMENTS_KEY, [])
  const source = current.length ? current : read<InvoiceDocument[]>(LEGACY_DOCUMENTS_KEY, [])
  return source
    .filter((document) => document && typeof document.id === 'string' && typeof document.number === 'string')
    .map((document) => ({ ...document, customer: { ...document.customer, phone: document.customer.phone ?? '' } }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function saveDocument(document: InvoiceDocument) {
  const documents = loadDocuments().filter((entry) => entry.id !== document.id)
  const next = [{ ...document, updatedAt: new Date().toISOString() }, ...documents]
  localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(next))
  return next
}

export function removeDocument(id: string) {
  const next = loadDocuments().filter((document) => document.id !== id)
  localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(next))
  return next
}

export function loadProfile() { return { ...emptyBusinessProfile(), ...read<BusinessProfile>(PROFILE_KEY, emptyBusinessProfile()) } }
export function saveProfile(profile: BusinessProfile) { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); return profile }

export function loadCustomers() { return read<Customer[]>(CUSTOMERS_KEY, []).filter((customer) => customer && typeof customer.id === 'string' && typeof customer.name === 'string').sort((a, b) => a.name.localeCompare(b.name)) }
export function saveCustomer(customer: Customer) {
  const customers = loadCustomers().filter((entry) => entry.id !== customer.id)
  const next = [{ ...customer, updatedAt: new Date().toISOString() }, ...customers].sort((a, b) => a.name.localeCompare(b.name))
  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(next)); return next
}
export function removeCustomer(id: string) { const next = loadCustomers().filter((customer) => customer.id !== id); localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(next)); return next }
