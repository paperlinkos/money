import type { Debt, DebtCurrency, DebtStatus, Payment } from './types'

export const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
export const dateToday = () => new Date().toISOString().slice(0, 10)

export function parseAmountToMinor(value: string) {
  const cleaned = value.trim().replace(/,/g, '')
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null
  const [whole, fraction = ''] = cleaned.split('.')
  const amount = Number(whole) * 100 + Number((fraction + '00').slice(0, 2))
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}

export function formatAmount(minor: number, currency: DebtCurrency) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)
}

export function paidMinor(debtId: string, payments: Payment[]) { return payments.filter((payment) => payment.debtId === debtId).reduce((total, payment) => total + payment.amountMinor, 0) }
export function balanceMinor(debt: Debt, payments: Payment[]) { return Math.max(0, debt.originalAmountMinor - paidMinor(debt.id, payments)) }
export function debtStatus(debt: Debt, payments: Payment[], today = dateToday()): DebtStatus {
  const balance = balanceMinor(debt, payments)
  if (balance === 0) return 'paid'
  if (debt.dueDate && debt.dueDate < today) return 'overdue'
  return paidMinor(debt.id, payments) > 0 ? 'partial' : 'unpaid'
}

export function reminderMessage(debt: Debt, payments: Payment[]) {
  const balance = formatAmount(balanceMinor(debt, payments), debt.currency)
  return `Hello ${debt.customerName}, a friendly reminder that ${balance} remains outstanding for ${debt.description}. Please let us know when payment can be made. Thank you.`
}
