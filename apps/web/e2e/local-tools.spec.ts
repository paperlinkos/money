import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z', 'base64')
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n')

test('Invoice Maker creates, saves, reloads, and exports an invoice', async ({ page }) => {
  await page.goto('/tools/invoice')
  await page.getByRole('button', { name: 'Business details' }).click()
  await page.getByLabel('Business name *').fill('Browser Test Studio')
  await page.getByRole('button', { name: 'Save details' }).click()
  await page.getByLabel('Customer name *').fill('Ada Client')
  await page.getByLabel('Description *').first().fill('Design work')
  await page.getByLabel('Price').fill('10000')
  await page.getByLabel('Tax rate (%)').fill('7.5')
  await expect(page.getByText('₦10,750.00').first()).toBeVisible()
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Draft saved on this device.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Ada Client')).toBeVisible()
  await page.getByRole('button', { name: 'Edit' }).last().click()
  if (await page.evaluate(() => window.innerWidth < 1024)) await page.getByRole('button', { name: 'Preview' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF' }).click()
  const file = await download
  expect((await file.createReadStream()) !== null).toBeTruthy()
  expect((await file.suggestedFilename()).endsWith('.pdf')).toBeTruthy()
  const pdfText = (await readFile((await file.path())!)).toString('latin1')
  expect(pdfText).toContain('Ada Client')
  expect(pdfText).toContain('Design work')
  expect(pdfText.replaceAll('\0', '')).toContain('10,750.00')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined })
  })
  const sharedFallback = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Share document' }).click()
  expect((await sharedFallback).suggestedFilename()).toContain('.pdf')
  await page.reload()
  await expect(page.getByText('Ada Client')).toBeVisible()
})

test('Invoice Maker exports a readable multi-page PDF without changing its draft', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'PDF pagination is checked once at a desktop print layout.')
  const items = Array.from({ length: 48 }, (_, index) => ({
    id: `long-line-${index}`,
    description: `Long PDF line item ${index + 1}`,
    quantity: 1,
    price: 1000,
    discount: 0,
  }))
  const document = {
    id: 'long-pdf-draft', type: 'invoice', number: 'INV-2026-9001',
    issueDate: '2026-10-20', dueDate: '2026-11-20', currency: 'NGN', taxRate: 7.5,
    business: { name: 'PDF Test Studio', email: 'studio@example.test', phone: '08000000000', address: 'Lagos', bank: 'Test Bank' },
    customer: { name: 'Long PDF Customer', email: 'client@example.test', phone: '08000000001', address: 'Abuja' },
    notes: 'Long-document acceptance test.', items, updatedAt: '2026-10-20T12:00:00.000Z',
  }
  await page.addInitScript((saved) => localStorage.setItem('northstar.invoice.documents.v2', JSON.stringify([saved])), document)
  await page.goto('/tools/invoice')
  await page.getByRole('button', { name: 'Edit' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF' }).click()
  const exported = await download
  const pdfText = (await readFile((await exported.path())!)).toString('latin1').replaceAll('\0', '')
  expect((pdfText.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1)
  expect(pdfText).toContain('PDF Test Studio')
  expect(pdfText).toContain('Long PDF Customer')
  expect(pdfText).toContain('Long PDF line item 1')
  expect(pdfText).toContain('Long PDF line item 48')
  expect(pdfText).toContain('51,600.00')
  await page.reload()
  await expect(page.getByText('Long PDF Customer')).toBeVisible()
})

test('Debt Tracker records repayments, prevents overpayment, and persists', async ({ page }) => {
  await page.goto('/tools/debts')
  await page.getByLabel('Customer name *').fill('Debt Test Customer')
  await page.getByLabel('Description *').fill('Event deposit')
  await page.getByLabel('Original amount *').fill('10000')
  await page.getByRole('button', { name: 'Save debt' }).click()
  await expect(page.getByText('Debt recorded.')).toBeVisible()
  await page.getByRole('button', { name: 'Record payment' }).click()
  await page.getByLabel('Amount (NGN)').fill('4000')
  await page.getByRole('button', { name: 'Save payment' }).click()
  await expect(page.getByText('Payment recorded and balance updated.')).toBeVisible()
  await page.getByRole('button', { name: 'Record payment' }).click()
  await page.getByLabel('Amount (NGN)').fill('7000')
  await page.getByRole('button', { name: 'Save payment' }).click()
  await expect(page.getByText(/Payment cannot exceed/)).toBeVisible()
  await page.getByLabel('Amount (NGN)').fill('6000')
  await page.getByRole('button', { name: 'Save payment' }).click()
  await expect(page.locator('article').filter({ hasText: 'Event deposit' }).getByText('Fully paid')).toBeVisible()
  await page.getByLabel('Customer').last().selectOption({ label: 'Debt Test Customer' })
  await expect(page.getByText('Payment history')).toBeVisible()
  await expect(page.locator('section').filter({ hasText: 'Payment history' }).getByText('+₦4,000.00')).toBeVisible()
  const csv = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  const csvPath = await (await csv).path()
  expect((await readFile(csvPath!, 'utf8'))).toContain('"Debt Test Customer","Event deposit","NGN","10000.00","10000.00","0.00","paid"')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Debt Test Customer' })).toBeVisible()
})

test('Debt Tracker filters overdue balances and copies an accurate reminder', async ({ page }) => {
  await page.goto('/tools/debts')
  await page.getByLabel('Customer name *').fill('Overdue Reminder Customer')
  await page.getByLabel('Description *').fill('Past-due deposit')
  await page.getByLabel('Original amount *').fill('12500')
  await page.getByLabel('Date recorded').fill('2020-01-01')
  await page.getByLabel('Due date (optional)').fill('2020-01-02')
  await page.getByRole('button', { name: 'Save debt' }).click()
  await page.getByLabel('Customer name *').fill('Future Due Customer')
  await page.getByLabel('Description *').fill('Future deposit')
  await page.getByLabel('Original amount *').fill('8000')
  await page.getByLabel('Date recorded').fill('2020-01-01')
  await page.getByLabel('Due date (optional)').fill('2099-01-01')
  await page.getByRole('button', { name: 'Save debt' }).click()
  await page.getByLabel('Overdue only').check()
  await expect(page.getByText('Past-due deposit')).toBeVisible()
  await expect(page.getByText('Future deposit')).not.toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { (window as Window & { copiedReminder?: string }).copiedReminder = text } },
    })
  })
  const overdue = page.locator('article').filter({ hasText: 'Past-due deposit' })
  await overdue.getByRole('button', { name: 'Copy reminder' }).click()
  await expect(page.getByText('Reminder copied.')).toBeVisible()
  const reminder = await page.evaluate(() => (window as Window & { copiedReminder?: string }).copiedReminder)
  expect(reminder).toContain('Overdue Reminder Customer')
  expect(reminder).toContain('₦12,500.00')
  expect(reminder).toContain('Past-due deposit')
})

