export type Currency='NGN'|'USD'
export type Expense={id:string;description:string;amount:number;currency:Currency;date:string;category:string;merchant:string;method:string;project:string;notes:string;receiptId?:string}
export type ExpenseData={version:2;expenses:Expense[];categories:string[];projects:string[]}
export type Receipt={id:string;expenseId:string;name:string;type:string;size:number;blob:Blob}
export type ReceiptBackup={id:string;expenseId:string;name:string;type:string;size:number;data:string}
export type SpendBackup={version:2;exportedAt:string;data:ExpenseData;receipts:ReceiptBackup[]}
