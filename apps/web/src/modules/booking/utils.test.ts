import { describe, expect, it } from 'vitest'
import { canSchedule, serviceEnd, slots } from './utils'
import { emptyBooking } from './storage'
import type { Appointment, Service } from './types'
const service: Service = { id: 's', name: 'Cut', description: '', price: 5000, duration: 60, buffer: 15, active: true }
const appointment: Appointment = { id: 'a', serviceId: 's', customerId: 'c', customerName: 'Ada', date: '2026-10-20', time: '10:00', notes: '', status: 'Confirmed', createdAt: '' }
describe('booking availability', () => { it('includes duration and cleanup buffer', () => expect(serviceEnd('10:00', service)).toBe(675)); it('prevents overlaps and respects working hours', () => { const data = emptyBooking(); expect(canSchedule('2026-10-20', '10:30', service, [appointment], [service], data.settings)).toBe(false); expect(canSchedule('2026-10-20', '17:00', service, [], [service], data.settings)).toBe(false) }); it('excludes breaks and blocked dates from slots', () => { const data = emptyBooking(); data.settings.breaks = [{ id: 'b', day: 2, start: '12:00', end: '13:00' }]; expect(slots('2026-10-20', service, [], [service], data.settings)).not.toContain('12:00'); data.settings.blocked = ['2026-10-20']; expect(slots('2026-10-20', service, [], [service], data.settings)).toEqual([]) }) })
