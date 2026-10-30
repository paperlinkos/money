import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Express, Request, Response } from 'express'
import type { PoolClient } from 'pg'
import { config } from '../../core/config.js'
import { requireDb } from '../../core/db.js'
import { accountPlan, galleryPassKobo, plans } from '../../core/plans.js'

type PaidPlan = 'pro' | 'studio'
type Product = PaidPlan | 'gallery_pass'
type Charge = { reference: string; status: string; amount: number; currency: string; customer?: { customer_code?: string; email?: string }; plan?: { plan_code?: string } | string | null }

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const session = (request: Request) => request.header('cookie')?.match(/(?:^|; )northstar_session=([^;]+)/)?.[1]
const planCodes = () => ({ pro: config.paystackPlanPro, studio: config.paystackPlanStudio })
const configured = () => Boolean(config.paystackSecretKey && config.paystackPlanPro && config.paystackPlanStudio)
const planForCode = (code: unknown): PaidPlan | undefined => code && code === config.paystackPlanPro ? 'pro' : code && code === config.paystackPlanStudio ? 'studio' : undefined

async function user(request: Request) {
  const token = session(request)
  if (!token) return undefined
  return (await requireDb().query('select u.id,u.email from platform_sessions s join platform_users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now()', [hash(token)])).rows[0] as { id: string; email: string } | undefined
}

const auth = (handler: (request: Request, response: Response, account: { id: string; email: string }) => Promise<unknown>) => async (request: Request, response: Response) => {
  try {
    const account = await user(request)
    if (!account) return void response.status(401).json({ error: 'Sign in required.' })
    await handler(request, response, account)
  } catch (error) {
    console.error('Billing request failed', error)
    response.status(502).json({ error: 'Billing is temporarily unavailable. Please try again.' })
  }
}