test('GearList persists an equipment photo and checklist without exposing private gear in its rental export', async ({ page }) => {
  await page.goto('/tools/gear')
  await page.getByRole('button', { name: 'My gear' }).click()
  await page.getByLabel('Equipment name *').fill('Private Test Recorder')
  await page.locator('input[accept="image/*"]').setInputFiles({ name: 'gear.jpg', mimeType: 'image/jpeg', buffer: jpeg })
  await page.getByRole('button', { name: 'Save equipment' }).click()
  await expect(page.getByText('Private Test Recorder')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'My gear' }).click()
  await expect(page.getByText('Private Test Recorder')).toBeVisible()
  await page.getByRole('button', { name: 'Start a checklist' }).click()
  await page.getByLabel('Event name *').fill('Browser Test Gig')
  await page.getByRole('button', { name: '+ Microphone' }).click()
  await page.getByRole('button', { name: 'Save checklist' }).click()
  await page.getByRole('button', { name: 'My checklists' }).click()
  await expect(page.getByText('Browser Test Gig')).toBeVisible()
  await page.getByLabel('Packed: Microphone').check()
  await page.getByLabel('Returned: Microphone').check()
  await page.locator('article').filter({ hasText: 'Browser Test Gig' }).getByRole('button', { name: 'Duplicate' }).click()
  await expect(page.getByText('Browser Test Gig copy')).toBeVisible()
  const duplicateChecklist = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Browser Test Gig copy', exact: true }) })
  await duplicateChecklist.getByLabel('Checklist item: Microphone').fill('Spare Microphone')
  await duplicateChecklist.getByLabel('Packed: Spare Microphone').check()
  await duplicateChecklist.getByLabel('Returned: Spare Microphone').check()
  await page.reload()
  await page.getByRole('button', { name: 'My checklists' }).click()
  const originalChecklist = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Browser Test Gig', exact: true }) })
  await expect(originalChecklist.getByLabel('Packed: Microphone')).toBeChecked()
  await expect(originalChecklist.getByLabel('Returned: Microphone')).toBeChecked()
  await expect(originalChecklist.getByLabel('Checklist item: Microphone')).toHaveValue('Microphone')
  const restoredCopy = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Browser Test Gig copy', exact: true }) })
  await expect(restoredCopy.getByLabel('Checklist item: Spare Microphone')).toHaveValue('Spare Microphone')
  await expect(restoredCopy.getByLabel('Packed: Spare Microphone')).toBeChecked()
  await expect(restoredCopy.getByLabel('Returned: Spare Microphone')).toBeChecked()
  await page.getByRole('button', { name: 'Rentals & sharing' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download shareable rental list' }).click()
  const exported = await download
  const exportedPath = await exported.path()
  expect(exportedPath).not.toBeNull()
  const exportedText = await readFile(exportedPath!, 'utf8')
  expect(exportedText).not.toContain('Private Test Recorder')
  expect(exportedText).toContain('Sony A7 III Camera')
  expect(exportedText).toContain('₦25,000.00/day')
  expect(exportedText).not.toContain('A7-001')
  expect(exportedText).not.toContain('Main camera case')
  await page.setContent(exportedText)
  await expect(page.getByRole('heading', { name: 'Sony A7 III Camera' })).toBeVisible()
})

test('SpendTrack stores receipts in IndexedDB and keeps currencies separate', async ({ page }) => {
  await page.goto('/tools/expenses')
  await page.getByRole('button', { name: 'Expenses' }).click()
  await page.getByLabel('Description *').fill('Browser Test Fuel')
  await page.getByLabel('Amount *').fill('5000')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByText('Expense saved.')).toBeVisible()
  await page.getByRole('button', { name: 'Receipts' }).click()
  await page.getByRole('button', { name: 'Upload' }).click()
  await page.locator('input[accept="image/jpeg,image/png,image/webp,application/pdf"]').setInputFiles({ name: 'receipt.pdf', mimeType: 'application/pdf', buffer: pdf })
  await expect(page.getByText('Receipt attached.')).toBeVisible()
  const receiptDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download' }).click()
  const receiptPath = await (await receiptDownload).path()
  expect((await readFile(receiptPath!)).toString()).toContain('%PDF-1.4')
  await page.getByRole('button', { name: 'Replace' }).click()
  await page.locator('input[accept="image/jpeg,image/png,image/webp,application/pdf"]').setInputFiles({ name: 'receipt.jpg', mimeType: 'image/jpeg', buffer: jpeg })
  await expect(page.getByText('Receipt attached.')).toBeVisible()
  const previewPage = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Preview' }).click()
  expect((await previewPage).url()).toMatch(/^blob:/)
  await page.getByRole('button', { name: 'Expenses' }).click()
  const currencySelects = page.locator('form select')
  await currencySelects.first().selectOption('USD')
  await page.getByLabel('Description *').fill('Browser Test USD Hosting')
  await page.getByLabel('Amount *').fill('25')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await page.getByRole('button', { name: 'Reports' }).click()
  const csvDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  const csvText = await readFile((await (await csvDownload).path())!, 'utf8')
  expect(csvText).toContain('Browser Test Fuel')
  expect(csvText).toContain('"5000","NGN"')
  expect(csvText).toContain('Browser Test USD Hosting')
  expect(csvText).toContain('"25","USD"')
  await page.getByRole('button', { name: 'Settings' }).click()
  const backup = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download complete backup' }).click()
  const backupPath = await (await backup).path()
  const backupJson = JSON.parse(await readFile(backupPath!, 'utf8'))
  expect(backupJson.receipts).toHaveLength(1)
  expect(backupJson.receipts[0].type).toBe('image/jpeg')
  await page.getByRole('button', { name: 'Receipts' }).click()
  await page.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('Receipt removed.')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Receipts' }).click()
  await expect(page.locator('article').filter({ hasText: 'Browser Test Fuel' }).getByText('No receipt')).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('input[accept="application/json"]').setInputFiles(backupPath!)
  await expect(page.getByText('Backup restored.')).toBeVisible()
  await page.getByRole('button', { name: 'Receipts' }).click()
  await expect(page.getByText('Attached')).toBeVisible()
  await page.getByRole('button', { name: 'Expenses' }).click()
  await expect(page.getByText('Browser Test Fuel')).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.locator('input[accept="application/json"]').setInputFiles({
    name: 'invalid-backup.json', mimeType: 'application/json', buffer: Buffer.from('{"invalid":true}'),
  })
  await expect(page.getByText('Invalid SpendTrack backup. No data changed.')).toBeVisible()
  await page.getByRole('button', { name: 'Expenses' }).click()
  await expect(page.getByText('Browser Test Fuel')).toBeVisible()
  const mergeBackup = {
    ...backupJson,
    data: {
      ...backupJson.data,
      expenses: [
        ...backupJson.data.expenses,
        {
          id: 'merge-only-expense', description: 'Merged backup expense', amount: 42, currency: 'USD',
          date: '2026-10-20', category: 'Software', merchant: '', method: '', project: '', notes: '',
        },
      ],
    },
    receipts: [],
  }
  await page.getByRole('button', { name: 'Settings' }).click()
  let mergePrompt = 0
  page.on('dialog', (dialog) => {
    mergePrompt += 1
    if (mergePrompt % 2 === 1) void dialog.dismiss()
    else void dialog.accept()
  })
  const mergeFile = { name: 'merge-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(mergeBackup)) }
  await page.locator('input[accept="application/json"]').setInputFiles(mergeFile)
  await expect(page.getByText('Backup merged.')).toBeVisible()
  await page.getByRole('button', { name: 'Expenses' }).click()
  await expect(page.getByText('Merged backup expense')).toHaveCount(1)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.locator('input[accept="application/json"]').setInputFiles(mergeFile)
  await expect(page.getByText('Backup merged.')).toBeVisible()
  await page.getByRole('button', { name: 'Expenses' }).click()
  await expect(page.getByText('Merged backup expense')).toHaveCount(1)
})
