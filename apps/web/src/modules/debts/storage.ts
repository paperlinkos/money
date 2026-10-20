import type { Debt, DebtCustomer, DebtData, Payment } from './types'

const KEY = 'northstar.debts.v1'
const EMPTY: DebtData = { version: 1, customers: [], debts: [], payments: [] }

function validData(value: unknown): value is DebtData {
  if (!value || typeof value !== 'object') return false
  const data = value as DebtData
  return data.version === 1 && Array.isArray(data.customers) && Array.isArray(data.debts) && Array.isArray(data.payments)
}

export function loadDebtData(): DebtData {
  try { const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return validData(parsed) ? parsed : { ...EMPTY } } catch { return { ...EMPTY } }
}
export function saveDebtData(data: DebtData) { localStorage.setItem(KEY, JSON.stringify(data)); return data }
export function debtCustomers(data: DebtData): DebtCustomer[] {
  const local = data.customers.filter((customer) => customer && typeof customer.id === 'string' && typeof customer.name === 'string')
  try {
    const invoice = JSON.parse(localStorage.getItem('northstar.invoice.customers.v1') ?? '[]') as unknown[]
    const invoiceCustomers = invoice.filter((item): item is { id: string; name: string; phone?: string; email?: string } => Boolean(item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string' && typeof (item as { name?: unknown }).name === 'string')).map((customer) => ({ id: `invoice:${customer.id}`, name: customer.name, phone: customer.phone ?? '', email: customer.email ?? '', source: 'invoice' as const }))
    return [...invoiceCustomers, ...local].sort((a, b) => a.name.localeCompare(b.name))
  } catch { return local }
}
export function isValidBackup(value: unknown): value is DebtData { return validData(value) }
export function makeData(customers: DebtCustomer[], debts: Debt[], payments: Payment[]): DebtData { return { version: 1, customers, debts, payments } }
