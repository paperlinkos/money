export type Currency = 'NGN' | 'USD'
export type DocumentType = 'invoice' | 'quotation'

export type LineItem = {
  id: string
  description: string
  quantity: number
  price: number
  discount: number
}

export type BusinessProfile = {
  name: string
  email: string
  phone: string
  address: string
  bank: string
  logo?: string
}

export type Customer = {
  id: string
  name: string
  phone: string
  email: string
  address: string
  updatedAt: string
}

export type InvoiceDocument = {
  id: string
  type: DocumentType
  number: string
  issueDate: string
  dueDate: string
  currency: Currency
  taxRate: number
  business: BusinessProfile
  customer: Omit<Customer, 'id' | 'updatedAt'>
  notes: string
  items: LineItem[]
  updatedAt: string
}

export type Totals = { subtotal: number; discount: number; tax: number; total: number }
