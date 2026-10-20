import type{Currency,Expense}from'./types'
export const total=(items:Expense[],currency:Currency)=>items.filter(x=>x.currency===currency).reduce((s,x)=>s+x.amount,0)
export const filtered=(items:Expense[],q:string,c:string,p:string,currency:string)=>items.filter(x=>(!q||`${x.description} ${x.merchant}`.toLowerCase().includes(q.toLowerCase()))&&(!c||x.category===c)&&(!p||x.project===p)&&(!currency||x.currency===currency))
export const sorted=(items:Expense[],by:'date'|'amount',direction:'asc'|'desc')=>[...items].sort((a,b)=>{const v=by==='date'?a.date.localeCompare(b.date):a.amount-b.amount;return direction==='asc'?v:-v})
export const summary=(items:Expense[])=>({NGN:total(items,'NGN'),USD:total(items,'USD')})
