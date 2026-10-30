export const toolIds = ['invoice','debts','gear','booking','expenses','proof'] as const
export type ToolId = typeof toolIds[number]
export type ToolStatus = 'Available' | 'In development'
export type Tool = { id: ToolId; slug?: ToolId; name: string; short: string; description: string; status: ToolStatus; category: string; href?: string; guestAccess: boolean }
export const tools: Tool[] = [
  { id:'booking',name:'Booking link',short:'Booking',description:'One link for your Instagram bio. Clients see your packages and real availability, then request a slot.',status:'Available',category:'Get booked',href:'/tools/booking/account',guestAccess:false },
  { id:'proof',name:'Client galleries',short:'Galleries',description:'Share work privately. Clients pick favourites, comment, request changes and approve the final version.',status:'Available',category:'Deliver',href:'/tools/proof',guestAccess:false },
  { id:'invoice',name:'Invoices & quotations',short:'Invoices',description:'Send a clean quotation before the shoot and a PDF invoice after, from your phone.',status:'Available',category:'Get paid',href:'/tools/invoice',guestAccess:true },
  { id:'debts',name:'Payment tracker',short:'Payments',description:'See who still owes you, record part-payments and send polite WhatsApp reminders.',status:'Available',category:'Get paid',href:'/tools/debts',guestAccess:true },
  { id:'gear',name:'Gear checklists',short:'Gear',description:'Pack for every shoot with a checklist, track what came back and prepare rental lists.',status:'Available',category:'Shoot',href:'/tools/gear',guestAccess:true },
  { id:'expenses',name:'Expense tracker',short:'Expenses',description:'Log transport, rentals and assistants per project, with receipts, so you know what each job earned.',status:'Available',category:'Get paid',href:'/tools/expenses',guestAccess:true },
]
