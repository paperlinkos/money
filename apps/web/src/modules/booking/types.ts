export type AppointmentStatus = 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled' | 'No-show'
export type Service = { id: string; name: string; description: string; price: number; duration: number; buffer: number; active: boolean; archived?: boolean }
export type Customer = { id: string; name: string; phone: string; email: string; notes: string; source?: 'booking' | 'invoice' }
export type Appointment = { id: string; serviceId: string; customerId: string; customerName: string; date: string; time: string; notes: string; status: AppointmentStatus; createdAt: string }
export type Break = { id: string; day: number; start: string; end: string }
export type BookingSettings = { timezone: string; owner: string; whatsapp: string; interval: number; hours: Record<number, { open: string; close: string; enabled: boolean }>; breaks: Break[]; blocked: string[] }
export type BookingData = { version: 1; services: Service[]; customers: Customer[]; appointments: Appointment[]; settings: BookingSettings }
