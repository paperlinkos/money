export type ReviewLinkState = 'Active' | 'Expired' | 'Revoked'
export function reviewLinkState(link:{expires_at:string|null;revoked_at:string|null}, now=new Date()):ReviewLinkState { if(link.revoked_at)return 'Revoked';return link.expires_at&&new Date(link.expires_at)<=now?'Expired':'Active' }
