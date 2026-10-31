import { randomUUID } from 'node:crypto'
import { statfs } from 'node:fs/promises'
import type { Express, Request, Response } from 'express'
import { config } from '../../core/config.js'
import { requireDb } from '../../core/db.js'
import { auth, clearSignInFailures, hash, password, rateLimited, text, token, tx } from '../booking/routes.js'

const messageKinds = new Set(['question', 'problem', 'feature', 'pricing'])
const diskWarningPercent = 85
const admin = (handler: (req: Request, res: Response) => Promise<void>) => auth(async (req, res, business) => {
  // Hidden rather than forbidden, so other accounts cannot tell the inbox exists.
  if (!config.adminEmails.includes(business.email.toLowerCase())) return void res.status(404).json({ error: 'Not found' })
  await handler(req, res)
})

async function createResetLink(userId: string) {
  const raw = token()
  await tx(async (client) => {
    await client.query('delete from password_resets where user_id=$1', [userId])
    await client.query("insert into password_resets(token_hash,user_id,expires_at) values($1,$2,now()+interval '1 hour')", [hash(raw), userId])
  })
  // The token sits after # so it never reaches server logs.
  return `${config.webOrigin}/reset-password#${raw}`
}

async function queueForTeam(email: string) {
  const open = await requireDb().query("select 1 from support_messages where kind='password' and contact=$1 and done_at is null", [email])
  if (!open.rowCount) await requireDb().query("insert into support_messages(id,kind,message,contact) values($1,'password','Asked for a password reset link.',$2)", [randomUUID(), email])
}

async function sendResetEmail(email: string, url: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ from: config.mailFrom, to: email, subject: 'Reset your PaperlinkOS password', text: `Use this link to choose a new password. It works once and expires in one hour.\n\n${url}\n\nIf you did not ask for this, you can ignore this email.` }),
  })
  if (!response.ok) throw Error(`Resend returned ${response.status}`)
}

export function supportRoutes(app: Express) {
  app.post('/api/public/messages', async (req, res) => {
    if (rateLimited(req)) return void res.status(429).json({ error: 'Too many messages. Please try again shortly.' })
    const message = text(req.body?.message, 4000)
    if (!message || !messageKinds.has(req.body?.kind)) return void res.status(400).json({ error: 'Please add a message.' })
    try {
      await requireDb().query('insert into support_messages(id,kind,message,contact,would_pay) values($1,$2,$3,$4,$5)', [randomUUID(), req.body.kind, message, text(req.body?.contact, 160), text(req.body?.wouldPay, 10)])
      res.status(201).json({ ok: true })
    } catch { res.status(500).json({ error: 'Server error.' }) }
  })

  app.post('/api/auth/forgot-password', async (req, res) => {
    if (rateLimited(req)) return void res.status(429).json({ error: 'Too many attempts. Please wait a minute and try again.' })
    const email = text(req.body?.email, 254).toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) return void res.status(400).json({ error: 'Enter a valid email address.' })
    const automatic = Boolean(config.resendApiKey && config.mailFrom)
    try {
      const user = (await requireDb().query('select id from platform_users where email=$1', [email])).rows[0]
      // The reply never depends on whether the account exists, and sending happens afterwards so timing does not reveal it either.
      if (user && !automatic) await queueForTeam(email)
      res.json({ delivery: automatic ? 'email' : 'team' })
      if (user && automatic) void createResetLink(user.id).then((url) => sendResetEmail(email, url)).catch((error) => { console.error('Password email failed', error); return queueForTeam(email) }).catch((error) => console.error('Password request lost', error))
    } catch { if (!res.headersSent) res.status(500).json({ error: 'Server error.' }) }
  })

  app.post('/api/auth/reset-password', async (req, res) => {
    if (rateLimited(req)) return void res.status(429).json({ error: 'Too many attempts. Please wait a minute and try again.' })
    const raw = req.body?.token, pass = req.body?.password
    if (typeof raw !== 'string' || !raw || typeof pass !== 'string' || pass.length < 8) return void res.status(400).json({ error: 'Use a password of at least 8 characters.' })
    try {
      const email = await tx(async (client) => {
        const reset = (await client.query('update password_resets set used_at=now() where token_hash=$1 and used_at is null and expires_at>now() returning user_id', [hash(raw)])).rows[0]
        if (!reset) return undefined
        const user = (await client.query('update platform_users set password_hash=$1 where id=$2 returning email', [password(pass), reset.user_id])).rows[0]
        // Whoever knew the old password is signed out everywhere.
        await client.query('delete from platform_sessions where user_id=$1', [reset.user_id])
        await client.query("update support_messages set done_at=now() where kind='password' and contact=$1 and done_at is null", [user.email])
        return user.email as string
      })
      if (!email) return void res.status(400).json({ error: 'This reset link has expired or was already used. Please ask for a new one.' })
      clearSignInFailures(email)
      res.json({ ok: true })
    } catch { res.status(500).json({ error: 'Server error.' }) }
  })

  app.get('/api/auth/inbox', admin(async (_req, res) => {
    const [messages, disk] = await Promise.all([
      requireDb().query('select id,kind,message,contact,would_pay,created_at from support_messages where done_at is null order by created_at desc limit 200'),
      statfs(process.cwd()),
    ])
    const usedPercent = Math.round((1 - disk.bavail / disk.blocks) * 100)
    res.json({ messages: messages.rows, disk: { usedPercent, freeGb: Math.round(disk.bavail * disk.bsize / 1024 ** 3), warning: usedPercent >= diskWarningPercent } })
  }))

  // A link is only ever issued for the address on the account, so a stranger asking for help cannot receive it.
  app.post('/api/auth/inbox/:id/reset-link', admin(async (req, res) => {
    const found = (await requireDb().query("select u.id,u.email from support_messages m join platform_users u on u.email=m.contact where m.id=$1 and m.kind='password'", [req.params.id])).rows[0]
    if (!found) return void res.status(404).json({ error: 'No account matches this request.' })
    res.json({ email: found.email, url: await createResetLink(found.id) })
  }))

  app.post('/api/auth/inbox/:id/done', admin(async (req, res) => {
    await requireDb().query('update support_messages set done_at=now() where id=$1', [req.params.id])
    res.sendStatus(204)
  }))
}
