import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Express, Request, Response } from 'express'
import { requireDb } from '../../core/db.js'

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
    const project = await requireDb().query('insert into proof_projects(id,owner_id,name,client_name,client_email,description,due_date) values($1,$2,$3,$4,$5,$6,$7) returning *', [randomUUID(), userId, name, clientName, text(request.body?.clientEmail, 160) || null, text(request.body?.description, 2000), request.body?.dueDate || null])
    response.status(201).json(project.rows[0])
  }))

  app.get('/api/proof/projects/:id', auth(async (request, response, userId) => {
    const project = (await requireDb().query('select * from proof_projects where id=$1 and owner_id=$2', [request.params.id, userId])).rows[0]
    if (!project) return void response.status(404).json({ error: 'Project not found.' })
    const versions = (await requireDb().query('select d.id deliverable_id,d.name deliverable_name,d.created_at deliverable_created_at,v.id version_id,v.version_number,v.original_name,v.mime_type,v.size_bytes,v.created_at version_created_at from proof_deliverables d join proof_versions v on v.deliverable_id=d.id where d.project_id=$1 order by d.created_at desc,v.version_number desc', [project.id])).rows
    const deliverables = Object.values(versions.reduce((grouped: Record<string, any>, version: any) => {
      const current = grouped[version.deliverable_id] ?? { id: version.deliverable_id, name: version.deliverable_name, createdAt: version.deliverable_created_at, versions: [] }
      current.versions.push({ id: version.version_id, number: version.version_number, name: version.original_name, type: version.mime_type, size: version.size_bytes, createdAt: version.version_created_at })
      grouped[version.deliverable_id] = current
      return grouped
    }, {} as Record<string, any>))
    response.json({ ...project, deliverables })
  }))

  app.patch('/api/proof/projects/:id', auth(async (request, response, userId) => {
    const statuses = ['Draft', 'Awaiting Review', 'Changes Requested', 'Approved', 'Completed']
    const status = statuses.includes(request.body?.status) ? request.body.status : 'Draft'
    const project = await requireDb().query('update proof_projects set name=$1,client_name=$2,client_email=$3,description=$4,due_date=$5,status=$6 where id=$7 and owner_id=$8 returning *', [text(request.body?.name, 160), text(request.body?.clientName, 120), text(request.body?.clientEmail, 160) || null, text(request.body?.description, 2000), request.body?.dueDate || null, status, request.params.id, userId])
    if (!project.rowCount) return void response.status(404).json({ error: 'Project not found.' })
    response.json(project.rows[0])
  }))

  app.get('/api/proof/projects/:id/review-links', auth(async (request, response, userId) => {
    const links = await requireDb().query('select l.id,l.expires_at,l.revoked_at,l.created_at from proof_review_links l join proof_projects p on p.id=l.project_id where l.project_id=$1 and p.owner_id=$2 order by l.created_at desc', [request.params.id, userId])
    response.json(links.rows)
  }))

  app.post('/api/proof/projects/:id/review-links', auth(async (request, response, userId) => {
    const project = (await requireDb().query('select id from proof_projects where id=$1 and owner_id=$2', [request.params.id, userId])).rows[0]
    if (!project) return void response.status(404).json({ error: 'Project not found.' })
    const token = randomBytes(32).toString('base64url')
    await requireDb().query('insert into proof_review_links(id,project_id,token_hash,expires_at) values($1,$2,$3,$4)', [randomUUID(), project.id, hash(token), request.body?.expiresAt || null])
    response.status(201).json({ url: `/review/${token}` })
  }))

  app.get('/api/public/review/:token', async (request, response) => {
    const rows = (await requireDb().query(
      "select p.name,p.client_name,p.description,p.due_date,d.id deliverable_id,d.name deliverable_name,v.id version_id,v.version_number,v.original_name,v.mime_type,v.size_bytes from proof_review_links l join proof_projects p on p.id=l.project_id left join proof_deliverables d on d.project_id=p.id left join lateral (select * from proof_versions where deliverable_id=d.id order by version_number desc limit 1) v on true where l.token_hash=$1 and l.revoked_at is null and (l.expires_at is null or l.expires_at>now())",
      [hash(request.params.token)],
    )).rows
    if (!rows.length) return void response.status(404).json({ error: 'This review link is invalid, expired, or revoked.' })
    response.json({
      project: { name: rows[0].name, clientName: rows[0].client_name, description: rows[0].description, dueDate: rows[0].due_date },
      deliverables: rows.filter((row) => row.version_id).map((row) => ({ id: row.deliverable_id, name: row.deliverable_name, version: { id: row.version_id, number: row.version_number, name: row.original_name, type: row.mime_type, size: row.size_bytes } })),
    })
  })
}
