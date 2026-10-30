import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from 'pg'

process.loadEnvFile('.env')

const sourceUrl = process.env.DATABASE_URL
if (!sourceUrl) throw new Error('DATABASE_URL must be set in .env to run account browser tests.')

const suffix = `${process.pid}_${Date.now().toString(36)}`
const databaseName = `paperlinkos_e2e_${suffix}`
const testUrl = new URL(sourceUrl)
testUrl.pathname = `/${databaseName}`
const adminUrl = new URL(sourceUrl)
adminUrl.pathname = '/postgres'
const uploadDirectory = await mkdtemp(join(tmpdir(), `paperlinkos-proof-e2e-${suffix}-`))
const apiPort = '3102'
const webPort = '4174'
let admin
let api

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)))
  })
}

async function waitForApi() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/health`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('Dedicated E2E API did not start.')
}

try {
  await run('npm', ['run', 'build', '--workspace=@platform/api'])
  admin = new Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  await admin.query(`create database "${databaseName}"`)
  const testDb = new Client({ connectionString: testUrl.toString() })
  await testDb.connect()
  for (const path of [
    'apps/api/src/modules/booking/db/001_booking.sql',
    'apps/api/src/modules/booking/db/002_booking_scheduling.sql',
    'apps/api/src/modules/booking/db/003_notifications.sql',
    'apps/api/src/modules/proof/db/001_proof.sql',
    'apps/api/src/modules/proof/db/002_feedback.sql',
    'apps/api/src/modules/proof/db/003_versioning.sql',
    'apps/api/src/modules/billing/db/001_billing.sql',
  ]) await testDb.query(await readFile(path, 'utf8'))
  await testDb.end()

  const environment = {
    ...process.env,
    DATABASE_URL: testUrl.toString(),
    PORT: apiPort,
    WEB_ORIGIN: `http://127.0.0.1:${webPort}`,
    PROOF_UPLOAD_DIR: uploadDirectory,
    E2E_DEDICATED: 'true',
    E2E_WEB_PORT: webPort,
    E2E_WEB_ORIGIN: `http://127.0.0.1:${webPort}`,
    VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
  }
  api = spawn('node', ['apps/api/dist/server.js'], { cwd: process.cwd(), env: environment, stdio: 'inherit' })
  await waitForApi()
  await run('node', ['node_modules/@playwright/test/cli.js', 'test', '--config=apps/web/playwright.config.ts', 'apps/web/e2e/account-workflows.spec.ts'], environment)
} finally {
  api?.kill()
  await rm(uploadDirectory, { recursive: true, force: true })
  if (admin) {
    await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid <> pg_backend_pid()', [databaseName]).catch(() => undefined)
    await admin.query(`drop database if exists "${databaseName}"`).catch(() => undefined)
    await admin.end()
  }
}
