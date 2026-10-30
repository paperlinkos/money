import { requireDb } from './db.js'

export type PlanId = 'free' | 'pro' | 'studio'

// Prices are in kobo. Paystack plan codes come from the dashboard and are configured per environment.
export const plans = {
  free: { id: 'free' as const, name: 'Free', amountKobo: 0, galleries: 1 },
  pro: { id: 'pro' as const, name: 'Pro', amountKobo: 500_000, galleries: 15 },
  studio: { id: 'studio' as const, name: 'Studio', amountKobo: 1_200_000, galleries: Number.POSITIVE_INFINITY },
}
export const galleryPassKobo = 250_000
// A failed renewal keeps paid features for a short grace period before falling back to Free.
const graceDays = 3

export type AccountPlan = { plan: PlanId; status: string | null; currentPeriodEnd: string | null; galleryCredits: number; galleryAllowance: number }

export async function accountPlan(userId: string): Promise<AccountPlan> {
  const row = (await requireDb().query(
    `select s.plan, s.status, s.current_period_end, coalesce(c.gallery_credits, 0) gallery_credits,
       (s.status in ('active','non_renewing','past_due') and s.current_period_end + make_interval(days => $2) > now()) paid
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
    galleryAllowance: plans[plan].galleries + galleryCredits,
  }
}
