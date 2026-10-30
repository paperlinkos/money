import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { Client } from 'pg'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for this integration test.')

const port = Number(process.env.BILLING_TEST_PORT ?? 3103)
const base = `http://127.0.0.1:${port}`
const origin = 'http://localhost:5173'
const secret = 'sk_test_billing_integration'
const plans = { PAYSTACK_PLAN_PRO: 'PLN_test_pro', PAYSTACK_PLAN_STUDIO: 'PLN_test_studio' }
// Stands in for Paystack's verify endpoint, so no test ever reaches the real API.
const verifyStatuses = new Map()
const paystackPort = port + 1
const fakePaystack = createServer((request, response) => {
  const reference = decodeURIComponent(request.url.split('/').pop())
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify({ status: true, data: { reference, status: verifyStatuses.get(reference), amount: 250000, currency: 'NGN' } }))
}).listen(paystackPort, '127.0.0.1')
const server = spawn('node', ['apps/api/dist/server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), WEB_ORIGIN: origin, PAYSTACK_SECRET_KEY: secret, PAYSTACK_API_URL: `http://127.0.0.1:${paystackPort}`, ...plans },
  stdio: 'ignore',
})
const db = new Client({ connectionString: databaseUrl })

async function request(path, options = {}, session = undefined) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(session?.cookie ? { Cookie: session.cookie } : {}), ...(options.headers ?? {}) },
  })
  const set = response.headers.get('set-cookie')
  if (set && session) session.cookie = set.split(';')[0]
  const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text()
  return { response, body }
}
async function register(label) {
  const session = { cookie: '' }
  const id = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const result = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `${id}@test.local`, password: 'safe-password-123', businessName: label, slug: id }) }, session)
  assert.equal(result.response.status, 201)
  session.email = `${id}@test.local`
  session.userId = (await db.query('select id from platform_users where email=$1', [session.email])).rows[0].id
  return session
}
const gallery = (session, name) => request('/api/proof/projects', { method: 'POST', body: JSON.stringify({ name, clientName: 'Client' }) }, session)
// Webhooks come from Paystack's servers, so they carry no browser Origin header.
async function webhook(payload, signWith = secret) {
  const body = JSON.stringify(payload)
  const response = await fetch(`${base}/api/billing/webhook`, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'x-paystack-signature': createHmac('sha512', signWith).update(body).digest('hex') } })
  return response.status
}
const me = async (session) => (await request('/api/billing/me', {}, session)).body

