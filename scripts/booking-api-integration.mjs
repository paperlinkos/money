import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const port = 3101
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for this integration test.')
const server = spawn('node', ['apps/api/dist/server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), WEB_ORIGIN: 'http://localhost:5173' }, stdio: 'ignore' })
const base = `http://127.0.0.1:${port}`
let cookie = ''
async function request(path, options = {}, jar = true) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...(jar && cookie ? { Cookie: cookie } : {}), ...(options.headers ?? {}) } })
  const set = response.headers.get('set-cookie'); if (set && jar) cookie = set.split(';')[0]
  const body = response.status === 204 ? null : await response.json()
  return { response, body }
}
try {
  await new Promise(resolve => setTimeout(resolve, 500))
  assert.equal((await request('/api/health')).response.status, 200)
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  let result = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `provider-${id}@test.local`, password: 'safe-password-123', businessName: 'Test Studio', slug: `studio-${id}` }) })
  assert.equal(result.response.status, 201); assert.match(cookie, /^northstar_session=/); assert.equal('token' in result.body, false)
  assert.equal((await request('/api/auth/me')).response.status, 200)
  const date = new Date(Date.now() + 86400000); const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date); const value = (part) => parts.find(x => x.type === part)?.value; const dateText = `${value('year')}-${value('month')}-${value('day')}`; const weekday = new Date(`${dateText}T12:00:00+01:00`).getUTCDay()
  result = await request('/api/booking/settings', { method: 'PUT', body: JSON.stringify({ name: 'Test Studio', slug: `studio-${id}`, hours: [{ weekday, opensAt: '09:00', closesAt: '17:00' }], breaks: [{ weekday, startsAt: '12:00', endsAt: '13:00' }], blockedDates: [] }) }); assert.equal(result.response.status, 204)
  result = await request('/api/booking/services', { method: 'POST', body: JSON.stringify({ name: 'Consultation', priceNgn: 5000, durationMinutes: 60, bufferMinutes: 0 }) }); assert.equal(result.response.status, 201); const serviceId = result.body.id
  result = await request(`/api/booking/services/${serviceId}`, { method: 'PATCH', body: JSON.stringify({ name: 'Extended consultation', description: 'Updated', priceNgn: 6500, durationMinutes: 75, bufferMinutes: 15, active: true }) }); assert.equal(result.response.status, 200); assert.equal(result.body.price_ngn, 6500); assert.equal(result.body.duration_minutes, 75)
  result = await request(`/api/booking/services/${serviceId}`, { method: 'PATCH', body: JSON.stringify({ name: 'Extended consultation', description: 'Updated', priceNgn: 6500, durationMinutes: 75, bufferMinutes: 15, active: false }) }); assert.equal(result.response.status, 200); assert.equal((await request(`/api/public/book/studio-${id}/services`, {}, false)).body.length, 0)
  await request(`/api/booking/services/${serviceId}`, { method: 'PATCH', body: JSON.stringify({ name: 'Extended consultation', description: 'Updated', priceNgn: 6500, durationMinutes: 75, bufferMinutes: 15, active: true }) })
  result = await request(`/api/public/book/studio-${id}/availability?serviceId=${serviceId}&date=${dateText}`, {}, false); assert.equal(result.response.status, 200); assert.ok(!result.body.slots.includes('12:00')); const time = result.body.slots[0]; assert.ok(time)
  const start = new Date(`${dateText}T${time}:00+01:00`).toISOString(); const payload = JSON.stringify({ serviceId, name: 'Client One', phone: '08000000000', start })
  const one = await request(`/api/public/book/studio-${id}/requests`, { method: 'POST', body: payload }, false); const two = await request(`/api/public/book/studio-${id}/requests`, { method: 'POST', body: payload.replace('Client One', 'Client Two') }, false); assert.equal(one.response.status, 201); assert.equal(two.response.status, 201)
  result = await request('/api/booking/appointments'); assert.equal(result.response.status, 200); assert.equal(result.body.length, 2)
  const confirmations = await Promise.all(result.body.map(item => request(`/api/booking/appointments/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Confirmed' }) })))
  assert.deepEqual(confirmations.map(x => x.response.status).sort(), [200, 409])
  const confirmed = (await request('/api/booking/appointments')).body.find(item => item.status === 'Confirmed'); const originalReference = confirmed.reference
  const availableAfterConfirmation = (await request(`/api/public/book/studio-${id}/availability?serviceId=${serviceId}&date=${dateText}`, {}, false)).body.slots; const rescheduleTime = availableAfterConfirmation[0]; assert.ok(rescheduleTime)
  const rescheduled = await request(`/api/booking/appointments/${confirmed.id}`, { method: 'PATCH', body: JSON.stringify({ startsAt: new Date(`${dateText}T${rescheduleTime}:00+01:00`).toISOString() }) }); assert.equal(rescheduled.response.status, 200); assert.equal(rescheduled.body.reference, originalReference)
  const invalidReschedule = await request(`/api/booking/appointments/${confirmed.id}`, { method: 'PATCH', body: JSON.stringify({ startsAt: new Date(`${dateText}T12:00:00+01:00`).toISOString() }) }); assert.equal(invalidReschedule.response.status, 409)
  const changedHours = await request('/api/booking/settings', { method: 'PUT', body: JSON.stringify({ name: 'Test Studio', slug: `studio-${id}`, hours: [{ weekday, opensAt: '16:00', closesAt: '17:00' }], breaks: [], blockedDates: [] }) }); assert.equal(changedHours.response.status, 409, 'confirmed bookings protect unsafe hours changes')
  const csrf = await request('/api/booking/services', { method: 'POST', body: JSON.stringify({ name: 'Blocked', priceNgn: 1, durationMinutes: 1 }), headers: { Origin: 'http://evil.example' } }); assert.equal(csrf.response.status, 403)
  const providerCookie = cookie; cookie = ''; result = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `other-${id}@test.local`, password: 'safe-password-123', businessName: 'Other Studio', slug: `other-${id}` }) }); assert.equal(result.response.status, 201); result = await request('/api/booking/services'); assert.equal(result.body.length, 0)
  cookie = providerCookie; result = await request('/api/auth/logout', { method: 'POST' }); assert.equal(result.response.status, 204); assert.equal((await request('/api/auth/me')).response.status, 401)
  console.log('Booking API integration passed')
} finally { server.kill() }
