export type DebtCurrency = 'NGN' | 'USD'
export type DebtStatus = 'unpaid' | 'partial' | 'paid' | 'overdue'

export type DebtCustomer = {
  id: string
  name: string
  phone: string
  email: string
  source: 'invoice' | 'debts'
}

export type Payment = {
  id: string
  debtId: string
  amountMinor: number
  date: string
  note: string
  createdAt: string
}

export type Debt = {
  id: string
  customerId: string
  customerName: string
  description: string
  originalAmountMinor: number
  currency: DebtCurrency
  recordedDate: string
  dueDate?: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type DebtData = { version: 1; customers: DebtCustomer[]; debts: Debt[]; payments: Payment[] }
