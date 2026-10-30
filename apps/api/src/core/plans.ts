import { requireDb } from './db.js'

export type PlanId = 'free' | 'pro' | 'studio'

const gigabyte = 1024 ** 3
// Prices are in kobo. Paystack plan codes come from the dashboard and are configured per environment.
export const plans = {
  free: { id: 'free' as const, name: 'Free', amountKobo: 0, galleries: 1, storageBytes: gigabyte },
  pro: { id: 'pro' as const, name: 'Pro', amountKobo: 500_000, galleries: 15, storageBytes: 20 * gigabyte },
  studio: { id: 'studio' as const, name: 'Studio', amountKobo: 1_200_000, galleries: Number.POSITIVE_INFINITY, storageBytes: 50 * gigabyte },
}
export const galleryPassKobo = 250_000
const galleryPassStorageBytes = 3 * gigabyte
// A failed renewal keeps paid features for a short grace period before falling back to Free.
const graceDays = 3

export type AccountPlan = { plan: PlanId; status: string | null; currentPeriodEnd: string | null; galleryCredits: number; galleryAllowance: number; storageUsedBytes: number; storageLimitBytes: number }

// Version history and client approvals. A gallery pass adds galleries but does not unlock these.
export const hasPaidFeatures = async (userId: string) => (await accountPlan(userId)).plan !== 'free'

export async function accountPlan(userId: string): Promise<AccountPlan> {
  const row = (await requireDb().query(
    `select s.plan, s.status, s.current_period_end, coalesce(c.gallery_credits, 0) gallery_credits,
       (s.status in ('active','non_renewing','past_due') and s.current_period_end + make_interval(days => $2) > now()) paid,
       (select count(*) from proof_projects p where p.owner_id = u.id and p.uses_gallery_pass and p.archived_at is null) active_passes,
       (select count(*) from proof_projects p where p.owner_id = u.id and p.uses_gallery_pass) used_passes,
       (select coalesce(sum(v.size_bytes), 0) from proof_versions v join proof_deliverables d on d.id = v.deliverable_id join proof_projects p on p.id = d.project_id where p.owner_id = u.id) storage_used
     from platform_users u
     left join billing_subscriptions s on s.user_id = u.id
     left join billing_credits c on c.user_id = u.id
     where u.id = $1`,
    [userId, graceDays],
  )).rows[0]
  const plan: PlanId = row?.paid ? row.plan : 'free'
  const galleryCredits = Number(row?.gallery_credits ?? 0)
  return {
    plan,
    status: row?.status ?? null,
    currentPeriodEnd: row?.current_period_end ? new Date(row.current_period_end).toISOString() : null,
    galleryCredits,
    // A pass covers one project: spent on creation and not returned when that project is archived.
    galleryAllowance: plans[plan].galleries + galleryCredits + Number(row?.active_passes ?? 0),
    storageUsedBytes: Number(row?.storage_used ?? 0),
    storageLimitBytes: plans[plan].storageBytes + (galleryCredits + Number(row?.used_passes ?? 0)) * galleryPassStorageBytes,
  }
}
