import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Express, Request, Response } from 'express'
import type { Pool, PoolClient } from 'pg'
import { requireDb } from '../../core/db.js'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const cookie = (request: Request, name: string) => request.header('cookie')?.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1]
const attempts = new Map<string, { count: number; until: number }>()

function limited(request: Request) {
  const now = Date.now()
  const key = request.ip || 'local'
  const attempt = attempts.get(key)
  if (!attempt || attempt.until < now) { attempts.set(key, { count: 1, until: now + 60_000 }); return false }
  return ++attempt.count > 20
}

async function activeLink(token: string) {
  return (await requireDb().query("select id link_id,project_id from proof_review_links where token_hash=$1 and revoked_at is null and (expires_at is null or expires_at>now())", [hash(token)])).rows[0] as { link_id: string; project_id: string } | undefined
}

async function participant(request: Request, link: { link_id: string }) {
  const key = cookie(request, 'proof_review_participant')
  if (!key) return undefined
  return (await requireDb().query('select id,client_name from proof_review_participants where review_link_id=$1 and client_key_hash=$2', [link.link_id, hash(key)])).rows[0] as { id: string; client_name: string } | undefined
}

async function creator(request: Request) {
  const token = cookie(request, 'northstar_session')
  if (!token) return undefined
  return (await requireDb().query('select user_id from platform_sessions where token_hash=$1 and expires_at>now()', [hash(token)])).rows[0]?.user_id as string | undefined
}

const auth = (handler: (request: Request, response: Response, userId: string) => Promise<unknown>) => async (request: Request, response: Response) => {
  try {
    const userId = await creator(request)
    if (!userId) return void response.status(401).json({ error: 'Sign in required.' })
    await handler(request, response, userId)
  } catch { response.status(500).json({ error: 'Server error.' }) }
}

async function scopedVersion(versionId: string, projectId: string, client: Pool | PoolClient = requireDb()) {
  return (await client.query('select v.id,d.id deliverable_id,v.mime_type,v.version_number from proof_versions v join proof_deliverables d on d.id=v.deliverable_id where v.id=$1 and d.project_id=$2', [versionId, projectId])).rows[0] as { id: string; deliverable_id: string; mime_type: string; version_number: number } | undefined
}

