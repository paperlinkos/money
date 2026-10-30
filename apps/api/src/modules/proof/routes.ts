import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Express, Request, Response } from 'express'
import { requireDb } from '../../core/db.js'
import { accountPlan, hasPaidFeatures, plans } from '../../core/plans.js'
import { warmPreviews } from './files.js'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const cookie = (request: Request) => request.header('cookie')?.match(/(?:^|; )northstar_session=([^;]+)/)?.[1]

async function user(request: Request) {
  const token = cookie(request)
  if (!token) return undefined
  return (await requireDb().query('select user_id from platform_sessions where token_hash=$1 and expires_at>now()', [hash(token)])).rows[0]?.user_id as string | undefined
}

const auth = (handler: (request: Request, response: Response, userId: string) => Promise<unknown>) => async (request: Request, response: Response) => {
  try {
    const userId = await user(request)
    if (!userId) return void response.status(401).json({ error: 'Sign in required.' })
    await handler(request, response, userId)
  } catch {
    response.status(500).json({ error: 'Server error.' })
  }
}

export function proofRoutes(app: Express) {
  app.get('/api/proof/projects', auth(async (_request, response, userId) => {
    const projects = await requireDb().query('select * from proof_projects where owner_id=$1 and archived_at is null order by created_at desc', [userId])
    response.json(projects.rows)
  }))

  app.post('/api/proof/projects', auth(async (request, response, userId) => {
    const name = text(request.body?.name, 160)
    const clientName = text(request.body?.clientName, 120)
    if (!name || !clientName) return void response.status(400).json({ error: 'Project and client name are required.' })
    const { plan } = await accountPlan(userId)
    const client = await requireDb().connect()
    try {
      await client.query('begin')
      await client.query('select id from platform_users where id=$1 for update', [userId])
      const included = Number((await client.query('select count(*) from proof_projects where owner_id=$1 and archived_at is null and not uses_gallery_pass', [userId])).rows[0].count)
      const usesPass = included >= plans[plan].galleries
      if (usesPass && !(await client.query('update billing_credits set gallery_credits=gallery_credits-1 where user_id=$1 and gallery_credits>0', [userId])).rowCount) {
        await client.query('rollback')
        return void response.status(402).json({ error: plan === 'free' ? 'Your Free plan includes 1 client gallery. Upgrade or buy a gallery pass to add more.' : 'You have reached your plan’s gallery limit. Upgrade to Studio for unlimited galleries.', upgrade: true })
      }
      const project = await client.query('insert into proof_projects(id,owner_id,name,client_name,client_email,description,due_date,protected_preview,uses_gallery_pass) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *', [randomUUID(), userId, name, clientName, text(request.body?.clientEmail, 160) || null, text(request.body?.description, 2000), request.body?.dueDate || null, request.body?.protectedPreview !== false, usesPass])
      await client.query('commit')
      response.status(201).json(project.rows[0])
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    } finally { client.release() }
  }))

  app.get('/api/proof/projects/:id', auth(async (request, response, userId) => {
    const project = (await requireDb().query('select p.*,b.name business_name from proof_projects p left join booking_businesses b on b.user_id=p.owner_id where p.id=$1 and p.owner_id=$2', [request.params.id, userId])).rows[0]
    if (!project) return void response.status(404).json({ error: 'Project not found.' })
    const versions = (await requireDb().query('select d.id deliverable_id,d.name deliverable_name,d.created_at deliverable_created_at,v.id version_id,v.version_number,v.original_name,v.mime_type,v.size_bytes,v.created_at version_created_at from proof_deliverables d join proof_versions v on v.deliverable_id=d.id where d.project_id=$1 order by d.created_at desc,v.version_number desc', [project.id])).rows
    const deliverables = Object.values(versions.reduce((grouped: Record<string, any>, version: any) => {
      const current = grouped[version.deliverable_id] ?? { id: version.deliverable_id, name: version.deliverable_name, createdAt: version.deliverable_created_at, versions: [] }
      current.versions.push({ id: version.version_id, number: version.version_number, name: version.original_name, type: version.mime_type, size: version.size_bytes, createdAt: version.version_created_at })
      grouped[version.deliverable_id] = current
      return grouped
    }, {} as Record<string, any>))
    response.json({ ...project, deliverables, paidFeatures: await hasPaidFeatures(userId) })
  }))

  app.patch('/api/proof/projects/:id', auth(async (request, response, userId) => {
    const statuses = ['Draft', 'Awaiting Review', 'Changes Requested', 'Approved', 'Completed']
    const status = statuses.includes(request.body?.status) ? request.body.status : 'Draft'
    const project = await requireDb().query('update proof_projects set name=$1,client_name=$2,client_email=$3,description=$4,due_date=$5,status=$6 where id=$7 and owner_id=$8 returning *', [text(request.body?.name, 160), text(request.body?.clientName, 120), text(request.body?.clientEmail, 160) || null, text(request.body?.description, 2000), request.body?.dueDate || null, status, request.params.id, userId])
    if (!project.rowCount) return void response.status(404).json({ error: 'Project not found.' })
    response.json(project.rows[0])
  }))

  app.patch('/api/proof/projects/:id/protection', auth(async (request, response, userId) => {
    if (typeof request.body?.enabled !== 'boolean') return void response.status(400).json({ error: 'Choose whether protection is on or off.' })
    // Turning protection back on starts over, so an old release cannot expose later uploads.
    const project = await requireDb().query('update proof_projects set originals_released_at=case when $1 and not protected_preview then null else originals_released_at end,protected_preview=$1,watermark_text=$2 where id=$3 and owner_id=$4 returning id', [request.body.enabled, text(request.body?.watermarkText, 60) || null, request.params.id, userId])
    if (!project.rowCount) return void response.status(404).json({ error: 'Project not found.' })
    if (request.body.enabled) void warmPreviews(String(request.params.id)).catch((error) => console.error('ProofFlow preview failed', error))
    response.sendStatus(204)
  }))

  app.post('/api/proof/projects/:id/release-originals', auth(async (request, response, userId) => {
    if (typeof request.body?.released !== 'boolean') return void response.status(400).json({ error: 'Choose whether to release or take back the originals.' })
    const project = await requireDb().query('update proof_projects set originals_released_at=case when $1 then now() end where id=$2 and owner_id=$3 and protected_preview returning originals_released_at', [request.body.released, request.params.id, userId])
    if (!project.rowCount) return void response.status(404).json({ error: 'Protected gallery not found.' })
    response.json({ releasedAt: project.rows[0].originals_released_at })
  }))

  // Archiving frees a gallery slot, so it also stops the gallery being shared.
  app.post('/api/proof/projects/:id/archive', auth(async (request, response, userId) => {
    const project = await requireDb().query('update proof_projects set archived_at=now() where id=$1 and owner_id=$2 and archived_at is null returning id', [request.params.id, userId])
    if (!project.rowCount) return void response.status(404).json({ error: 'Gallery not found.' })
    await requireDb().query('update proof_review_links set revoked_at=now() where project_id=$1 and revoked_at is null', [request.params.id])
    response.sendStatus(204)
  }))

  app.get('/api/proof/projects/:id/review-links', auth(async (request, response, userId) => {
    const links = await requireDb().query('select l.id,l.expires_at,l.revoked_at,l.created_at from proof_review_links l join proof_projects p on p.id=l.project_id where l.project_id=$1 and p.owner_id=$2 order by l.created_at desc', [request.params.id, userId])
    response.json(links.rows)
  }))

  app.post('/api/proof/projects/:id/review-links', auth(async (request, response, userId) => {
    const project = (await requireDb().query('select id from proof_projects where id=$1 and owner_id=$2', [request.params.id, userId])).rows[0]
    if (!project) return void response.status(404).json({ error: 'Project not found.' })
    const deliverable = (await requireDb().query('select 1 from proof_deliverables where project_id=$1 limit 1', [project.id])).rowCount
    if (!deliverable) return void response.status(400).json({ error: 'Upload at least one deliverable before creating a review link.' })
    const token = randomBytes(32).toString('base64url')
    await requireDb().query('insert into proof_review_links(id,project_id,token_hash,expires_at) values($1,$2,$3,$4)', [randomUUID(), project.id, hash(token), request.body?.expiresAt || null])
    response.status(201).json({ url: `/review/${token}` })
  }))

  app.get('/api/public/review/:token', async (request, response) => {
    const rows = (await requireDb().query(
      "select p.owner_id,p.name,p.client_name,p.description,p.due_date,p.protected_preview,(p.originals_released_at is not null and v.created_at<=p.originals_released_at) original_released,d.id deliverable_id,d.name deliverable_name,v.id version_id,v.version_number,v.original_name,v.mime_type,v.size_bytes from proof_review_links l join proof_projects p on p.id=l.project_id left join proof_deliverables d on d.project_id=p.id left join lateral (select * from proof_versions where deliverable_id=d.id order by version_number desc limit 1) v on true where l.token_hash=$1 and l.revoked_at is null and (l.expires_at is null or l.expires_at>now())",
      [hash(request.params.token)],
    )).rows
    if (!rows.length) return void response.status(404).json({ error: 'This review link is invalid, expired, or revoked.' })
    response.json({
      project: { name: rows[0].name, clientName: rows[0].client_name, description: rows[0].description, dueDate: rows[0].due_date },
      approvalsEnabled: await hasPaidFeatures(rows[0].owner_id),
      deliverables: rows.filter((row) => row.version_id).map((row) => {
        const previewOnly = row.protected_preview && row.mime_type.startsWith('image/')
        return { id: row.deliverable_id, name: row.deliverable_name, version: { id: row.version_id, number: row.version_number, name: row.original_name, type: row.mime_type, size: row.size_bytes, previewOnly, originalAvailable: !previewOnly || row.original_released } }
      }),
    })
  })
}
