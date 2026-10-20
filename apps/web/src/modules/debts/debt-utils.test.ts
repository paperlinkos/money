import { describe, expect, it } from 'vitest'
import { balanceMinor, debtStatus, parseAmountToMinor } from './debt-utils'
import type { Debt, Payment } from './types'

const debt: Debt = { id: 'd1', customerId: 'c1', customerName: 'Ada', description: 'Stock', originalAmountMinor: 150050, currency: 'NGN', recordedDate: '2026-01-01', dueDate: '2026-01-10', notes: '', createdAt: '', updatedAt: '' }
const payment = (amountMinor: number): Payment => ({ id: 'p', debtId: 'd1', amountMinor, date: '2026-01-02', note: '', createdAt: '' })

describe('debt amounts and status', () => {
  it('parses decimal currency precisely into minor units', () => { expect(parseAmountToMinor('1,500.50')).toBe(150050); expect(parseAmountToMinor('1.234')).toBeNull() })
  it('maintains correct outstanding balance and status', () => { expect(balanceMinor(debt, [payment(5050)])).toBe(145000); expect(debtStatus(debt, [payment(5050)], '2026-01-05')).toBe('partial'); expect(debtStatus(debt, [payment(5050)], '2026-01-11')).toBe('overdue') })
  it('marks a fully repaid debt as paid even after its due date', () => { expect(debtStatus(debt, [payment(150050)], '2026-02-01')).toBe('paid') })
})