try {
  await db.connect()
  await new Promise((resolve) => setTimeout(resolve, 500))
  const creator = await register('billing-free')

  assert.equal((await me(creator)).plan, 'free')
  assert.equal((await gallery(creator, 'First gallery')).response.status, 201)
  const blocked = await gallery(creator, 'Second gallery')
  assert.equal(blocked.response.status, 402)
  assert.equal(blocked.body.upgrade, true)

  // A gallery pass adds exactly one gallery, even if Paystack retries the webhook.
  await db.query("insert into billing_payments(reference,user_id,kind,amount_kobo) values('pl_pass_1',$1,'gallery_pass',250000)", [creator.userId])
  const passCharge = { event: 'charge.success', data: { reference: 'pl_pass_1', status: 'success', amount: 250000, currency: 'NGN', customer: { customer_code: 'CUS_free', email: creator.email } } }
  assert.equal(await webhook(passCharge, 'sk_wrong'), 401)
  assert.equal((await me(creator)).galleryAllowance, 1)
  assert.equal(await webhook(passCharge), 200)
  assert.equal(await webhook(passCharge), 200)
  assert.equal((await me(creator)).galleryAllowance, 2)
  assert.equal((await gallery(creator, 'Second gallery')).response.status, 201)
  assert.equal((await gallery(creator, 'Third gallery')).response.status, 402)
  // Archiving frees a slot.
  const oldest = (await db.query("select id from proof_projects where owner_id=$1 and name='First gallery'", [creator.userId])).rows[0].id
  assert.equal((await request(`/api/proof/projects/${oldest}/archive`, { method: 'POST' }, creator)).response.status, 204)
  assert.equal((await gallery(creator, 'Third gallery')).response.status, 201)

  // An underpaid charge never settles.
  const pro = await register('billing-pro')
  await db.query("insert into billing_payments(reference,user_id,kind,plan,amount_kobo) values('pl_pro_1',$1,'subscription','pro',500000)", [pro.userId])
  assert.equal(await webhook({ event: 'charge.success', data: { reference: 'pl_pro_1', status: 'success', amount: 100, currency: 'NGN', customer: { customer_code: 'CUS_pro', email: pro.email } } }), 200)
  assert.equal((await me(pro)).plan, 'free')

  const proCharge = { event: 'charge.success', data: { reference: 'pl_pro_1', status: 'success', amount: 500000, currency: 'NGN', plan: { plan_code: plans.PAYSTACK_PLAN_PRO }, customer: { customer_code: 'CUS_pro', email: pro.email } } }
  assert.equal(await webhook(proCharge), 200)
  const proPlan = await me(pro)
  assert.equal(proPlan.plan, 'pro')
  assert.equal(proPlan.galleryAllowance, 15)
  const firstPeriodEnd = new Date(proPlan.currentPeriodEnd).getTime()
  assert.equal(await webhook(proCharge), 200)
  assert.equal(new Date((await me(pro)).currentPeriodEnd).getTime(), firstPeriodEnd)

  assert.equal(await webhook({ event: 'subscription.create', data: { subscription_code: 'SUB_pro', email_token: 'tok', next_payment_date: new Date(firstPeriodEnd).toISOString(), plan: { plan_code: plans.PAYSTACK_PLAN_PRO }, customer: { customer_code: 'CUS_pro', email: pro.email } } }), 200)
  assert.equal((await me(pro)).canManage, true)

  // Renewals use Paystack's own reference; each extends the period once.
  const renewal = { event: 'charge.success', data: { reference: 'T_renewal_1', status: 'success', amount: 500000, currency: 'NGN', plan: { plan_code: plans.PAYSTACK_PLAN_PRO }, customer: { customer_code: 'CUS_pro', email: pro.email } } }
  assert.equal(await webhook(renewal), 200)
  assert.equal(await webhook(renewal), 200)
  const renewedEnd = new Date((await me(pro)).currentPeriodEnd).getTime()
  assert.ok(renewedEnd > firstPeriodEnd + 27 * 86_400_000 && renewedEnd < firstPeriodEnd + 32 * 86_400_000)

  // Cancelling keeps access until the paid period ends; disabling ends it.
  assert.equal(await webhook({ event: 'subscription.not_renew', data: { subscription_code: 'SUB_pro' } }), 200)
  assert.equal((await me(pro)).plan, 'pro')
  assert.equal(await webhook({ event: 'subscription.disable', data: { subscription_code: 'SUB_pro' } }), 200)
  assert.equal((await me(pro)).plan, 'free')

  // subscription.create can arrive before the first charge; the customer still gets one month.
  const early = await register('billing-early')
  const nextPayment = new Date(Date.now() + 30 * 86_400_000).toISOString()
  await db.query("insert into billing_payments(reference,user_id,kind,plan,amount_kobo) values('pl_early_1',$1,'subscription','pro',500000)", [early.userId])
  assert.equal(await webhook({ event: 'subscription.create', data: { subscription_code: 'SUB_early', email_token: 'tok', next_payment_date: nextPayment, plan: { plan_code: plans.PAYSTACK_PLAN_PRO }, customer: { customer_code: 'CUS_early', email: early.email } } }), 200)
  assert.equal(await webhook({ event: 'charge.success', data: { reference: 'pl_early_1', status: 'success', amount: 500000, currency: 'NGN', plan: { plan_code: plans.PAYSTACK_PLAN_PRO }, customer: { customer_code: 'CUS_early', email: early.email } } }), 200)
  assert.ok(new Date((await me(early)).currentPeriodEnd).getTime() < Date.now() + 32 * 86_400_000)

  // A failed payment is reported as failed, and still counts if the retry succeeds.
  const declined = await register('billing-declined')
  await db.query("insert into billing_payments(reference,user_id,kind,amount_kobo) values('pl_declined_1',$1,'gallery_pass',250000)", [declined.userId])
  const verify = () => request('/api/billing/verify', { method: 'POST', body: JSON.stringify({ reference: 'pl_declined_1' }) }, declined)
  verifyStatuses.set('pl_declined_1', 'abandoned')
  assert.equal((await verify()).body.paymentStatus, 'pending')
  verifyStatuses.set('pl_declined_1', 'failed')
  assert.equal((await verify()).body.paymentStatus, 'failed')
  verifyStatuses.set('pl_declined_1', 'success')
  const retried = await verify()
  assert.equal(retried.body.paymentStatus, 'success')
  assert.equal(retried.body.paymentKind, 'gallery_pass')
  assert.equal(retried.body.galleryAllowance, 2)

  // Another account cannot verify someone else's payment reference.
  assert.equal((await request('/api/billing/verify', { method: 'POST', body: JSON.stringify({ reference: 'pl_pro_1' }) }, creator)).response.status, 404)
  assert.equal((await request('/api/billing/me')).response.status, 401)
  console.log('Billing API integration passed')
} finally {
  server.kill()
  fakePaystack.close()
  await db.end()
}
