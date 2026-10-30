import { useEffect, useState, type FormEvent } from 'react'

type Service = { id: string; name: string; description: string; price_ngn: number; duration_minutes: number; buffer_minutes: number; active: boolean }
type Business = { name: string; slug: string; whatsapp?: string | null }
type Appointment = { id: string; service_id: string; customer_name: string; phone: string; service_name: string; starts_at: string; status: string; reference: string }
type Hours = { weekday: number; opensAt: string; closesAt: string }
type Break = { weekday: number; startsAt: string; endsAt: string }

const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const label = 'mt-3 block text-xs font-bold uppercase tracking-wide text-slate-600'
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

async function api(path: string, options?: RequestInit) {
  const response = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) }, ...options })
  const body = response.status === 204 ? null : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error ?? 'Something went wrong.')
  return body
}

function Field({ name, value, set, type = 'text' }: { name: string; value: string; set: (value: string) => void; type?: string }) {
  return <label className={label}>{name}<input className={input} type={type} value={value} onChange={(event) => set(event.target.value)} /></label>
}

export function ProviderBooking({ initialMode = 'signin', initialTab = 'overview' }: { initialMode?: 'signin' | 'signup'; initialTab?: 'overview' | 'appointments' | 'setup' | 'profile' }) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [notice, setNotice] = useState('')
  const [services, setServices] = useState<Service[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '', slug: '' })
  const [serviceForm, setServiceForm] = useState({ name: '', description: '', price: '', duration: '60', buffer: '0' })
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [settings, setSettings] = useState({ name: '', slug: '', whatsapp: '', hours: [{ weekday: 1, opensAt: '09:00', closesAt: '17:00' }] as Hours[], breaks: [] as Break[], blockedDates: [] as string[] })
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [rescheduleSlots, setRescheduleSlots] = useState<string[]>([])

  async function load() {
    try {
      const me = await api('/api/auth/me')
      const [serviceRows, appointmentRows, saved] = await Promise.all([api('/api/booking/services'), api('/api/booking/appointments'), api('/api/booking/settings')])
      setBusiness(me.business)
      setServices(serviceRows)
      setAppointments(appointmentRows)
      setSettings({ name: saved.business.name, slug: saved.business.slug, whatsapp: saved.business.whatsapp ?? '', hours: saved.hours.map((item: any) => ({ weekday: item.weekday, opensAt: item.opens_at.slice(0, 5), closesAt: item.closes_at.slice(0, 5) })), breaks: saved.breaks.map((item: any) => ({ weekday: item.weekday, startsAt: item.starts_at.slice(0, 5), endsAt: item.ends_at.slice(0, 5) })), blockedDates: saved.blockedDates })
    } catch { setBusiness(null) }
  }
  useEffect(() => { void load() }, [])

  async function authenticate(event: FormEvent) {
    event.preventDefault(); setNotice('')
    try {
      const body = mode === 'signup' ? { email: authForm.email, password: authForm.password, businessName: authForm.name, slug: authForm.slug } : { email: authForm.email, password: authForm.password }
      await api(mode === 'signup' ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify(body) })
      await load()
      window.dispatchEvent(new Event('paperlinkos:authchange'))
      const next = new URLSearchParams(window.location.search).get('next') ?? (window.location.pathname === '/account' ? '/account' : null)
      if (next?.startsWith('/') && !next.startsWith('//')) return window.location.assign(next)
      setNotice('Signed in. Your Booking workspace is account-backed.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not sign in.') }
  }

  async function saveService(event: FormEvent) {
    event.preventDefault()
    try {
      const body = { name: serviceForm.name, description: serviceForm.description, priceNgn: Number(serviceForm.price), durationMinutes: Number(serviceForm.duration), bufferMinutes: Number(serviceForm.buffer), active: editingService?.active ?? true }
      await api(editingService ? `/api/booking/services/${editingService.id}` : '/api/booking/services', { method: editingService ? 'PATCH' : 'POST', body: JSON.stringify(body) })
      setEditingService(null); setServiceForm({ name: '', description: '', price: '', duration: '60', buffer: '0' }); await load(); setNotice('Service saved.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save service.') }
  }

  async function loadRescheduleSlots(date: string, appointment: Appointment) {
    setRescheduleDate(date); setRescheduleTime('')
    if (!business || !date) return setRescheduleSlots([])
    try { setRescheduleSlots((await api(`/api/public/book/${business.slug}/availability?serviceId=${appointment.service_id}&date=${date}`)).slots) } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load availability.') }
  }

  async function reschedule() {
    if (!rescheduling || !rescheduleDate || !rescheduleTime) return
    try {
      const startsAt = new Date(`${rescheduleDate}T${rescheduleTime}:00+01:00`).toISOString()
      await api(`/api/booking/appointments/${rescheduling.id}`, { method: 'PATCH', body: JSON.stringify({ startsAt }) })
      await load(); setRescheduling(null); setNotice(`Appointment rescheduled. Copy this message: Your booking ${rescheduling.reference} has moved to ${rescheduleDate} at ${rescheduleTime}.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not reschedule appointment.') }
  }

  if (Boolean(business)) return <ProviderWorkspace
    business={business as Business}
    notice={notice}
    services={services}
    appointments={appointments}
    serviceForm={serviceForm}
    editingService={editingService}
    settings={settings}
    rescheduling={rescheduling}
    rescheduleDate={rescheduleDate}
    rescheduleTime={rescheduleTime}
    rescheduleSlots={rescheduleSlots}
    setServiceForm={setServiceForm}
    setEditingService={setEditingService}
    setSettings={setSettings}
    setRescheduleTime={setRescheduleTime}
    setRescheduling={setRescheduling}
    saveService={saveService}
    load={load}
    loadRescheduleSlots={loadRescheduleSlots}
    reschedule={reschedule}
    setNotice={setNotice}
    initialTab={initialTab}
  />

  if (!business) return <section className="mx-auto max-w-md px-5 py-10"><a href="/tools" className="text-sm font-bold text-emerald-700">← All tools</a><h1 className="mt-4 text-3xl font-black">{mode === 'signup' ? 'Create your account' : 'Sign in to PaperlinkOS'}</h1><p className="mt-2 text-slate-600">Your account gives you access to account-backed Booking and ProofFlow workspaces. Browser-local tools remain available without one.</p>{notice && <Notice text={notice} />}<form onSubmit={authenticate} className="mt-6 rounded-2xl border bg-white p-5"><Field name="Email" type="email" value={authForm.email} set={(email) => setAuthForm({ ...authForm, email })} /><Field name="Password" type="password" value={authForm.password} set={(password) => setAuthForm({ ...authForm, password })} />{mode === 'signup' && <><Field name="Business name" value={authForm.name} set={(name) => setAuthForm({ ...authForm, name })} /><Field name="Booking page slug" value={authForm.slug} set={(slug) => setAuthForm({ ...authForm, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /><p className="mt-3 text-xs leading-5 text-slate-500">This creates your Booking business page too. We will separate optional business setup from account creation in a later account milestone.</p></>}<button className="mt-5 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">{mode === 'signup' ? 'Create account' : 'Sign in'}</button><button type="button" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')} className="ml-3 text-sm font-bold text-emerald-700">{mode === 'signup' ? 'I already have an account' : 'Create an account'}</button></form></section>

  return <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><a href="/tools/booking" className="text-sm font-bold text-emerald-700">← Local Booking Manager</a><h1 className="mt-2 text-3xl font-black">{business.name} Booking</h1><p className="mt-1 text-slate-600">Account-backed provider workspace. Local prototype records remain separate.</p></div><div className="flex gap-3"><a className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold" href={`/book/${business.slug}`} target="_blank" rel="noreferrer">Open booking page</a><button onClick={async () => { await api('/api/auth/logout', { method: 'POST' }); setBusiness(null); window.dispatchEvent(new Event('paperlinkos:authchange')) }} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white">Sign out</button></div></div>{notice && <Notice text={notice} />}<div className="mt-7 grid gap-6 lg:grid-cols-2"><form onSubmit={saveService} className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-black">{editingService ? 'Edit service' : 'Services'}</h2><Field name="Service name" value={serviceForm.name} set={(name) => setServiceForm({ ...serviceForm, name })} /><Field name="Description" value={serviceForm.description} set={(description) => setServiceForm({ ...serviceForm, description })} /><div className="grid grid-cols-3 gap-3"><Field name="NGN" type="number" value={serviceForm.price} set={(price) => setServiceForm({ ...serviceForm, price })} /><Field name="Minutes" type="number" value={serviceForm.duration} set={(duration) => setServiceForm({ ...serviceForm, duration })} /><Field name="Buffer" type="number" value={serviceForm.buffer} set={(buffer) => setServiceForm({ ...serviceForm, buffer })} /></div><button className="mt-5 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">{editingService ? 'Save service' : 'Add service'}</button>{editingService && <button type="button" onClick={() => { setEditingService(null); setServiceForm({ name: '', description: '', price: '', duration: '60', buffer: '0' }) }} className="ml-3 text-sm font-bold">Cancel</button>}<div className="mt-5 space-y-2">{services.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><span><b>{item.name}</b> · ₦{item.price_ngn.toLocaleString()} · {item.duration_minutes} min · {item.active ? 'Active' : 'Inactive'}</span><span className="flex gap-3"><button type="button" onClick={() => { setEditingService(item); setServiceForm({ name: item.name, description: item.description, price: String(item.price_ngn), duration: String(item.duration_minutes), buffer: String(item.buffer_minutes) }) }} className="font-bold text-emerald-700">Edit</button><button type="button" onClick={async () => { await api(`/api/booking/services/${item.id}`, { method: 'PATCH', body: JSON.stringify({ name: item.name, description: item.description, priceNgn: item.price_ngn, durationMinutes: item.duration_minutes, bufferMinutes: item.buffer_minutes, active: !item.active }) }); await load() }} className="font-bold text-amber-700">{item.active ? 'Deactivate' : 'Activate'}</button></span></div>)}</div></form><SettingsForm settings={settings} setSettings={setSettings} onSave={async () => { try { await api('/api/booking/settings', { method: 'PUT', body: JSON.stringify(settings) }); await load(); setNotice('Availability settings saved.') } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save settings.') } }} /></div><section className="mt-6 rounded-2xl border bg-white p-5"><h2 className="text-xl font-black">Booking requests & appointments</h2><div className="mt-4 space-y-2">{appointments.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm"><span><b>{item.customer_name}</b> · {item.service_name} · {new Date(item.starts_at).toLocaleString()} · {item.status}</span><span className="flex gap-2">{item.status === 'Pending' && <button onClick={async () => { await api(`/api/booking/appointments/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Confirmed' }) }); await load() }} className="font-bold text-emerald-700">Confirm</button>}{['Pending', 'Confirmed'].includes(item.status) && <button onClick={() => { setRescheduling(item); void loadRescheduleSlots(item.starts_at.slice(0, 10), item) }} className="font-bold text-emerald-700">Reschedule</button>}<button onClick={async () => { await api(`/api/booking/appointments/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Cancelled' }) }); await load() }} className="font-bold text-rose-600">Cancel</button></span></div>)}</div></section>{rescheduling && <section className="fixed inset-0 z-20 grid place-items-center bg-slate-950/30 p-5"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"><h2 className="text-xl font-black">Reschedule {rescheduling.customer_name}</h2><p className="mt-1 text-sm text-slate-600">Reference {rescheduling.reference}; customer details and reference stay unchanged.</p><Field name="New date" type="date" value={rescheduleDate} set={(date) => void loadRescheduleSlots(date, rescheduling)} /><label className={label}>Available time<select className={input} value={rescheduleTime} onChange={(event) => setRescheduleTime(event.target.value)}><option value="">Choose a time</option>{rescheduleSlots.map((slot) => <option key={slot}>{slot}</option>)}</select></label><div className="mt-5 flex gap-3"><button onClick={reschedule} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">Save new time</button><button onClick={() => setRescheduling(null)} className="text-sm font-bold">Cancel</button></div></div></section>}</section>
}

