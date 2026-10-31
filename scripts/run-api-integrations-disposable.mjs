import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { Client } from 'pg'

process.loadEnvFile('.env')
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set in .env.')

const name = `paperlinkos_api_test_${process.pid}_${Date.now().toString(36)}`
const testUrl = new URL(process.env.DATABASE_URL)
testUrl.pathname = `/${name}`
const adminUrl = new URL(process.env.DATABASE_URL)
adminUrl.pathname = '/postgres'
const admin = new Client({ connectionString: adminUrl.toString() })

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)))
  })
}

try {
  await run('npm', ['run', 'build', '--workspace=@platform/api'])
  await admin.connect()
  await admin.query(`create database "${name}"`)
  const db = new Client({ connectionString: testUrl.toString() })
  await db.connect()
  for (const migration of [
    'apps/api/src/modules/booking/db/001_booking.sql',
    'apps/api/src/modules/booking/db/002_booking_scheduling.sql',
    'apps/api/src/modules/booking/db/003_notifications.sql',
    'apps/api/src/modules/proof/db/001_proof.sql',
    'apps/api/src/modules/proof/db/002_feedback.sql',
    'apps/api/src/modules/proof/db/003_versioning.sql',
    'apps/api/src/modules/proof/db/004_protected_preview.sql',
    'apps/api/src/modules/billing/db/001_billing.sql',
    'apps/api/src/modules/billing/db/002_gallery_pass.sql',
    'apps/api/src/modules/support/db/001_support.sql',
  ]) await db.query(await readFile(migration, 'utf8'))
  await db.end()
  const testEnvironment = { ...process.env, DATABASE_URL: testUrl.toString() }
  await run('node', ['scripts/booking-api-integration.mjs'], testEnvironment)
  await run('node', ['scripts/proof-api-integration.mjs'], testEnvironment)
  await run('node', ['scripts/billing-api-integration.mjs'], testEnvironment)
} finally {
  await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid <> pg_backend_pid()', [name]).catch(() => undefined)
  await admin.query(`drop database if exists "${name}"`).catch(() => undefined)
  await admin.end()
}
