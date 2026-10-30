import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import pg from 'pg'
import sharp from 'sharp'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for this integration test.')

const port = Number(process.env.PROOF_TEST_PORT ?? 3102)
const base = `http://127.0.0.1:${port}`
const uploadDir = `.tmp/proof-api-${process.pid}`
const origin = 'http://localhost:5173'
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLr9wAAAABJRU5ErkJggg=='
const server = spawn('node', ['apps/api/dist/server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), WEB_ORIGIN: origin, PROOF_UPLOAD_DIR: uploadDir },
  stdio: 'ignore',
})

function jar() { return { cookie: '' } }
async function request(path, options = {}, session = undefined) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(session?.cookie ? { Cookie: session.cookie } : {}), ...(options.headers ?? {}) },
  })
  const set = response.headers.get('set-cookie')
  if (set && session) session.cookie = set.split(';')[0]
  const body = response.status === 204 ? null : response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.arrayBuffer()
  return { response, body }
}
async function register(label) {
  const session = jar()
  const id = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const result = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `${id}@test.local`, password: 'safe-password-123', businessName: label, slug: id }) }, session)
  assert.equal(result.response.status, 201)
  assert.match(session.cookie, /^northstar_session=/)
  return session
}
async function project(session, name) {
  const result = await request('/api/proof/projects', { method: 'POST', body: JSON.stringify({ name, clientName: 'Client' }) }, session)
  assert.equal(result.response.status, 201)
  return result.body
}
async function upload(session, projectId, name = 'proof.png') {
  const result = await request(`/api/proof/projects/${projectId}/files`, { method: 'POST', body: JSON.stringify({ name, data: png }) }, session)
  assert.equal(result.response.status, 201)
  return result.body
}
async function reviewLink(session, projectId, expiresAt = undefined) {
  const result = await request(`/api/proof/projects/${projectId}/review-links`, { method: 'POST', body: JSON.stringify(expiresAt ? { expiresAt } : {}) }, session)
  assert.equal(result.response.status, 201)
  return result.body.url.split('/').at(-1)
}