type BookingSettings = {
  name: string
  slug: string
  whatsapp: string
  hours: Hours[]
  breaks: Break[]
  blockedDates: string[]
}

type NotificationRecord = {
  id: number
  appointment_id: string
  event_type: 'booking_requested' | 'confirmed' | 'rescheduled' | 'cancelled'
  channel: 'email' | 'telegram'
  recipient: string
  status: 'pending' | 'sent' | 'failed' | 'skipped'
  created_at: string
  sent_at: string | null
  last_error: string | null
}

type ProviderWorkspaceProps = {
  business: Business
  notice: string
  services: Service[]
  appointments: Appointment[]
  serviceForm: { name: string; description: string; price: string; duration: string; buffer: string }
  editingService: Service | null
  settings: BookingSettings
  rescheduling: Appointment | null
  rescheduleDate: string
  rescheduleTime: string
  rescheduleSlots: string[]
  setServiceForm: (form: { name: string; description: string; price: string; duration: string; buffer: string }) => void
  setEditingService: (service: Service | null) => void
  setSettings: (settings: BookingSettings) => void
  setRescheduleTime: (time: string) => void
  setRescheduling: (appointment: Appointment | null) => void
  saveService: (event: FormEvent) => Promise<void>
  load: () => Promise<void>
  loadRescheduleSlots: (date: string, appointment: Appointment) => Promise<void>
  reschedule: () => Promise<void>
  setNotice: (notice: string) => void
  initialTab: 'overview' | 'appointments' | 'setup' | 'profile'
}

