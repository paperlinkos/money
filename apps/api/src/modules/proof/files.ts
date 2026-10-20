import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Express, Request, Response } from 'express'
import { requireDb } from '../../core/db.js'

const root = resolve(process.cwd(), process.env.PROOF_UPLOAD_DIR ?? 'private-uploads/proof')
const limit = 5 * 1024 * 1024
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const session = (request: Request) => request.header('cookie')?.match(/(?:^|; )northstar_session=([^;]+)/)?.[1]

function fileType(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.subarray(0, 3).toString() === '\xff\xd8\xff') return 'image/jpeg'
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  if (bytes.subarray(0, 5).toString() === '%PDF-') return 'application/pdf'
  return ''
}

async function user(request: Request) {
  const token = session(request)
  if (!token) return undefined
  return (await requireDb().query(
    'select user_id from platform_sessions where token_hash=$1 and expires_at>now()',
    [hash(token)],
  )).rows[0]?.user_id as string | undefined
}

const auth = (handler: (request: Request, response: Response, userId: string) => Promise<unknown>) => async (request: Request, response: Response) => {
  try {
    const userId = await user(request)
    if (!userId) return void response.status(401).json({ error: 'Sign in required.' })
    await handler(request, response, userId)
  } catch (error) {
    console.error('ProofFlow file request failed', error)
    response.status(500).json({ error: 'File request failed.' })
  }
}

function incomingFile(request: Request) {
  const encoded = String(request.body?.data ?? '').replace(/^data:[^;]+;base64,/, '')
  const bytes = Buffer.from(encoded, 'base64')
  const mime = fileType(bytes)
  const name = String(request.body?.name ?? 'file').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 160)
  if (!mime || !bytes.length || bytes.length > limit) throw Error('Use a valid JPEG, PNG, WebP, or PDF up to 5 MB.')
  return { bytes, mime, name }
}

async function storeBytes(bytes: Buffer, mime: string) {
  const storageName = `${randomUUID()}.${mime.split('/')[1]}`
  await mkdir(root, { recursive: true })
  await writeFile(resolve(root, storageName), bytes, { flag: 'wx' })
  return storageName
}

export function proofFileRoutes(app: Express) {
  app.post('/api/proof/projects/:id/files', auth(async (request, response, userId) => {
    let file: ReturnType<typeof incomingFile>
    try { file = incomingFile(request) } catch (error) { return void response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid upload.' }) }
    const project = (await requireDb().query('select id from proof_projects where id=$1 and owner_id=$2', [request.params.id, userId])).rows[0]
    if (!project) return void response.status(404).json({ error: 'Project not found.' })

    const storageName = await storeBytes(file.bytes, file.mime)
    const deliverableId = randomUUID()
    const versionId = randomUUID()
    const client = await requireDb().connect()
    try {
      await client.query('begin')
      await client.query('insert into proof_deliverables(id,project_id,name) values($1,$2,$3)', [deliverableId, project.id, file.name])
      await client.query('insert into proof_versions(id,deliverable_id,version_number,original_name,storage_name,mime_type,size_bytes) values($1,$2,1,$3,$4,$5,$6)', [versionId, deliverableId, file.name, storageName, file.mime, file.bytes.length])
      await client.query('commit')
      response.status(201).json({ id: versionId, deliverableId, versionNumber: 1, name: file.name, mime: file.mime, size: file.bytes.length })
    } catch (error) {
      await client.query('rollback')
      await unlink(resolve(root, storageName)).catch(() => undefined)
      throw error
    } finally { client.release() }
  }))

  app.post('/api/proof/deliverables/:id/versions', auth(async (request, response, userId) => {
    let file: ReturnType<typeof incomingFile>
    try { file = incomingFile(request) } catch (error) { return void response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid upload.' }) }
    const storageName = await storeBytes(file.bytes, file.mime)
    const versionId = randomUUID()
    const client = await requireDb().connect()
    try {
      await client.query('begin')
      const deliverable = (await client.query(
        'select d.id,d.project_id from proof_deliverables d join proof_projects p on p.id=d.project_id where d.id=$1 and p.owner_id=$2 for update',
        [request.params.id, userId],
      )).rows[0]
      if (!deliverable) {
        await client.query('rollback')
        await unlink(resolve(root, storageName)).catch(() => undefined)
        return void response.status(404).json({ error: 'Deliverable not found.' })
      }
      const next = (await client.query('select coalesce(max(version_number),0)+1 as number from proof_versions where deliverable_id=$1', [deliverable.id])).rows[0].number
      await client.query('insert into proof_versions(id,deliverable_id,version_number,original_name,storage_name,mime_type,size_bytes) values($1,$2,$3,$4,$5,$6,$7)', [versionId, deliverable.id, next, file.name, storageName, file.mime, file.bytes.length])
      await client.query('commit')
      response.status(201).json({ id: versionId, deliverableId: deliverable.id, versionNumber: Number(next), name: file.name, mime: file.mime, size: file.bytes.length })
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      await unlink(resolve(root, storageName)).catch(() => undefined)
      throw error
    } finally { client.release() }
  }))

  app.get('/api/proof/files/:id', auth(async (request, response, userId) => {
    const file = (await requireDb().query('select v.* from proof_versions v join proof_deliverables d on d.id=v.deliverable_id join proof_projects p on p.id=d.project_id where v.id=$1 and p.owner_id=$2', [request.params.id, userId])).rows[0]
    if (!file) return void response.status(404).json({ error: 'File not found.' })
    response.type(file.mime_type).send(await readFile(resolve(root, file.storage_name)))
  }))

  app.post('/api/proof/review-links/:id/revoke', auth(async (request, response, userId) => {
    const result = await requireDb().query('update proof_review_links l set revoked_at=now() from proof_projects p where l.id=$1 and l.project_id=p.id and p.owner_id=$2 and l.revoked_at is null returning l.id', [request.params.id, userId])
    if (!result.rowCount) return void response.status(404).json({ error: 'Active review link not found.' })
    response.sendStatus(204)
  }))

  app.get('/api/public/review/:token/files/:id', async (request, response) => {
    const file = (await requireDb().query(
      "select v.* from proof_review_links l join proof_deliverables d on d.project_id=l.project_id join proof_versions v on v.deliverable_id=d.id where l.token_hash=$1 and v.id=$2 and v.version_number=(select max(version_number) from proof_versions where deliverable_id=d.id) and l.revoked_at is null and (l.expires_at is null or l.expires_at>now())",
      [hash(request.params.token), request.params.id],
    )).rows[0]
    if (!file) return void response.status(404).json({ error: 'Current shared file not available.' })
    response.type(file.mime_type).send(await readFile(resolve(root, file.storage_name)))
  })
}
