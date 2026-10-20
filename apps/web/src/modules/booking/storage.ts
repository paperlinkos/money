import type { BookingData, Customer } from './types'
const KEY = 'northstar.booking.v1'
const hours = () => Object.fromEntries([0,1,2,3,4,5,6].map(day => [day, { open: '09:00', close: '17:00', enabled: day > 0 && day < 6 }]))
export const emptyBooking = (): BookingData => ({ version: 1, services: [], customers: [], appointments: [], settings: { timezone: 'Africa/Lagos', owner: '', whatsapp: '', interval: 30, hours: hours(), breaks: [], blocked: [] } })
export const validBooking = (value: unknown): value is BookingData => Boolean(value && typeof value === 'object' && (value as BookingData).version === 1 && Array.isArray((value as BookingData).services) && Array.isArray((value as BookingData).customers) && Array.isArray((value as BookingData).appointments))
export function loadBooking() { try { const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return validBooking(parsed) ? parsed : emptyBooking() } catch { return emptyBooking() } }
export const saveBooking = (data: BookingData) => { localStorage.setItem(KEY, JSON.stringify(data)); return data }
export function sharedCustomers(data: BookingData): Customer[] { try { const invoices = JSON.parse(localStorage.getItem('northstar.invoice.customers.v1') ?? '[]') as Array<{ id: string; name: string; phone?: string; email?: string }>; return [...invoices.filter(x => x?.id && x?.name).map(x => ({ id: `invoice:${x.id}`, name: x.name, phone: x.phone ?? '', email: x.email ?? '', notes: '', source: 'invoice' as const })), ...data.customers].sort((a,b) => a.name.localeCompare(b.name)) } catch { return data.customers } }
