import { Pool } from 'pg'
import { config } from './config.js'
export const db = config.databaseUrl ? new Pool({ connectionString: config.databaseUrl }) : undefined
export function requireDb() { if (!db) throw new Error('DATABASE_URL is required for account-backed booking.'); return db }
