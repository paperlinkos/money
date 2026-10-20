export const toolIds = ['invoice','debts','gear','booking','expenses','proof'] as const
export type ToolId = typeof toolIds[number]
export type ToolStatus = 'Available' | 'In development'
export type Tool = { id: ToolId; slug?: ToolId; name: string; description: string; status: ToolStatus; category: string; href?: string; guestAccess: boolean }
export const tools: Tool[] = [
  { id:'invoice',name:'Invoice & Quotation Maker',description:'Create polished invoices and quotations, calculate totals, and share a professional PDF.',status:'Available',category:'Business essentials',href:'/tools/invoice',guestAccess:true },
  { id:'debts',name:'Customer Debt & Payment Tracker',description:'Track balances, record repayments, and create friendly reminders.',status:'Available',category:'Business essentials',href:'/tools/debts',guestAccess:true },
  { id:'gear',name:'GearList — Equipment & Rentals',description:'Organize equipment, build gig checklists, and prepare rental lists.',status:'Available',category:'Creative work',href:'/tools/gear',guestAccess:true },
  { id:'booking',name:'Appointment & Booking Manager',description:'Manage services, availability, and appointments locally.',status:'Available',category:'Service businesses',href:'/tools/booking',guestAccess:true },
  { id:'expenses',name:'SpendTrack — Expense & Receipt Tracker',description:'Record business spending, projects, and local reports.',status:'Available',category:'Business essentials',href:'/tools/expenses',guestAccess:true },
  { id:'proof',name:'ProofFlow — Client Reviews & Approvals',description:'Create private projects and review links for creative work.',status:'Available',category:'Creative work',href:'/tools/proof',guestAccess:false },
]
