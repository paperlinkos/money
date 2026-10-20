import { describe, expect, it } from 'vitest'
import { canAccessTool } from './entitlements'
describe('tool entitlements', () => { it('allows all-access plans', () => expect(canAccessTool('proof', [], 'all_access')).toBe(true)); it('allows active individual grants but rejects expired or inactive grants', () => { expect(canAccessTool('booking',[{toolId:'booking',active:true}])).toBe(true); expect(canAccessTool('booking',[{toolId:'booking',active:false}])).toBe(false); expect(canAccessTool('booking',[{toolId:'booking',active:true,endsAt:'2020-01-01'}])).toBe(false) }) })
