import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const port = 3101
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for this integration test.')
const server = spawn('node', ['apps/api/dist/server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), WEB_ORIGIN: 'http://localhost:5173', ADMIN_EMAILS: 'admin-inbox@test.local', RESEND_API_KEY: '', MAIL_FROM: '' }, stdio: 'ignore' })
const base = `http://127.0.0.1:${port}`
let cookie = ''
let forwardedFor = ''
async function request(path, options = {}, jar = true) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}), ...(jar && cookie ? { Cookie: cookie } : {}), ...(options.headers ?? {}) } })
  const set = response.headers.get('set-cookie'); if (set && jar) cookie = set.split(';')[0]
  const body = response.status === 204 ? null : await response.json()
  return { response, body }
}
try {
  for (let tries = 0; tries < 100; tries++) { if (await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)) break; await new Promise((resolve) => setTimeout(resolve, 100)) }
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
  const start = new Date(`${dateText}T${time}:00+01:00`).toISOString(); const payload = JSON.stringify({ serviceId, name: 'Client One', phone: '08000000000', email: 'client-one@example.test', start })
  const one = await request(`/api/public/book/studio-${id}/requests`, { method: 'POST', body: payload }, false); const two = await request(`/api/public/book/studio-${id}/requests`, { method: 'POST', body: payload.replace('Client One', 'Client Two') }, false); assert.equal(one.response.status, 201); assert.equal(two.response.status, 201)
  result = await request('/api/booking/appointments'); assert.equal(result.response.status, 200); assert.equal(result.body.length, 2)
  const requestNotifications = await request('/api/booking/notifications'); assert.equal(requestNotifications.response.status, 200); assert.equal(requestNotifications.body.filter(item => item.event_type === 'booking_requested').length, 2)
  const confirmations = await Promise.all(result.body.map(item => request(`/api/booking/appointments/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Confirmed' }) })))
  assert.deepEqual(confirmations.map(x => x.response.status).sort(), [200, 409])
  const confirmed = (await request('/api/booking/appointments')).body.find(item => item.status === 'Confirmed'); const originalReference = confirmed.reference
  const confirmationNotifications = await request('/api/booking/notifications'); assert.ok(confirmationNotifications.body.some(item => item.appointment_id === confirmed.id && item.event_type === 'booking_confirmed'))
  const availableAfterConfirmation = (await request(`/api/public/book/studio-${id}/availability?serviceId=${serviceId}&date=${dateText}`, {}, false)).body.slots; const rescheduleTime = availableAfterConfirmation[0]; assert.ok(rescheduleTime)
  const confirmedTime = new Date(confirmed.starts_at).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false })
  assert.ok(!availableAfterConfirmation.includes(confirmedTime), 'public availability excludes confirmed appointments')
  const originalPending = (await request('/api/booking/appointments')).body.find(item => item.status === 'Pending')
  const pendingTarget = availableAfterConfirmation.at(-1)
  const pendingReschedule = await request(`/api/booking/appointments/${originalPending.id}`, { method: 'PATCH', body: JSON.stringify({ startsAt: new Date(`${dateText}T${pendingTarget}:00+01:00`).toISOString() }) })
  assert.equal(pendingReschedule.response.status, 200)
  assert.equal(pendingReschedule.body.status, 'Pending')
  assert.ok((await request(`/api/public/book/studio-${id}/availability?serviceId=${serviceId}&date=${dateText}`, {}, false)).body.slots.includes(pendingTarget), 'pending appointments do not reserve availability')
  const rescheduled = await request(`/api/booking/appointments/${confirmed.id}`, { method: 'PATCH', body: JSON.stringify({ startsAt: new Date(`${dateText}T${rescheduleTime}:00+01:00`).toISOString() }) }); assert.equal(rescheduled.response.status, 200); assert.equal(rescheduled.body.reference, originalReference)
  const invalidReschedule = await request(`/api/booking/appointments/${confirmed.id}`, { method: 'PATCH', body: JSON.stringify({ startsAt: new Date(`${dateText}T12:00:00+01:00`).toISOString() }) }); assert.equal(invalidReschedule.response.status, 409)
  const availableForRace = (await request(`/api/public/book/studio-${id}/availability?serviceId=${serviceId}&date=${dateText}`, {}, false)).body.slots
  assert.ok(availableForRace.length >= 3, 'enough independent slots for concurrent-rescheduling coverage')
  const raceStartOne = new Date(`${dateText}T${availableForRace[0]}:00+01:00`).toISOString()
  const raceStartTwo = new Date(`${dateText}T${availableForRace.at(-1)}:00+01:00`).toISOString()
  await request(`/api/public/book/studio-${id}/requests`, { method: 'POST', body: JSON.stringify({ serviceId, name: 'Race One', phone: '08000000001', start: raceStartOne }) }, false)
  await request(`/api/public/book/studio-${id}/requests`, { method: 'POST', body: JSON.stringify({ serviceId, name: 'Race Two', phone: '08000000002', start: raceStartTwo }) }, false)
  const raceAppointments = (await request('/api/booking/appointments')).body.filter(item => ['Race One', 'Race Two'].includes(item.customer_name))
  assert.equal(raceAppointments.length, 2)
  for (const appointment of raceAppointments) assert.equal((await request(`/api/booking/appointments/${appointment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Confirmed' }) })).response.status, 200)
  const targetSlots = (await request(`/api/public/book/studio-${id}/availability?serviceId=${serviceId}&date=${dateText}`, {}, false)).body.slots
  const sharedTarget = targetSlots.at(-1)
  assert.ok(sharedTarget, 'a free target slot exists for the reschedule race')
  const confirmedRaceAppointments = (await request('/api/booking/appointments')).body.filter(item => raceAppointments.some(candidate => candidate.id === item.id))
  const beforeRace = new Map(confirmedRaceAppointments.map(item => [item.id, { starts_at: item.starts_at, status: item.status, reference: item.reference }]))
  const concurrentReschedules = await Promise.all(raceAppointments.map(item => request(`/api/booking/appointments/${item.id}`, { method: 'PATCH', body: JSON.stringify({ startsAt: new Date(`${dateText}T${sharedTarget}:00+01:00`).toISOString() }) })))
  assert.deepEqual(concurrentReschedules.map(item => item.response.status).sort(), [200, 409], 'only one confirmed appointment can take a shared target')
  const afterRace = (await request('/api/booking/appointments')).body
  const losingRace = raceAppointments[concurrentReschedules.findIndex(item => item.response.status === 409)]
  const persistedLoser = afterRace.find(item => item.id === losingRace.id)
  assert.deepEqual({ starts_at: persistedLoser.starts_at, status: persistedLoser.status, reference: persistedLoser.reference }, beforeRace.get(losingRace.id), 'a rejected reschedule preserves its original record')
  const confirmationTarget = (await request(`/api/public/book/studio-${id}/availability?serviceId=${serviceId}&date=${dateText}`, {}, false)).body.slots.at(-1)
  assert.ok(confirmationTarget, 'a target exists for confirmation-versus-reschedule coverage')
  await request(`/api/public/book/studio-${id}/requests`, { method: 'POST', body: JSON.stringify({ serviceId, name: 'Confirmation Race', phone: '08000000003', start: new Date(`${dateText}T${confirmationTarget}:00+01:00`).toISOString() }) }, false)
  const confirmationRace = (await request('/api/booking/appointments')).body.find(item => item.customer_name === 'Confirmation Race')
  const existingConfirmed = afterRace.find(item => item.status === 'Confirmed' && item.id !== raceAppointments[0].id && item.id !== raceAppointments[1].id)
  const confirmationAndReschedule = await Promise.all([
    request(`/api/booking/appointments/${confirmationRace.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Confirmed' }) }),
    request(`/api/booking/appointments/${existingConfirmed.id}`, { method: 'PATCH', body: JSON.stringify({ startsAt: new Date(`${dateText}T${confirmationTarget}:00+01:00`).toISOString() }) }),
  ])
  assert.deepEqual(confirmationAndReschedule.map(item => item.response.status).sort(), [200, 409], 'confirmation and rescheduling cannot create an overlap')
  const nextDay = new Date(`${dateText}T12:00:00+01:00`); nextDay.setDate(nextDay.getDate() + 1)
  const nextParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(nextDay)
  const nextValue = (part) => nextParts.find(x => x.type === part)?.value
  const nextDateText = `${nextValue('year')}-${nextValue('month')}-${nextValue('day')}`
  const nextWeekday = new Date(`${nextDateText}T12:00:00+01:00`).getUTCDay()
  const expandedHours = [{ weekday, opensAt: '09:00', closesAt: '17:00' }, { weekday: nextWeekday, opensAt: '09:00', closesAt: '17:00' }]
  assert.equal((await request('/api/booking/settings', { method: 'PUT', body: JSON.stringify({ name: 'Test Studio', slug: `studio-${id}`, hours: expandedHours, breaks: [{ weekday, startsAt: '12:00', endsAt: '13:00' }], blockedDates: [] }) })).response.status, 204)
  const settingsRaceTarget = (await request(`/api/public/book/studio-${id}/availability?serviceId=${serviceId}&date=${nextDateText}`, {}, false)).body.slots.at(-1)
  assert.ok(settingsRaceTarget, 'a target exists for settings-versus-reschedule coverage')
  const rescheduleCandidate = (await request('/api/booking/appointments')).body.find(item => item.status === 'Confirmed')
  const settingsAndReschedule = await Promise.all([
    request('/api/booking/settings', { method: 'PUT', body: JSON.stringify({ name: 'Test Studio', slug: `studio-${id}`, hours: expandedHours, breaks: [{ weekday, startsAt: '12:00', endsAt: '13:00' }], blockedDates: [nextDateText] }) }),
    request(`/api/booking/appointments/${rescheduleCandidate.id}`, { method: 'PATCH', body: JSON.stringify({ startsAt: new Date(`${nextDateText}T${settingsRaceTarget}:00+01:00`).toISOString() }) }),
  ])
  assert.deepEqual(settingsAndReschedule.map(item => item.response.status).sort(), [204, 409], 'a schedule update and reschedule cannot commit incompatible state')
  const thirdDay = new Date(`${nextDateText}T12:00:00+01:00`); thirdDay.setDate(thirdDay.getDate() + 1)
  const thirdParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(thirdDay)
  const thirdValue = (part) => thirdParts.find(x => x.type === part)?.value
  const thirdDateText = `${thirdValue('year')}-${thirdValue('month')}-${thirdValue('day')}`
  const thirdWeekday = new Date(`${thirdDateText}T12:00:00+01:00`).getUTCDay()
  const confirmationHours = [...expandedHours, { weekday: thirdWeekday, opensAt: '09:00', closesAt: '17:00' }]
  assert.equal((await request('/api/booking/settings', { method: 'PUT', body: JSON.stringify({ name: 'Test Studio', slug: `studio-${id}`, hours: confirmationHours, breaks: [{ weekday, startsAt: '12:00', endsAt: '13:00' }], blockedDates: [] }) })).response.status, 204)
  const invalidConfirmationTarget = (await request(`/api/public/book/studio-${id}/availability?serviceId=${serviceId}&date=${thirdDateText}`, {}, false)).body.slots[0]
  await request(`/api/public/book/studio-${id}/requests`, { method: 'POST', body: JSON.stringify({ serviceId, name: 'Unavailable Confirmation', phone: '08000000004', start: new Date(`${thirdDateText}T${invalidConfirmationTarget}:00+01:00`).toISOString() }) }, false)
  const invalidConfirmation = (await request('/api/booking/appointments')).body.find(item => item.customer_name === 'Unavailable Confirmation')
  assert.equal((await request('/api/booking/settings', { method: 'PUT', body: JSON.stringify({ name: 'Test Studio', slug: `studio-${id}`, hours: confirmationHours, breaks: [{ weekday, startsAt: '12:00', endsAt: '13:00' }], blockedDates: [thirdDateText] }) })).response.status, 204)
  assert.equal((await request(`/api/booking/appointments/${invalidConfirmation.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Confirmed' }) })).response.status, 409, 'confirmation rechecks changed availability for pending requests')
  const changedHours = await request('/api/booking/settings', { method: 'PUT', body: JSON.stringify({ name: 'Test Studio', slug: `studio-${id}`, hours: [{ weekday, opensAt: '16:00', closesAt: '17:00' }], breaks: [], blockedDates: [] }) }); assert.equal(changedHours.response.status, 409, 'confirmed bookings protect unsafe hours changes')
  const csrf = await request('/api/booking/services', { method: 'POST', body: JSON.stringify({ name: 'Blocked', priceNgn: 1, durationMinutes: 1 }), headers: { Origin: 'http://evil.example' } }); assert.equal(csrf.response.status, 403)
  const providerCookie = cookie; cookie = ''; result = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `other-${id}@test.local`, password: 'safe-password-123', businessName: 'Other Studio', slug: `other-${id}` }) }); assert.equal(result.response.status, 201); result = await request('/api/booking/services'); assert.equal(result.body.length, 0)
  cookie = providerCookie; result = await request('/api/auth/logout', { method: 'POST' }); assert.equal(result.response.status, 204); assert.equal((await request('/api/auth/me')).response.status, 401)
  // Support inbox and password reset. Each visitor address gets its own rate limit.
  forwardedFor = '203.0.113.10'
  const owner = `owner-${id}@test.local`; const newPassword = 'new-password-456'
  cookie = ''; result = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: owner, password: 'safe-password-123', businessName: 'Owner', slug: `owner-${id}` }) }); assert.equal(result.response.status, 201)
  const oldSession = cookie; assert.equal((await request('/api/auth/inbox')).response.status, 404, 'other accounts cannot see the inbox')
  assert.equal((await request('/api/auth/me')).body.account.isAdmin, false)
  cookie = ''; assert.equal((await request('/api/auth/inbox')).response.status, 401)
  assert.equal((await request('/api/public/messages', { method: 'POST', body: JSON.stringify({ kind: 'question', message: '' }) }, false)).response.status, 400)
  assert.equal((await request('/api/public/messages', { method: 'POST', body: JSON.stringify({ kind: 'password', message: 'forged' }) }, false)).response.status, 400, 'visitors cannot forge password requests')
  assert.equal((await request('/api/public/messages', { method: 'POST', body: JSON.stringify({ kind: 'question', message: 'Hello there', contact: '0800' }) }, false)).response.status, 201)
  const known = await request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: owner }) }, false); const unknown = await request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: `missing-${id}@test.local` }) }, false)
  assert.equal(known.response.status, 200); assert.deepEqual(known.body, unknown.body, 'reset replies do not reveal accounts')
  await request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: owner }) }, false)
  forwardedFor = '203.0.113.11'
  result = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: 'admin-inbox@test.local', password: 'safe-password-123', businessName: 'Admin', slug: `admin-${id}` }) }); assert.equal(result.response.status, 201)
  const inbox = await request('/api/auth/inbox'); assert.equal(inbox.response.status, 200); assert.equal(typeof inbox.body.disk.usedPercent, 'number')
  const help = inbox.body.messages.filter((item) => item.kind === 'password' && item.contact === owner); assert.equal(help.length, 1, 'repeat requests stay as one message'); assert.equal(inbox.body.messages.filter((item) => item.contact === `missing-${id}@test.local`).length, 0)
  const question = inbox.body.messages.find((item) => item.message === 'Hello there'); assert.equal((await request(`/api/auth/inbox/${question.id}/reset-link`, { method: 'POST' })).response.status, 404, 'links are only for password requests')
  const issued = await request(`/api/auth/inbox/${help[0].id}/reset-link`, { method: 'POST' }); assert.equal(issued.response.status, 200); assert.equal(issued.body.email, owner); const resetToken = issued.body.url.split('#')[1]
  const replaced = await request(`/api/auth/inbox/${help[0].id}/reset-link`, { method: 'POST' }); const latestToken = replaced.body.url.split('#')[1]
  assert.equal((await request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: resetToken, password: newPassword }) }, false)).response.status, 400, 'a newer link cancels older ones')
  assert.equal((await request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: latestToken, password: 'short' }) }, false)).response.status, 400)
  assert.equal((await request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: latestToken, password: newPassword }) }, false)).response.status, 200)
  assert.equal((await request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: latestToken, password: 'another-password-789' }) }, false)).response.status, 400, 'links work once')
  assert.equal((await request('/api/auth/me', { headers: { Cookie: oldSession } }, false)).response.status, 401, 'reset signs out old sessions')
  assert.equal((await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: owner, password: 'safe-password-123' }) }, false)).response.status, 401)
  assert.equal((await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: owner, password: newPassword }) }, false)).response.status, 200)
  assert.ok(!(await request('/api/auth/inbox')).body.messages.some((item) => item.id === help[0].id), 'a completed reset closes the request')
  assert.equal((await request(`/api/auth/inbox/${question.id}/done`, { method: 'POST' })).response.status, 204)
  console.log('Booking API integration passed')
} finally { server.kill() }