export function proofFeedbackRoutes(app: Express) {
  app.post('/api/public/review/:token/participant', async (request, response) => {
    const link = await activeLink(request.params.token)
    const name = text(request.body?.name, 80)
    if (!link || !name) return void response.status(400).json({ error: 'Enter a display name for this active review.' })
    const current = await participant(request, link)
    if (current) return void response.json({ name: current.client_name })
    const rawKey = randomBytes(24).toString('base64url')
    await requireDb().query('insert into proof_review_participants(id,review_link_id,client_name,client_key_hash) values($1,$2,$3,$4)', [randomUUID(), link.link_id, name, hash(rawKey)])
    response.cookie('proof_review_participant', rawKey, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 2_592_000_000 }).json({ name })
  })

  app.get('/api/public/review/:token/feedback', async (request, response) => {
    const link = await activeLink(request.params.token)
    if (!link) return void response.status(404).json({ error: 'Review unavailable.' })
    const reviewParticipant = await participant(request, link)
    const [comments, favorites, approvals] = await Promise.all([
      requireDb().query('select c.version_id,c.body,c.created_at,p.client_name from proof_comments c join proof_review_participants p on p.id=c.participant_id where c.project_id=$1 order by c.created_at', [link.project_id]),
      reviewParticipant ? requireDb().query('select version_id from proof_favorites where participant_id=$1', [reviewParticipant.id]) : { rows: [] },
      reviewParticipant ? requireDb().query('select version_id from proof_approvals where participant_id=$1 and project_id=$2', [reviewParticipant.id, link.project_id]) : { rows: [] },
    ])
    response.json({ participant: reviewParticipant?.client_name ?? null, comments: comments.rows, favorites: favorites.rows.map((row) => row.version_id), approvals: approvals.rows.map((row) => row.version_id) })
  })

  app.post('/api/public/review/:token/comments', async (request, response) => {
    const link = await activeLink(request.params.token)
    const reviewParticipant = link && await participant(request, link)
    const body = text(request.body?.body, 2000)
    const versionId = text(request.body?.versionId, 80)
    if (limited(request)) return void response.status(429).json({ error: 'Please wait before sending more feedback.' })
    if (!link || !reviewParticipant || !body || !versionId) return void response.status(400).json({ error: 'Choose a name, file, and comment.' })
    const version = await scopedVersion(versionId, link.project_id)
    if (!version) return void response.status(404).json({ error: 'File not available.' })
    const duplicate = await requireDb().query("select id from proof_comments where participant_id=$1 and version_id=$2 and body=$3 and created_at>now()-interval '5 minutes'", [reviewParticipant.id, version.id, body])
    if (duplicate.rowCount) return void response.json({ id: duplicate.rows[0].id, duplicate: true })
    const id = randomUUID()
    await requireDb().query('insert into proof_comments(id,project_id,deliverable_id,version_id,participant_id,body) values($1,$2,$3,$4,$5,$6)', [id, link.project_id, version.deliverable_id, version.id, reviewParticipant.id, body])
    response.status(201).json({ id })
  })

  app.put('/api/public/review/:token/favorites/:versionId', async (request, response) => {
    const link = await activeLink(request.params.token)
    const reviewParticipant = link && await participant(request, link)
    if (!link || !reviewParticipant) return void response.status(401).json({ error: 'Enter your display name first.' })
    const version = await scopedVersion(request.params.versionId, link.project_id)
    if (!version || !version.mime_type.startsWith('image/')) return void response.status(404).json({ error: 'Only shared images can be selected.' })
    await requireDb().query('insert into proof_favorites(participant_id,version_id) values($1,$2) on conflict do nothing', [reviewParticipant.id, version.id])
    response.sendStatus(204)
  })

  app.delete('/api/public/review/:token/favorites/:versionId', async (request, response) => {
    const link = await activeLink(request.params.token)
    const reviewParticipant = link && await participant(request, link)
    if (!link || !reviewParticipant) return void response.status(401).json({ error: 'Enter your display name first.' })
    await requireDb().query('delete from proof_favorites where participant_id=$1 and version_id=$2', [reviewParticipant.id, request.params.versionId])
    response.sendStatus(204)
  })

  app.post('/api/public/review/:token/revisions', async (request, response) => {
    const link = await activeLink(request.params.token)
    const reviewParticipant = link && await participant(request, link)
    const body = text(request.body?.body, 2000)
    const versionId = text(request.body?.versionId, 80)
    if (limited(request)) return void response.status(429).json({ error: 'Please wait before sending more feedback.' })
    if (!link || !reviewParticipant || !body || !versionId) return void response.status(400).json({ error: 'Choose a name, file, and change request.' })
    const version = await scopedVersion(versionId, link.project_id)
    if (!version) return void response.status(404).json({ error: 'File not available.' })
    const duplicate = await requireDb().query("select id from proof_revision_requests where participant_id=$1 and version_id=$2 and body=$3 and created_at>now()-interval '5 minutes'", [reviewParticipant.id, version.id, body])
    if (duplicate.rowCount) return void response.json({ id: duplicate.rows[0].id, duplicate: true })
    const id = randomUUID()
    await requireDb().query('insert into proof_revision_requests(id,project_id,deliverable_id,version_id,participant_id,body) values($1,$2,$3,$4,$5,$6)', [id, link.project_id, version.deliverable_id, version.id, reviewParticipant.id, body])
    response.status(201).json({ id })
  })

  app.post('/api/public/review/:token/approvals', async (request, response) => {
    const link = await activeLink(request.params.token)
    const reviewParticipant = link && await participant(request, link)
    const versionId = text(request.body?.versionId, 80)
    if (limited(request)) return void response.status(429).json({ error: 'Please wait before submitting another response.' })
    if (!link || !reviewParticipant || !versionId || request.body?.confirmed !== true) return void response.status(400).json({ error: 'Confirm the current file version before approving it.' })
    const client = await requireDb().connect()
    try {
      await client.query('begin')
      const version = await scopedVersion(versionId, link.project_id, client)
      if (!version) { await client.query('rollback'); return void response.status(404).json({ error: 'File not available.' }) }
      await client.query('select id from proof_deliverables where id=$1 for update', [version.deliverable_id])
      const latest = (await client.query('select id from proof_versions where deliverable_id=$1 order by version_number desc limit 1', [version.deliverable_id])).rows[0]
      if (!latest || latest.id !== version.id) { await client.query('rollback'); return void response.status(409).json({ error: 'This file has been replaced. Please review the current version.' }) }
      const result = await client.query('insert into proof_approvals(id,project_id,deliverable_id,version_id,participant_id) values($1,$2,$3,$4,$5) on conflict(participant_id,version_id) do nothing returning id,created_at', [randomUUID(), link.project_id, version.deliverable_id, version.id, reviewParticipant.id])
      await client.query('commit')
      response.status(result.rowCount ? 201 : 200).json({ id: result.rows[0]?.id, duplicate: !result.rowCount })
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    } finally { client.release() }
  })

  app.get('/api/proof/projects/:id/feedback', auth(async (request, response, userId) => {
    const project = (await requireDb().query('select id from proof_projects where id=$1 and owner_id=$2', [request.params.id, userId])).rows[0]
    if (!project) return void response.status(404).json({ error: 'Project not found.' })
    const [comments, favorites, revisions, approvals] = await Promise.all([
      requireDb().query('select c.version_id,c.body,c.created_at,pp.client_name,v.original_name from proof_comments c join proof_review_participants pp on pp.id=c.participant_id join proof_versions v on v.id=c.version_id where c.project_id=$1 order by c.created_at desc', [project.id]),
      requireDb().query('select f.version_id,v.original_name,count(*)::int count from proof_favorites f join proof_versions v on v.id=f.version_id join proof_deliverables d on d.id=v.deliverable_id where d.project_id=$1 group by f.version_id,v.original_name', [project.id]),
      requireDb().query('select r.id,r.version_id,r.body,r.status,r.created_at,pp.client_name,v.original_name from proof_revision_requests r join proof_review_participants pp on pp.id=r.participant_id join proof_versions v on v.id=r.version_id where r.project_id=$1 order by r.created_at desc', [project.id]),
      requireDb().query('select a.version_id,a.created_at,pp.client_name,v.original_name,v.version_number,d.name deliverable_name, case when v.version_number=(select max(version_number) from proof_versions where deliverable_id=d.id) then true else false end as current from proof_approvals a join proof_review_participants pp on pp.id=a.participant_id join proof_versions v on v.id=a.version_id join proof_deliverables d on d.id=v.deliverable_id where a.project_id=$1 order by a.created_at desc', [project.id]),
    ])
    response.json({ comments: comments.rows, favorites: favorites.rows, revisions: revisions.rows, approvals: approvals.rows })
  }))

  app.patch('/api/proof/revisions/:id', auth(async (request, response, userId) => {
    if (request.body?.status !== 'Addressed') return void response.status(400).json({ error: 'Only Addressed is allowed.' })
    const updated = await requireDb().query("update proof_revision_requests r set status='Addressed',addressed_at=now() from proof_projects p where r.id=$1 and r.project_id=p.id and p.owner_id=$2 and r.status='Open' returning r.id", [request.params.id, userId])
    if (!updated.rowCount) return void response.status(404).json({ error: 'Open revision request not found.' })
    response.sendStatus(204)
  }))
}
