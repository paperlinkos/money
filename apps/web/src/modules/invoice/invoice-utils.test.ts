import { describe, expect, it } from 'vitest'
import { generateDocumentNumber, getTotals } from './invoice-utils'

describe('getTotals', () => {
  it('calculates subtotal, per-item discounts, tax and total accurately', () => {
    expect(getTotals([
      { id: 'a', description: 'Design', quantity: 2, price: 100, discount: 10 },
      { id: 'b', description: 'Hosting', quantity: 1, price: 50, discount: 0 },
    ], 7.5)).toEqual({ subtotal: 250, discount: 20, tax: 17.25, total: 247.25 })
  })

  it('treats invalid or negative monetary input as zero', () => {
    expect(getTotals([{ id: 'a', description: 'Test', quantity: -1, price: Number.NaN, discount: 500 }], -5)).toEqual({ subtotal: 0, discount: 0, tax: 0, total: 0 })
  })
})

describe('generateDocumentNumber', () => {
  it('uses the next available yearly sequence for each document type', () => {
    const date = new Date('2026-05-01T12:00:00Z')
    expect(generateDocumentNumber('invoice', ['INV-2026-0002', 'INV-2026-0009', 'QUO-2026-0007'], date)).toBe('INV-2026-0010')
    expect(generateDocumentNumber('quotation', ['INV-2026-0002', 'INV-2026-0009', 'QUO-2026-0007'], date)).toBe('QUO-2026-0008')
  })
})
