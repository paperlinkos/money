import type { ToolId } from '../modules/tools'
export type PlanId = 'free' | 'all_access'
export type Grant = { toolId: ToolId; active: boolean; endsAt?: string }
export const plans = { free: { id:'free' as const, name:'Free', tools: [] as ToolId[] }, all_access: { id:'all_access' as const, name:'All Access', tools: ['invoice','debts','gear','booking','expenses','proof'] as ToolId[] } }
export function canAccessTool(toolId: ToolId, grants: Grant[], plan: PlanId = 'free', now = new Date()) { if (plans[plan].tools.includes(toolId)) return true; return grants.some(g => g.toolId === toolId && g.active && (!g.endsAt || new Date(g.endsAt) > now)) }