try {
  await new Promise((resolve) => setTimeout(resolve, 500))
  assert.equal((await request('/api/health')).response.status, 200)
  const creator = await register('proof-owner')
  const otherCreator = await register('proof-other')
  const ownedProject = await project(creator, 'Owner project')
  const otherProject = await project(otherCreator, 'Other project')
  const first = await upload(creator, ownedProject.id)
  const otherFile = await upload(otherCreator, otherProject.id, 'other.png')

  assert.equal((await request(`/api/proof/projects/${ownedProject.id}`, {}, otherCreator)).response.status, 404, 'project ownership isolation')
  assert.equal((await request(`/api/proof/files/${first.id}`, {}, otherCreator)).response.status, 404, 'private file isolation')

  const token = await reviewLink(creator, ownedProject.id)
  const publicReview = await request(`/api/public/review/${token}`)
  assert.equal(publicReview.response.status, 200)
  assert.equal(publicReview.body.deliverables.length, 1)
  assert.equal((await request(`/api/public/review/${token}/files/${first.id}`)).response.status, 200)
  assert.equal((await request(`/api/public/review/${token}/files/${otherFile.id}`)).response.status, 404, 'cross-project public file isolation')

  const participant = jar()
  let result = await request(`/api/public/review/${token}/participant`, { method: 'POST', body: JSON.stringify({ name: 'Client One' }) }, participant)
  assert.equal(result.response.status, 200)
  result = await request(`/api/public/review/${token}/comments`, { method: 'POST', body: JSON.stringify({ versionId: first.id, body: 'Please brighten this.' }) }, participant)
  assert.equal(result.response.status, 201)
  result = await request(`/api/public/review/${token}/comments`, { method: 'POST', body: JSON.stringify({ versionId: first.id, body: 'Please brighten this.' }) }, participant)
  assert.equal(result.body.duplicate, true, 'duplicate comments are idempotent')
  assert.equal((await request(`/api/public/review/${token}/favorites/${first.id}`, { method: 'PUT' }, participant)).response.status, 204)
  assert.equal((await request(`/api/public/review/${token}/revisions`, { method: 'POST', body: JSON.stringify({ versionId: first.id, body: 'Please revise the lighting.' }) }, participant)).response.status, 201)

  const participantTwo = jar()
  await request(`/api/public/review/${token}/participant`, { method: 'POST', body: JSON.stringify({ name: 'Client Two' }) }, participantTwo)
  assert.equal((await request(`/api/public/review/${token}/favorites/${first.id}`, { method: 'DELETE' }, participantTwo)).response.status, 204)
  result = await request(`/api/public/review/${token}/feedback`, {}, participant)
  assert.deepEqual(result.body.favorites, [first.id], 'participants cannot remove another participant favorite')

  const replacements = await Promise.all([1, 2].map((number) => request(`/api/proof/deliverables/${first.deliverableId}/versions`, { method: 'POST', body: JSON.stringify({ name: `proof-v${number + 1}.png`, data: png }) }, creator)))
  assert.deepEqual(replacements.map((item) => item.response.status).sort(), [201, 201], 'overlapping replacement uploads succeed')
  const numbers = replacements.map((item) => item.body.versionNumber).sort((a, b) => a - b)
  assert.deepEqual(numbers, [2, 3], 'replacement uploads allocate sequential versions')
  const versionThree = replacements.find((item) => item.body.versionNumber === 3).body.id

  result = await request(`/api/public/review/${token}/approvals`, { method: 'POST', body: JSON.stringify({ versionId: first.id, confirmed: true }) }, participant)
  assert.equal(result.response.status, 409, 'superseded versions cannot be approved')
  result = await request(`/api/public/review/${token}/approvals`, { method: 'POST', body: JSON.stringify({ versionId: versionThree, confirmed: true }) }, participant)
  assert.equal(result.response.status, 201)
  result = await request(`/api/public/review/${token}/approvals`, { method: 'POST', body: JSON.stringify({ versionId: versionThree, confirmed: true }) }, participant)
  assert.equal(result.body.duplicate, true, 'duplicate approval is idempotent')

  const concurrentReplacement = request(`/api/proof/deliverables/${first.deliverableId}/versions`, { method: 'POST', body: JSON.stringify({ name: 'proof-v4.png', data: png }) }, creator)
  const concurrentApproval = request(`/api/public/review/${token}/approvals`, { method: 'POST', body: JSON.stringify({ versionId: versionThree, confirmed: true }) }, participantTwo)
  const concurrent = await Promise.all([concurrentReplacement, concurrentApproval])
  assert.equal(concurrent[0].response.status, 201)
  assert.ok([200, 201, 409].includes(concurrent[1].response.status), 'overlapping approval is serialized with replacement')
  const feedback = await request(`/api/proof/projects/${ownedProject.id}/feedback`, {}, creator)
  assert.equal(feedback.response.status, 200)
  assert.ok(feedback.body.approvals.some((approval) => approval.version_id === versionThree && approval.current === false), 'previous approval history is preserved as superseded')

  const links = await request(`/api/proof/projects/${ownedProject.id}/review-links`, {}, creator)
  assert.equal((await request(`/api/proof/review-links/${links.body[0].id}/revoke`, { method: 'POST' }, creator)).response.status, 204)
  assert.equal((await request(`/api/public/review/${token}`)).response.status, 404, 'revocation blocks review')
  assert.equal((await request(`/api/public/review/${token}/files/${versionThree}`)).response.status, 404, 'revocation blocks files')

  const expired = await reviewLink(creator, ownedProject.id, '2000-01-01T00:00:00.000Z')
  assert.equal((await request(`/api/public/review/${expired}`)).response.status, 404, 'expired token blocked')

  // Protected previews: a public link never gets the original until the creator releases it.
  const studio = await register('ada-studio')
  const gallery = await project(studio, 'Protected gallery')
  assert.equal(gallery.protected_preview, true, 'new galleries start protected')
  const db = new pg.Client({ connectionString: databaseUrl })
  await db.connect()
  const legacy = await db.query("insert into proof_projects(id,owner_id,name,client_name) values(gen_random_uuid(),$1,'Older gallery','Client') returning protected_preview", [gallery.owner_id])
  await db.end()
  assert.equal(legacy.rows[0].protected_preview, false, 'galleries from before this feature stay unprotected')

  const original = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#336699' } }).withExif({ IFD0: { Copyright: 'SECRET-EXIF-MARKER' } }).jpeg({ quality: 95 }).toBuffer()
  const sendFile = (path, name, bytes, mime = 'image/jpeg') => request(path, { method: 'POST', body: JSON.stringify({ name, data: `data:${mime};base64,${bytes.toString('base64')}` }) }, studio)
  const bytesOf = (result) => Buffer.from(result.body)
  const uploaded = await sendFile(`/api/proof/projects/${gallery.id}/files`, 'wedding.jpg', original)
  assert.equal(uploaded.response.status, 201)
  const pdfBytes = Buffer.from('%PDF-1.4\n%protected gallery test\n')
  const pdfUpload = await sendFile(`/api/proof/projects/${gallery.id}/files`, 'brief.pdf', pdfBytes, 'application/pdf')
  assert.equal(pdfUpload.response.status, 201)
  const damaged = await sendFile(`/api/proof/projects/${gallery.id}/files`, 'damaged.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('not really an image')]), 'image/png')
  assert.equal(damaged.response.status, 422, 'an image that cannot be watermarked is refused')

  const galleryToken = await reviewLink(studio, gallery.id)
  const shared = `/api/public/review/${galleryToken}/files/${uploaded.body.id}`
  const listing = await request(`/api/public/review/${galleryToken}`)
  const listed = listing.body.deliverables.find((item) => item.version.id === uploaded.body.id).version
  assert.deepEqual([listed.previewOnly, listed.originalAvailable], [true, false])
  assert.ok(!JSON.stringify(listing.body).includes('storage_name'), 'public listing hides storage names')

  const preview = await request(shared)
  assert.equal(preview.response.status, 200)
  assert.equal(preview.response.headers.get('content-type'), 'image/jpeg')
  const previewBytes = bytesOf(preview)
  assert.ok(!previewBytes.equals(original), 'public file is not the original')
  const details = await sharp(previewBytes).metadata()
  assert.equal(Math.max(details.width, details.height), 1600, 'preview is resized')
  assert.equal(details.exif, undefined, 'preview has no EXIF')
  assert.ok(!previewBytes.includes('SECRET-EXIF-MARKER'), 'preview has no creator metadata')
  assert.ok((await sharp(previewBytes).stats()).channels[0].stdev > 5, 'a plain image gains a visible watermark')

  const originalUrl = `${shared}/original`
  assert.equal((await request(originalUrl)).response.status, 403, 'public link cannot fetch the original before release')
  assert.equal((await request(`/api/proof/files/${uploaded.body.id}`)).response.status, 401, 'creator file route needs sign in')
  assert.equal((await request(`/api/proof/files/${uploaded.body.id}`, {}, otherCreator)).response.status, 404, 'another creator cannot fetch the original')
  assert.ok(bytesOf(await request(`/api/proof/files/${uploaded.body.id}`, {}, studio)).equals(original), 'creator always gets the original')
  assert.ok(bytesOf(await request(`/api/proof/files/${uploaded.body.id}/preview`, {}, studio)).equals(previewBytes), 'creator can see the client preview')
  assert.ok(bytesOf(await request(`/api/public/review/${galleryToken}/files/${pdfUpload.body.id}`)).equals(pdfBytes), 'PDFs are shared unchanged')

  const watermarked = await request(`/api/proof/projects/${gallery.id}/protection`, { method: 'PATCH', body: JSON.stringify({ enabled: true, watermarkText: 'Ada <Proofs> & Co' }) }, studio)
  assert.equal(watermarked.response.status, 204)
  const rewatermarked = bytesOf(await request(shared))
  assert.ok(!rewatermarked.equals(previewBytes), 'editing the watermark remakes the preview')
  assert.ok(!rewatermarked.equals(original))

  assert.equal((await request(`/api/proof/projects/${gallery.id}/release-originals`, { method: 'POST', body: JSON.stringify({ released: true }) }, otherCreator)).response.status, 404, 'only the owner can release')
  assert.equal((await request(originalUrl)).response.status, 403)
  assert.equal((await request(`/api/proof/projects/${gallery.id}/release-originals`, { method: 'POST', body: JSON.stringify({ released: true }) }, studio)).response.status, 200)
  const released = await request(originalUrl)
  assert.equal(released.response.status, 200, 'release opens the original')
  assert.ok(bytesOf(released).equals(original))
  assert.match(released.response.headers.get('content-disposition'), /attachment/)
  assert.ok(!bytesOf(await request(shared)).equals(original), 'the page keeps showing the preview after release')
  assert.equal((await request(`/api/public/review/${galleryToken}`)).body.deliverables.find((item) => item.version.id === uploaded.body.id).version.originalAvailable, true)

  const secondVersion = await sendFile(`/api/proof/deliverables/${uploaded.body.deliverableId}/versions`, 'wedding-v2.jpg', original)
  assert.equal(secondVersion.response.status, 201)
  assert.equal(secondVersion.body.versionNumber, 2)
  assert.equal((await request(originalUrl)).response.status, 404, 'superseded versions stay private')
  assert.equal((await request(`/api/public/review/${galleryToken}/files/${secondVersion.body.id}/original`)).response.status, 403, 'images uploaded after a release stay protected')
  assert.equal((await request(`/api/proof/files/${uploaded.body.id}`, {}, studio)).response.status, 200, 'version history still opens for the creator')
  const history = (await request(`/api/proof/projects/${gallery.id}`, {}, studio)).body.deliverables.find((item) => item.id === uploaded.body.deliverableId)
  assert.deepEqual(history.versions.map((version) => version.number), [2, 1])

  const secondShared = `/api/public/review/${galleryToken}/files/${secondVersion.body.id}`
  await request(`/api/proof/projects/${gallery.id}/release-originals`, { method: 'POST', body: JSON.stringify({ released: true }) }, studio)
  assert.equal((await request(`${secondShared}/original`)).response.status, 200)
  await request(`/api/proof/projects/${gallery.id}/release-originals`, { method: 'POST', body: JSON.stringify({ released: false }) }, studio)
  assert.equal((await request(`${secondShared}/original`)).response.status, 403, 'taking back a release closes the original again')

  await request(`/api/proof/projects/${gallery.id}/protection`, { method: 'PATCH', body: JSON.stringify({ enabled: false }) }, studio)
  assert.ok(bytesOf(await request(secondShared)).equals(original), 'turning protection off shares the original')
  await request(`/api/proof/projects/${gallery.id}/protection`, { method: 'PATCH', body: JSON.stringify({ enabled: true }) }, studio)
  assert.ok(!bytesOf(await request(secondShared)).equals(original), 'turning protection on protects existing images')
  assert.equal((await request(`${secondShared}/original`)).response.status, 403)

  console.log('ProofFlow API integration passed')
} finally {
  server.kill()
  await rm(uploadDir, { recursive: true, force: true })
}