function ProviderWorkspace({
  business,
  notice,
  services,
  appointments,
  serviceForm,
  editingService,
  settings,
  rescheduling,
  rescheduleDate,
  rescheduleTime,
  rescheduleSlots,
  setServiceForm,
  setEditingService,
  setSettings,
  setRescheduleTime,
  setRescheduling,
  saveService,
  load,
  loadRescheduleSlots,
  reschedule,
  setNotice,
  initialTab,
}: ProviderWorkspaceProps) {
  const [tab, setTab] = useState<'overview' | 'appointments' | 'setup' | 'profile'>(initialTab)
  const [previewOpen, setPreviewOpen] = useState(false)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
  const pending = appointments.filter((item) => item.status === 'Pending')
  const todaysAppointments = appointments.filter((item) => item.starts_at.slice(0, 10) === today)
  const upcoming = appointments.filter((item) => ['Pending', 'Confirmed'].includes(item.status) && item.starts_at >= new Date().toISOString())

  async function setAppointmentStatus(appointment: Appointment, status: 'Confirmed' | 'Cancelled') {
    try {
      await api(`/api/booking/appointments/${appointment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await load()
      setNotice(status === 'Confirmed' ? 'Appointment confirmed.' : 'Appointment cancelled.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update this appointment.')
    }
  }

  async function toggleService(service: Service) {
    try {
      await api(`/api/booking/services/${service.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: service.name,
          description: service.description,
          priceNgn: service.price_ngn,
          durationMinutes: service.duration_minutes,
          bufferMinutes: service.buffer_minutes,
          active: !service.active,
        }),
      })
      await load()
      setNotice(service.active ? 'Service deactivated.' : 'Service activated.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update this service.')
    }
  }

  async function saveSettings() {
    try {
      await api('/api/booking/settings', { method: 'PUT', body: JSON.stringify(settings) })
      await load()
      setNotice('Booking settings saved.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save booking settings.')
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div>
        <div>
          <a href="/tools/booking" className="text-sm font-bold text-emerald-700">← Local Booking Manager</a>
          <h1 className="mt-2 text-3xl font-black">{business.name} Booking</h1>
          <p className="mt-1 text-slate-600">Manage your account-backed services, availability, requests and notification records.</p>
        </div>
      </div>

      {notice && <Notice text={notice} />}

      <nav aria-label="Booking workspace sections" className="mt-7 flex gap-2 overflow-x-auto border-b border-slate-200 pb-3">
        {[
          ['overview', 'Overview'],
          ['appointments', `Appointments${pending.length ? ` (${pending.length})` : ''}`],
          ['setup', 'Services & availability'],
        ].map(([value, name]) => (
          <button
            key={value}
            onClick={() => setTab(value as typeof tab)}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-bold ${tab === value ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {name}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="mt-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Pending requests" value={pending.length} />
            <SummaryCard label="Today" value={todaysAppointments.length} />
            <SummaryCard label="Upcoming" value={upcoming.length} />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
              <h2 className="text-lg font-black">Handle appointment requests</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Review, confirm, reschedule or cancel client requests in one place.</p>
              <button onClick={() => setTab('appointments')} className="mt-4 text-sm font-bold text-emerald-700">Open appointments →</button>
            </section>
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
              <h2 className="text-lg font-black">Set up your booking page</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Create services, working hours, breaks and blocked dates separately from requests.</p>
              <button onClick={() => setTab('setup')} className="mt-4 text-sm font-bold text-emerald-700">Manage setup →</button>
            </section>
          </div>
        </div>
      )}

      {tab === 'appointments' && (
        <section className="mt-6 rounded-2xl border bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div><h2 className="text-xl font-black">Booking requests & appointments</h2><p className="mt-1 text-sm text-slate-600">Requests are listed here so they are not hidden beneath setup forms.</p></div>
            <span className="text-sm font-bold text-slate-500">{appointments.length} total</span>
          </div>
          {appointments.length === 0 ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No booking requests yet. Share your booking page when your services and availability are ready.</p> : <div className="mt-4 space-y-2">{appointments.map((item) => <AppointmentRow key={item.id} appointment={item} onConfirm={() => void setAppointmentStatus(item, 'Confirmed')} onCancel={() => void setAppointmentStatus(item, 'Cancelled')} onReschedule={() => { setRescheduling(item); void loadRescheduleSlots(item.starts_at.slice(0, 10), item) }} />)}</div>}
        </section>
      )}

      {tab === 'setup' && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <ServiceSetup services={services} serviceForm={serviceForm} editingService={editingService} setServiceForm={setServiceForm} setEditingService={setEditingService} onSubmit={saveService} onToggle={toggleService} />
          <AvailabilitySettingsForm settings={settings} setSettings={setSettings} onSave={() => void saveSettings()} onPreview={() => setPreviewOpen(true)} />
        </div>
      )}

      {tab === 'profile' && <BusinessProfileForm settings={settings} setSettings={setSettings} onSave={() => void saveSettings()} onPreview={() => setPreviewOpen(true)} />}

      {rescheduling && <RescheduleDialog appointment={rescheduling} date={rescheduleDate} time={rescheduleTime} slots={rescheduleSlots} onDateChange={(date) => void loadRescheduleSlots(date, rescheduling)} onTimeChange={setRescheduleTime} onSave={() => void reschedule()} onClose={() => setRescheduling(null)} />}
      {previewOpen && <BookingPreview slug={settings.slug} onClose={() => setPreviewOpen(false)} />}
    </section>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <section className="rounded-2xl border bg-white p-5"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></section>
}

function AppointmentRow({ appointment, onConfirm, onCancel, onReschedule }: { appointment: Appointment; onConfirm: () => void; onCancel: () => void; onReschedule: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm"><span><b>{appointment.customer_name}</b> · {appointment.service_name} · {new Date(appointment.starts_at).toLocaleString()} · {appointment.status}</span><span className="flex gap-3">{appointment.status === 'Pending' && <button onClick={onConfirm} className="font-bold text-emerald-700">Confirm</button>}{['Pending', 'Confirmed'].includes(appointment.status) && <button onClick={onReschedule} className="font-bold text-emerald-700">Reschedule</button>}<button onClick={onCancel} className="font-bold text-rose-600">Cancel</button></span></div>
}

function ServiceSetup({ services, serviceForm, editingService, setServiceForm, setEditingService, onSubmit, onToggle }: { services: Service[]; serviceForm: { name: string; description: string; price: string; duration: string; buffer: string }; editingService: Service | null; setServiceForm: ProviderWorkspaceProps['setServiceForm']; setEditingService: ProviderWorkspaceProps['setEditingService']; onSubmit: ProviderWorkspaceProps['saveService']; onToggle: (service: Service) => Promise<void> }) {
  const clear = () => { setEditingService(null); setServiceForm({ name: '', description: '', price: '', duration: '60', buffer: '0' }) }
  return <form onSubmit={onSubmit} className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-black">{editingService ? 'Edit service' : 'Services'}</h2><p className="mt-1 text-sm text-slate-600">These appear on your public booking page only when active.</p><Field name="Service name" value={serviceForm.name} set={(name) => setServiceForm({ ...serviceForm, name })} /><Field name="Description" value={serviceForm.description} set={(description) => setServiceForm({ ...serviceForm, description })} /><div className="grid grid-cols-3 gap-3"><Field name="NGN" type="number" value={serviceForm.price} set={(price) => setServiceForm({ ...serviceForm, price })} /><Field name="Minutes" type="number" value={serviceForm.duration} set={(duration) => setServiceForm({ ...serviceForm, duration })} /><Field name="Buffer" type="number" value={serviceForm.buffer} set={(buffer) => setServiceForm({ ...serviceForm, buffer })} /></div><button className="mt-5 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">{editingService ? 'Save service' : 'Add service'}</button>{editingService && <button type="button" onClick={clear} className="ml-3 text-sm font-bold">Cancel</button>}<div className="mt-5 space-y-2">{services.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><span><b>{item.name}</b> · ₦{item.price_ngn.toLocaleString()} · {item.duration_minutes} min · {item.active ? 'Active' : 'Inactive'}</span><span className="flex gap-3"><button type="button" onClick={() => { setEditingService(item); setServiceForm({ name: item.name, description: item.description, price: String(item.price_ngn), duration: String(item.duration_minutes), buffer: String(item.buffer_minutes) }) }} className="font-bold text-emerald-700">Edit</button><button type="button" onClick={() => void onToggle(item)} className="font-bold text-amber-700">{item.active ? 'Deactivate' : 'Activate'}</button></span></div>)}</div></form>
}

function RescheduleDialog({ appointment, date, time, slots, onDateChange, onTimeChange, onSave, onClose }: { appointment: Appointment; date: string; time: string; slots: string[]; onDateChange: (date: string) => void; onTimeChange: (time: string) => void; onSave: () => void; onClose: () => void }) {
  return <section className="fixed inset-0 z-20 grid place-items-center bg-slate-950/30 p-5"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"><h2 className="text-xl font-black">Reschedule {appointment.customer_name}</h2><p className="mt-1 text-sm text-slate-600">Reference {appointment.reference}; customer details and reference stay unchanged.</p><Field name="New date" type="date" value={date} set={onDateChange} /><label className={label}>Available time<select className={input} value={time} onChange={(event) => onTimeChange(event.target.value)}><option value="">Choose a time</option>{slots.map((slot) => <option key={slot}>{slot}</option>)}</select></label><div className="mt-5 flex gap-3"><button onClick={onSave} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">Save new time</button><button onClick={onClose} className="text-sm font-bold">Cancel</button></div></div></section>
}

function ProfileMenu({ business, onOpenProfile, onSignOut }: { business: Business; onOpenProfile: () => void; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const initial = business.name.trim().charAt(0).toUpperCase() || 'P'

  return <div className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-label="Open profile menu" aria-expanded={open} className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-sm font-black text-emerald-900 ring-1 ring-emerald-200">{initial}</button>
    {open && <section className="absolute right-0 z-30 mt-2 w-52 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"><p className="truncate px-3 py-2 text-sm font-bold text-slate-800">{business.name}</p><button type="button" onClick={() => { setOpen(false); onOpenProfile() }} className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-slate-50">Profile & booking page</button><button type="button" onClick={onSignOut} className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-rose-700 hover:bg-rose-50">Sign out</button></section>}
  </div>
}

function BookingPreview({ slug, onClose }: { slug: string; onClose: () => void }) {
  return <section className="fixed inset-0 z-30 bg-slate-950/40 p-3 sm:p-6"><div role="dialog" aria-modal="true" aria-label="Public booking page preview" className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-4 py-3 sm:px-5"><div><h2 className="font-black">Public booking page preview</h2><p className="mt-0.5 text-xs text-slate-500">This is what clients see after you save your setup.</p></div><button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-bold hover:bg-slate-100">Close</button></div><iframe title="Booking page preview" src={`/book/${encodeURIComponent(slug)}`} className="min-h-0 flex-1 bg-white" /></div></section>
}

function BusinessProfileForm({ settings, setSettings, onSave, onPreview }: { settings: BookingSettings; setSettings: (settings: BookingSettings) => void; onSave: () => void; onPreview: () => void }) {
  return <form onSubmit={(event) => { event.preventDefault(); onSave() }} className="mt-6 max-w-2xl rounded-2xl border bg-white p-5"><h2 className="text-xl font-black">Business profile</h2><p className="mt-1 text-sm leading-6 text-slate-600">These details identify your public booking page. Save changes before using the preview.</p><Field name="Business name" value={settings.name} set={(name) => setSettings({ ...settings, name })} /><Field name="Booking URL slug" value={settings.slug} set={(slug) => setSettings({ ...settings, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /><Field name="WhatsApp number (optional)" value={settings.whatsapp} set={(whatsapp) => setSettings({ ...settings, whatsapp })} /><div className="mt-5 flex flex-wrap gap-3"><button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">Save profile</button><button type="button" onClick={onPreview} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Preview booking page</button></div></form>
}

function DaySelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="relative"><select aria-label="Day" className={`${input} appearance-none pr-10`} value={value} onChange={(event) => onChange(Number(event.target.value))}>{days.map((day, weekday) => <option value={weekday} key={day}>{day}</option>)}</select><svg aria-hidden="true" viewBox="0 0 16 16" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-slate-800" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 6 5 5 5-5" /></svg></div>
}

function AvailabilitySettingsForm({ settings, setSettings, onSave, onPreview }: { settings: BookingSettings; setSettings: (settings: BookingSettings) => void; onSave: () => void; onPreview: () => void }) {
  return <form onSubmit={(event) => { event.preventDefault(); onSave() }} className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-black">Availability</h2><p className="mt-1 text-sm text-slate-600">Working hours, regular breaks and blocked dates use Africa/Lagos time.</p><p className="mt-5 text-sm font-bold">Working hours</p>{settings.hours.map((hour, index) => <div className="mt-2 grid grid-cols-[8.75rem_1fr_1fr_auto] gap-2" key={`${hour.weekday}-${index}`}><DaySelect value={hour.weekday} onChange={(weekday) => { const hours = [...settings.hours]; hours[index] = { ...hour, weekday }; setSettings({ ...settings, hours }) }} /><input aria-label={`${days[hour.weekday]} opening time`} className={input} type="time" value={hour.opensAt} onChange={(event) => { const hours = [...settings.hours]; hours[index] = { ...hour, opensAt: event.target.value }; setSettings({ ...settings, hours }) }} /><input aria-label={`${days[hour.weekday]} closing time`} className={input} type="time" value={hour.closesAt} onChange={(event) => { const hours = [...settings.hours]; hours[index] = { ...hour, closesAt: event.target.value }; setSettings({ ...settings, hours }) }} /><button type="button" aria-label={`Remove ${days[hour.weekday]} working hours`} onClick={() => setSettings({ ...settings, hours: settings.hours.filter((_, itemIndex) => itemIndex !== index) })} className="px-2 text-rose-600">×</button></div>)}<button type="button" onClick={() => setSettings({ ...settings, hours: [...settings.hours, { weekday: 2, opensAt: '09:00', closesAt: '17:00' }] })} className="mt-3 text-sm font-bold text-emerald-700">+ Add working day</button><p className="mt-5 text-sm font-bold">Regular breaks</p>{settings.breaks.map((item, index) => <div className="mt-2 grid grid-cols-[8.75rem_1fr_1fr_auto] gap-2" key={`${item.weekday}-${index}`}><DaySelect value={item.weekday} onChange={(weekday) => { const breaks = [...settings.breaks]; breaks[index] = { ...item, weekday }; setSettings({ ...settings, breaks }) }} /><input aria-label={`${days[item.weekday]} break start`} className={input} type="time" value={item.startsAt} onChange={(event) => { const breaks = [...settings.breaks]; breaks[index] = { ...item, startsAt: event.target.value }; setSettings({ ...settings, breaks }) }} /><input aria-label={`${days[item.weekday]} break end`} className={input} type="time" value={item.endsAt} onChange={(event) => { const breaks = [...settings.breaks]; breaks[index] = { ...item, endsAt: event.target.value }; setSettings({ ...settings, breaks }) }} /><button type="button" aria-label={`Remove ${days[item.weekday]} break`} onClick={() => setSettings({ ...settings, breaks: settings.breaks.filter((_, itemIndex) => itemIndex !== index) })} className="px-2 text-rose-600">×</button></div>)}<button type="button" onClick={() => setSettings({ ...settings, breaks: [...settings.breaks, { weekday: settings.hours[0]?.weekday ?? 1, startsAt: '12:00', endsAt: '13:00' }] })} className="mt-3 text-sm font-bold text-emerald-700">+ Add regular break</button><Field name="Blocked dates (YYYY-MM-DD, comma separated)" value={settings.blockedDates.join(', ')} set={(value) => setSettings({ ...settings, blockedDates: value.split(',').map((item) => item.trim()).filter(Boolean) })} /><div className="mt-5 flex flex-wrap gap-3"><button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">Save availability</button><button type="button" onClick={onPreview} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Preview booking page</button></div></form>
}

function NotificationBell({ onOpenAppointments }: { onOpenAppointments: () => void }) {
  const [records, setRecords] = useState<NotificationRecord[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void api('/api/booking/notifications')
      .then((result) => { setRecords(result); setState('ready') })
      .catch(() => setState('error'))
  }, [])

  const eventNames: Record<NotificationRecord['event_type'], string> = {
    booking_requested: 'New booking request',
    confirmed: 'Booking confirmed',
    rescheduled: 'Booking rescheduled',
    cancelled: 'Booking cancelled',
  }

  const pendingCount = records.filter((record) => record.status === 'pending').length

  return <div className="relative">
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      aria-label="Open booking notifications"
      aria-expanded={open}
      className="relative grid h-10 w-10 place-items-center rounded-lg border border-slate-300 bg-white text-lg hover:bg-slate-50"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 22h4" /></svg>
      {pendingCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-emerald-600 px-1 text-[11px] font-bold text-white">{pendingCount > 9 ? '9+' : pendingCount}</span>}
    </button>
    {open && <section className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"><div className="flex items-center justify-between gap-3"><h2 className="font-black">Notifications</h2><button onClick={() => setOpen(false)} className="text-sm font-bold text-slate-600">Close</button></div><p className="mt-1 text-xs leading-5 text-slate-500">Booking events are recorded here. Delivery is not connected yet, so pending items have not been sent.</p>{state === 'loading' && <p className="mt-4 text-sm text-slate-600">Loading…</p>}{state === 'error' && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Could not load notifications.</p>}{state === 'ready' && (records.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No notification events yet.</p> : <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{records.slice(0, 12).map((record) => <button key={record.id} type="button" onClick={() => { setOpen(false); onOpenAppointments() }} className="w-full rounded-lg bg-slate-50 p-3 text-left text-sm hover:bg-emerald-50"><div className="flex items-center justify-between gap-2"><b>{eventNames[record.event_type]}</b><span className="text-xs font-bold text-slate-500">{record.status === 'pending' ? 'Pending' : record.status}</span></div><p className="mt-1 truncate text-slate-600">{record.recipient}</p><p className="mt-1 text-xs text-slate-500">{new Date(record.created_at).toLocaleString()}</p></button>)}</div>)}</section>}
  </div>
}

function SettingsForm({ settings, setSettings, onSave }: { settings: BookingSettings; setSettings: (settings: any) => void; onSave: () => void }) {
  return <form onSubmit={(event) => { event.preventDefault(); onSave() }} className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-black">Booking page & availability</h2><Field name="Business name" value={settings.name} set={(name) => setSettings({ ...settings, name })} /><Field name="Booking URL slug" value={settings.slug} set={(slug) => setSettings({ ...settings, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /><Field name="WhatsApp number (optional)" value={settings.whatsapp} set={(whatsapp) => setSettings({ ...settings, whatsapp })} /><p className="mt-5 text-sm font-bold">Working hours (Africa/Lagos)</p>{settings.hours.map((hour, index) => <div className="mt-2 grid grid-cols-[70px_1fr_1fr_auto] gap-2" key={`${hour.weekday}-${index}`}><select className={input} value={hour.weekday} onChange={(event) => { const hours = [...settings.hours]; hours[index] = { ...hour, weekday: Number(event.target.value) }; setSettings({ ...settings, hours }) }}>{days.map((day, weekday) => <option value={weekday} key={day}>{day}</option>)}</select><input className={input} type="time" value={hour.opensAt} onChange={(event) => { const hours = [...settings.hours]; hours[index] = { ...hour, opensAt: event.target.value }; setSettings({ ...settings, hours }) }} /><input className={input} type="time" value={hour.closesAt} onChange={(event) => { const hours = [...settings.hours]; hours[index] = { ...hour, closesAt: event.target.value }; setSettings({ ...settings, hours }) }} /><button type="button" onClick={() => setSettings({ ...settings, hours: settings.hours.filter((_, itemIndex) => itemIndex !== index) })} className="text-rose-600">×</button></div>)}<button type="button" onClick={() => setSettings({ ...settings, hours: [...settings.hours, { weekday: 2, opensAt: '09:00', closesAt: '17:00' }] })} className="mt-3 text-sm font-bold text-emerald-700">+ Working day</button><p className="mt-5 text-sm font-bold">Regular breaks</p>{settings.breaks.map((item, index) => <div className="mt-2 grid grid-cols-[70px_1fr_1fr_auto] gap-2" key={`${item.weekday}-${index}`}><select className={input} value={item.weekday} onChange={(event) => { const breaks = [...settings.breaks]; breaks[index] = { ...item, weekday: Number(event.target.value) }; setSettings({ ...settings, breaks }) }}>{days.map((day, weekday) => <option value={weekday} key={day}>{day}</option>)}</select><input className={input} type="time" value={item.startsAt} onChange={(event) => { const breaks = [...settings.breaks]; breaks[index] = { ...item, startsAt: event.target.value }; setSettings({ ...settings, breaks }) }} /><input className={input} type="time" value={item.endsAt} onChange={(event) => { const breaks = [...settings.breaks]; breaks[index] = { ...item, endsAt: event.target.value }; setSettings({ ...settings, breaks }) }} /><button type="button" onClick={() => setSettings({ ...settings, breaks: settings.breaks.filter((_, itemIndex) => itemIndex !== index) })} className="text-rose-600">×</button></div>)}<button type="button" onClick={() => setSettings({ ...settings, breaks: [...settings.breaks, { weekday: settings.hours[0]?.weekday ?? 1, startsAt: '12:00', endsAt: '13:00' }] })} className="mt-3 text-sm font-bold text-emerald-700">+ Regular break</button><Field name="Blocked dates (YYYY-MM-DD, comma separated)" value={settings.blockedDates.join(', ')} set={(value) => setSettings({ ...settings, blockedDates: value.split(',').map((item) => item.trim()).filter(Boolean) })} /><button className="mt-5 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">Save settings</button></form>
}

function Notice({ text }: { text: string }) { return <div className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">{text}</div> }

type AvailabilityResult = {
  slots: string[]
  reason?: 'closed' | 'blocked' | 'unavailable'
}

function availabilityMessage(reason?: AvailabilityResult['reason']) {
  if (reason === 'closed') return 'This business is not open on the selected day. Choose a day included in its working hours.'
  if (reason === 'blocked') return 'The provider has marked this date unavailable. Please choose another date.'
  if (reason === 'unavailable') return 'There are no appointment times left for this service on the selected date.'
  return ''
}

export function PublicBooking({ slug }: { slug: string }) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [form, setForm] = useState({ serviceId: '', date: '', time: '', name: '', phone: '', email: '' })
  const [slots, setSlots] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [availabilityNotice, setAvailabilityNotice] = useState('')
  const [loadingSlots, setLoadingSlots] = useState(false)

  useEffect(() => {
    void Promise.all([api(`/api/public/book/${slug}`), api(`/api/public/book/${slug}/services`)])
      .then(([loadedBusiness, loadedServices]) => {
        setBusiness(loadedBusiness)
        setServices(loadedServices)
        setForm((value) => ({ ...value, serviceId: loadedServices[0]?.id ?? '' }))
      })
      .catch((error) => setNotice(error.message))
  }, [slug])

  useEffect(() => {
    if (!form.serviceId || !form.date) {
      setSlots([])
      setAvailabilityNotice('')
      return
    }

    let cancelled = false
    setLoadingSlots(true)
    setAvailabilityNotice('')
    void api(`/api/public/book/${slug}/availability?serviceId=${encodeURIComponent(form.serviceId)}&date=${form.date}`)
      .then((result: AvailabilityResult) => {
        if (cancelled) return
        setSlots(result.slots)
        setAvailabilityNotice(availabilityMessage(result.reason))
      })
      .catch((error) => {
        if (!cancelled) setAvailabilityNotice(error instanceof Error ? error.message : 'Could not load available times.')
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false)
      })

    return () => { cancelled = true }
  }, [slug, form.serviceId, form.date])

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      const start = new Date(`${form.date}T${form.time}:00+01:00`).toISOString()
      const result = await api(`/api/public/book/${slug}/requests`, { method: 'POST', body: JSON.stringify({ ...form, start }) })
      setNotice(`Request received with reference ${result.reference}. The provider must confirm it.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not submit request.')
    }
  }

  return <section className="mx-auto max-w-xl px-5 py-10">
    <a href="/tools/booking" className="text-sm font-bold text-emerald-700">← Paperlink Booking</a>
    <h1 className="mt-4 text-3xl font-black">{business?.name ?? 'Booking page'}</h1>
    <p className="mt-1 text-slate-600">Choose a service and send a booking request. This local development page is only available on this Mac.</p>
    {notice && <Notice text={notice} />}
    <form onSubmit={submit} className="mt-6 rounded-2xl border bg-white p-5">
      <label className={label}>Service
        <select className={input} value={form.serviceId} onChange={(event) => setForm({ ...form, serviceId: event.target.value, time: '' })}>
          {services.map((service) => <option value={service.id} key={service.id}>{service.name} — ₦{service.price_ngn.toLocaleString()} ({service.duration_minutes} min)</option>)}
        </select>
      </label>
      <Field name="Date" type="date" value={form.date} set={(date) => setForm({ ...form, date, time: '' })} />
      <label className={label}>Available time
        <select className={input} value={form.time} disabled={loadingSlots || slots.length === 0} onChange={(event) => setForm({ ...form, time: event.target.value })}>
          <option value="">{loadingSlots ? 'Loading available times…' : slots.length ? 'Choose a time' : 'No times available'}</option>
          {slots.map((slot) => <option key={slot}>{slot}</option>)}
        </select>
      </label>
      {availabilityNotice && <p className="mt-2 text-sm font-medium text-amber-800" role="status">{availabilityNotice}</p>}
      <Field name="Your name" value={form.name} set={(name) => setForm({ ...form, name })} />
      <Field name="Phone" value={form.phone} set={(phone) => setForm({ ...form, phone })} />
      <Field name="Email (optional)" type="email" value={form.email} set={(email) => setForm({ ...form, email })} />
      <button disabled={!form.time || loadingSlots} className="mt-5 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Send booking request</button>
    </form>
  </section>
}