async function paystack<T>(path: string, init?: { method?: string; body?: unknown }) {
  const response = await fetch(`${config.paystackApiUrl}${path}`, {
    method: init?.method ?? 'GET',
    headers: { Authorization: `Bearer ${config.paystackSecretKey}`, 'Content-Type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  const body = await response.json() as { status?: boolean; message?: string; data?: T }
  if (!response.ok || !body.status) throw Error(`Paystack ${path}: ${body.message ?? response.status}`)
  return body.data as T
}

async function tx<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await requireDb().connect()
  try { await client.query('begin'); const result = await work(client); await client.query('commit'); return result } catch (error) { await client.query('rollback'); throw error } finally { client.release() }
}

// Moves an unpaid payment to success exactly once, then grants what was bought.
// A failed payment can still succeed: the customer may retry on the same Paystack checkout.
async function settle(charge: Charge) {
  if (charge.status !== 'success' || charge.currency !== 'NGN') return false
  return tx(async (client) => {
    const payment = (await client.query("update billing_payments set status='success',paid_at=now() where reference=$1 and status in ('pending','failed') and amount_kobo<=$2 returning *", [charge.reference, charge.amount])).rows[0]
    if (!payment) return false
    if (payment.kind === 'gallery_pass') {
      await client.query('insert into billing_credits(user_id,gallery_credits) values($1,1) on conflict (user_id) do update set gallery_credits=billing_credits.gallery_credits+1', [payment.user_id])
    } else {
      await client.query(
        `insert into billing_subscriptions(user_id,plan,status,paystack_customer_code,current_period_end) values($1,$2,'active',$3,now()+interval '1 month')
         on conflict (user_id) do update set status='active', paystack_customer_code=coalesce(excluded.paystack_customer_code,billing_subscriptions.paystack_customer_code),
           current_period_end=case when billing_subscriptions.plan=excluded.plan and billing_subscriptions.current_period_end>now() then billing_subscriptions.current_period_end else now()+interval '1 month' end,
           plan=excluded.plan, updated_at=now()`,
        [payment.user_id, payment.plan, charge.customer?.customer_code ?? null],
      )
    }
    return true
  })
}

// Paystack charges renewals with its own reference, so record each one once and extend the period.
async function renew(charge: Charge) {
  const plan = planForCode(typeof charge.plan === 'string' ? charge.plan : charge.plan?.plan_code)
  if (!plan || charge.status !== 'success' || !charge.customer?.customer_code) return
  const renewed = await tx(async (client) => {
    const owner = (await client.query('select user_id,paystack_subscription_code from billing_subscriptions where paystack_customer_code=$1 and plan=$2', [charge.customer?.customer_code, plan])).rows[0]
    if (!owner) return
    const inserted = await client.query("insert into billing_payments(reference,user_id,kind,plan,amount_kobo,status,paid_at) values($1,$2,'renewal',$3,$4,'success',now()) on conflict do nothing", [charge.reference, owner.user_id, plan, charge.amount])
    if (!inserted.rowCount) return
    await client.query("update billing_subscriptions set status='active',current_period_end=greatest(current_period_end,now())+interval '1 month',updated_at=now() where user_id=$1", [owner.user_id])
    return owner as { user_id: string; paystack_subscription_code: string | null }
  })
  // Access is already extended above; this only lines the end date up with Paystack's next charge.
  if (renewed?.paystack_subscription_code) {
    await paystack<{ next_payment_date?: string }>(`/subscription/${renewed.paystack_subscription_code}`)
      .then(({ next_payment_date: next }) => next ? requireDb().query('update billing_subscriptions set current_period_end=$1::timestamptz where user_id=$2 and $1::timestamptz>now()', [next, renewed.user_id]) : undefined)
      .catch((error) => console.error('Could not read next payment date', error))
  }
}

async function subscriptionCreated(data: { subscription_code: string; email_token: string; next_payment_date?: string; customer?: { customer_code?: string; email?: string }; plan?: { plan_code?: string } }) {
  const plan = planForCode(data.plan?.plan_code)
  if (!plan) return
  const owner = (await requireDb().query('select id from platform_users where lower(email)=lower($1)', [data.customer?.email ?? ''])).rows[0]
  if (!owner) return
  const previous = (await requireDb().query('select paystack_subscription_code,paystack_email_token from billing_subscriptions where user_id=$1', [owner.id])).rows[0]
  await requireDb().query(
    `insert into billing_subscriptions(user_id,plan,status,paystack_customer_code,paystack_subscription_code,paystack_email_token,current_period_end)
       values($1,$2,'active',$3,$4,$5,coalesce($6::timestamptz,now()+interval '1 month'))
     on conflict (user_id) do update set plan=excluded.plan, status='active', paystack_customer_code=excluded.paystack_customer_code,
       paystack_subscription_code=excluded.paystack_subscription_code, paystack_email_token=excluded.paystack_email_token,
       current_period_end=coalesce($6::timestamptz,billing_subscriptions.current_period_end), updated_at=now()`,
    [owner.id, plan, data.customer?.customer_code ?? null, data.subscription_code, data.email_token, data.next_payment_date ?? null],
  )
  // A plan change creates a second Paystack subscription; stop the old one so the customer is not billed twice.
  if (previous?.paystack_subscription_code && previous.paystack_subscription_code !== data.subscription_code) {
    await paystack('/subscription/disable', { method: 'POST', body: { code: previous.paystack_subscription_code, token: previous.paystack_email_token } }).catch((error) => console.error('Could not disable replaced subscription', error))
  }
}

export function billingRoutes(app: Express) {
  app.get('/api/billing/me', auth(async (_request, response, account) => {
    const subscription = (await requireDb().query('select paystack_subscription_code from billing_subscriptions where user_id=$1', [account.id])).rows[0]
    response.set('Cache-Control', 'no-store').json({ ...await accountPlan(account.id), canManage: Boolean(subscription?.paystack_subscription_code), billingConfigured: configured() })
  }))

  app.post('/api/billing/checkout', auth(async (request, response, account) => {
    if (!configured()) return void response.status(503).json({ error: 'Payments are not switched on yet.' })
    const product = request.body?.product as Product
    if (!['pro', 'studio', 'gallery_pass'].includes(product)) return void response.status(400).json({ error: 'Choose a plan.' })
    const current = await accountPlan(account.id)
    if (product !== 'gallery_pass' && current.plan === product && current.status === 'active') return void response.status(409).json({ error: `You are already on ${plans[product].name}.` })
    const reference = `pl_${randomBytes(12).toString('hex')}`
    const amount = product === 'gallery_pass' ? galleryPassKobo : plans[product].amountKobo
    await requireDb().query('insert into billing_payments(reference,user_id,kind,plan,amount_kobo) values($1,$2,$3,$4,$5)', [reference, account.id, product === 'gallery_pass' ? 'gallery_pass' : 'subscription', product === 'gallery_pass' ? null : product, amount])
    const checkout = await paystack<{ authorization_url: string }>('/transaction/initialize', {
      method: 'POST',
      body: { email: account.email, amount: String(amount), currency: 'NGN', reference, callback_url: `${config.webOrigin}/billing/return`, metadata: { user_id: account.id, product }, ...(product === 'gallery_pass' ? {} : { plan: planCodes()[product] }) },
    })
    response.json({ url: checkout.authorization_url })
  }))

  app.post('/api/billing/verify', auth(async (request, response, account) => {
    const reference = String(request.body?.reference ?? '')
    const payment = (await requireDb().query('select status from billing_payments where reference=$1 and user_id=$2', [reference, account.id])).rows[0]
    if (!payment) return void response.status(404).json({ error: 'Payment not found.' })
    if (payment.status !== 'success') {
      const charge = await paystack<Charge>(`/transaction/verify/${encodeURIComponent(reference)}`)
      if (charge.status === 'failed') await requireDb().query("update billing_payments set status='failed' where reference=$1 and status='pending'", [reference])
      else await settle(charge)
    }
    const { status, kind } = (await requireDb().query('select status,kind from billing_payments where reference=$1', [reference])).rows[0]
    response.json({ ...await accountPlan(account.id), paymentStatus: status, paymentKind: kind })
  }))

  app.post('/api/billing/manage', auth(async (_request, response, account) => {
    const subscription = (await requireDb().query('select paystack_subscription_code from billing_subscriptions where user_id=$1', [account.id])).rows[0]
    if (!subscription?.paystack_subscription_code) return void response.status(404).json({ error: 'No active subscription to manage.' })
    const link = await paystack<{ link: string }>(`/subscription/${subscription.paystack_subscription_code}/manage/link`)
    response.json({ url: link.link })
  }))

  app.post('/api/billing/webhook', async (request, response) => {
    const raw = (request as Request & { rawBody?: Buffer }).rawBody
    const signature = Buffer.from(request.header('x-paystack-signature') ?? '', 'hex')
    const expected = config.paystackSecretKey && raw ? createHmac('sha512', config.paystackSecretKey).update(raw).digest() : undefined
    if (!expected || signature.length !== expected.length || !timingSafeEqual(signature, expected)) return void response.sendStatus(401)
    const { event, data } = request.body ?? {}
    try {
      if (event === 'charge.success') { if (!await settle(data)) await renew(data) }
      else if (event === 'subscription.create') await subscriptionCreated(data)
      else if (event === 'subscription.not_renew') await requireDb().query("update billing_subscriptions set status='non_renewing',updated_at=now() where paystack_subscription_code=$1", [data?.subscription_code])
      else if (event === 'subscription.disable') await requireDb().query("update billing_subscriptions set status='cancelled',updated_at=now() where paystack_subscription_code=$1", [data?.subscription_code])
      else if (event === 'invoice.payment_failed') await requireDb().query("update billing_subscriptions set status='past_due',updated_at=now() where paystack_subscription_code=$1", [data?.subscription?.subscription_code])
      response.sendStatus(200)
    } catch (error) {
      console.error('Paystack webhook failed', event, error)
      response.sendStatus(500)
    }
  })
}
