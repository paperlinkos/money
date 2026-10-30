import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Express, Request, Response } from 'express'
import { requireDb } from '../../core/db.js'
import { renderPreview, watermarkSql } from './preview.js'

const root = resolve(process.cwd(), process.env.PROOF_UPLOAD_DIR ?? 'private-uploads/proof')
const limit = 5 * 1024 * 1024
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const session = (request: Request) => request.header('cookie')?.match(/(?:^|; )northstar_session=([^;]+)/)?.[1]

function fileType(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg'
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

const isImage = (mime: string) => mime.startsWith('image/')

async function storedPreview(file: { bytes: Buffer; mime: string }, project: { protected_preview: boolean; watermark: string }) {
  if (!project.protected_preview || !isImage(file.mime)) return { name: null, text: null }
  return { name: await storeBytes(await renderPreview(file.bytes, project.watermark), 'image/jpeg'), text: project.watermark }
}

const unreadableImage = 'We could not make a protected preview of this image. Try exporting it again as a JPEG.'

type PreviewFile = { id: string; storage_name: string; preview_storage_name: string | null; preview_watermark: string | null; watermark: string }
const generating = new Map<string, Promise<Buffer>>()

// Previews are made on upload, and remade here when protection is turned on later or the watermark text changes.
function previewFor(file: PreviewFile) {
  if (file.preview_storage_name && file.preview_watermark === file.watermark) return readFile(resolve(root, file.preview_storage_name))
  const key = `${file.id}:${file.watermark}`
  const running = generating.get(key)
  if (running) return running
  const job = (async () => {
    const bytes = await renderPreview(await readFile(resolve(root, file.storage_name)), file.watermark)
    const name = await storeBytes(bytes, 'image/jpeg')
    await requireDb().query('update proof_versions set preview_storage_name=$1,preview_watermark=$2 where id=$3', [name, file.watermark, file.id])
    if (file.preview_storage_name) await unlink(resolve(root, file.preview_storage_name)).catch(() => undefined)
    return bytes
  })().finally(() => generating.delete(key))
  generating.set(key, job)
  return job
}

// Makes the current previews ready ahead of the client's first visit. A failure here is retried on that visit.
export async function warmPreviews(projectId: string) {
  const files = (await requireDb().query(
    `select v.id,v.storage_name,v.preview_storage_name,v.preview_watermark,${watermarkSql} watermark from proof_projects p left join booking_businesses b on b.user_id=p.owner_id join proof_deliverables d on d.project_id=p.id join proof_versions v on v.deliverable_id=d.id where p.id=$1 and p.protected_preview and v.mime_type like 'image/%' and v.version_number=(select max(version_number) from proof_versions where deliverable_id=d.id)`,
    [projectId],
  )).rows as PreviewFile[]
  for (const file of files) await previewFor(file)
}

async function sharedFile(token: string, versionId: string) {
  return (await requireDb().query(
    `select v.*,p.protected_preview,${watermarkSql} watermark,(p.originals_released_at is not null and v.created_at<=p.originals_released_at) original_released from proof_review_links l join proof_projects p on p.id=l.project_id left join booking_businesses b on b.user_id=p.owner_id join proof_deliverables d on d.project_id=l.project_id join proof_versions v on v.deliverable_id=d.id where l.token_hash=$1 and v.id=$2 and v.version_number=(select max(version_number) from proof_versions where deliverable_id=d.id) and l.revoked_at is null and (l.expires_at is null or l.expires_at>now())`,
    [hash(token), versionId],
  )).rows[0]
}

export function proofFileRoutes(app: Express) {
  app.post('/api/proof/projects/:id/files', auth(async (request, response, userId) => {
    let file: ReturnType<typeof incomingFile>
    try { file = incomingFile(request) } catch (error) { return void response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid upload.' }) }
    const project = (await requireDb().query(`select p.id,p.protected_preview,${watermarkSql} watermark from proof_projects p left join booking_businesses b on b.user_id=p.owner_id where p.id=$1 and p.owner_id=$2`, [request.params.id, userId])).rows[0]
    if (!project) return void response.status(404).json({ error: 'Project not found.' })

    let preview: Awaited<ReturnType<typeof storedPreview>>
    try { preview = await storedPreview(file, project) } catch (error) {
      console.error('ProofFlow preview failed', error)
      return void response.status(422).json({ error: unreadableImage })
    }
    const storageName = await storeBytes(file.bytes, file.mime)
    const deliverableId = randomUUID()
    const versionId = randomUUID()
    const client = await requireDb().connect()
    try {
      await client.query('begin')
      await client.query('insert into proof_deliverables(id,project_id,name) values($1,$2,$3)', [deliverableId, project.id, file.name])
      await client.query('insert into proof_versions(id,deliverable_id,version_number,original_name,storage_name,mime_type,size_bytes,preview_storage_name,preview_watermark) values($1,$2,1,$3,$4,$5,$6,$7,$8)', [versionId, deliverableId, file.name, storageName, file.mime, file.bytes.length, preview.name, preview.text])
      await client.query('commit')
      response.status(201).json({ id: versionId, deliverableId, versionNumber: 1, name: file.name, mime: file.mime, size: file.bytes.length })
    } catch (error) {
      await client.query('rollback')
      await unlink(resolve(root, storageName)).catch(() => undefined)
      if (preview.name) await unlink(resolve(root, preview.name)).catch(() => undefined)
      throw error
    } finally { client.release() }
  }))

  app.post('/api/proof/deliverables/:id/versions', auth(async (request, response, userId) => {
    let file: ReturnType<typeof incomingFile>
    try { file = incomingFile(request) } catch (error) { return void response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid upload.' }) }
    const project = (await requireDb().query(`select p.protected_preview,${watermarkSql} watermark from proof_deliverables d join proof_projects p on p.id=d.project_id left join booking_businesses b on b.user_id=p.owner_id where d.id=$1 and p.owner_id=$2`, [request.params.id, userId])).rows[0]
    if (!project) return void response.status(404).json({ error: 'Deliverable not found.' })
    let preview: Awaited<ReturnType<typeof storedPreview>>
    try { preview = await storedPreview(file, project) } catch (error) {
      console.error('ProofFlow preview failed', error)
      return void response.status(422).json({ error: unreadableImage })
    }
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
        if (preview.name) await unlink(resolve(root, preview.name)).catch(() => undefined)
        return void response.status(404).json({ error: 'Deliverable not found.' })
      }
      const next = (await client.query('select coalesce(max(version_number),0)+1 as number from proof_versions where deliverable_id=$1', [deliverable.id])).rows[0].number
      await client.query('insert into proof_versions(id,deliverable_id,version_number,original_name,storage_name,mime_type,size_bytes,preview_storage_name,preview_watermark) values($1,$2,$3,$4,$5,$6,$7,$8,$9)', [versionId, deliverable.id, next, file.name, storageName, file.mime, file.bytes.length, preview.name, preview.text])
      await client.query('commit')
      response.status(201).json({ id: versionId, deliverableId: deliverable.id, versionNumber: Number(next), name: file.name, mime: file.mime, size: file.bytes.length })
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      await unlink(resolve(root, storageName)).catch(() => undefined)
      if (preview.name) await unlink(resolve(root, preview.name)).catch(() => undefined)
      throw error
    } finally { client.release() }
  }))

  app.get('/api/proof/files/:id', auth(async (request, response, userId) => {
    const file = (await requireDb().query('select v.* from proof_versions v join proof_deliverables d on d.id=v.deliverable_id join proof_projects p on p.id=d.project_id where v.id=$1 and p.owner_id=$2', [request.params.id, userId])).rows[0]
    if (!file) return void response.status(404).json({ error: 'File not found.' })
    response.type(file.mime_type).send(await readFile(resolve(root, file.storage_name)))
  }))

  app.get('/api/proof/files/:id/preview', auth(async (request, response, userId) => {
    const file = (await requireDb().query(`select v.*,${watermarkSql} watermark from proof_versions v join proof_deliverables d on d.id=v.deliverable_id join proof_projects p on p.id=d.project_id left join booking_businesses b on b.user_id=p.owner_id where v.id=$1 and p.owner_id=$2 and p.protected_preview and v.mime_type like 'image/%'`, [request.params.id, userId])).rows[0]
    if (!file) return void response.status(404).json({ error: 'No protected preview for this file.' })
    response.set('Cache-Control', 'private, no-cache').type('image/jpeg').send(await previewFor(file))
  }))

  app.post('/api/proof/review-links/:id/revoke', auth(async (request, response, userId) => {
    const result = await requireDb().query('update proof_review_links l set revoked_at=now() from proof_projects p where l.id=$1 and l.project_id=p.id and p.owner_id=$2 and l.revoked_at is null returning l.id', [request.params.id, userId])
    if (!result.rowCount) return void response.status(404).json({ error: 'Active review link not found.' })
    response.sendStatus(204)
  }))

  // The URL stays the same when protection or the watermark changes, so browsers must check before reusing a copy.
  app.get('/api/public/review/:token/files/:id', async (request, response) => {
    const file = await sharedFile(String(request.params.token), String(request.params.id))
    if (!file) return void response.status(404).json({ error: 'Current shared file not available.' })
    response.set('Cache-Control', 'private, no-cache')
    if (!file.protected_preview || !isImage(file.mime_type)) return void response.type(file.mime_type).send(await readFile(resolve(root, file.storage_name)))
    try {
      response.type('image/jpeg').send(await previewFor(file))
    } catch (error) {
      console.error('ProofFlow preview failed', error)
      response.status(503).json({ error: 'This preview is not ready yet.' })
    }
  })

  app.get('/api/public/review/:token/files/:id/original', async (request, response) => {
    const file = await sharedFile(String(request.params.token), String(request.params.id))
    if (!file) return void response.status(404).json({ error: 'Current shared file not available.' })
    if (file.protected_preview && isImage(file.mime_type) && !file.original_released) return void response.status(403).json({ error: 'The creator has not released this original yet.' })
    response.set('Cache-Control', 'private, no-store').attachment(file.original_name).type(file.mime_type).send(await readFile(resolve(root, file.storage_name)))
  })
}
