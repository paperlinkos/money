import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'

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
  console.log('ProofFlow API integration passed')
} finally {
  server.kill()
  await rm(uploadDir, { recursive: true, force: true })
}
