import { formatMoney, getTotals } from './invoice-utils'
import type { InvoiceDocument } from './types'

// The PDF engine is loaded only when a person exports or shares a document.
export async function buildPdf(document: InvoiceDocument) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const width = pdf.internal.pageSize.getWidth()
  const height = pdf.internal.pageSize.getHeight()
  const margin = 48
  const tableWidth = width - margin * 2
  const totals = getTotals(document.items, document.taxRate)
  const title = document.type === 'invoice' ? 'INVOICE' : 'QUOTATION'
  let y = drawHeader(pdf, document, title, width, margin)

  const drawTableHeader = () => {
    pdf.setFillColor(236, 253, 245); pdf.rect(margin, y, tableWidth, 25, 'F')
    pdf.setTextColor(15, 23, 42); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9)
    pdf.text('DESCRIPTION', margin + 10, y + 16); pdf.text('QTY', 350, y + 16, { align: 'right' }); pdf.text('PRICE', 430, y + 16, { align: 'right' }); pdf.text('AMOUNT', width - margin - 10, y + 16, { align: 'right' })
    y += 43
  }
  const nextPage = () => { pdf.addPage(); y = 54; drawTableHeader() }

  drawTableHeader()
  document.items.forEach((item) => {
    const lines = pdf.splitTextToSize(item.description || 'Untitled item', 250) as string[]
    const rowHeight = Math.max(28, lines.length * 12 + 14)
    if (y + rowHeight > height - 68) nextPage()
    const amount = item.quantity * item.price * (1 - item.discount / 100)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(15, 23, 42)
    pdf.text(lines, margin + 10, y)
    pdf.text(String(item.quantity), 350, y, { align: 'right' }); pdf.text(formatMoney(item.price, document.currency), 430, y, { align: 'right' }); pdf.text(formatMoney(amount, document.currency), width - margin - 10, y, { align: 'right' })
    pdf.setDrawColor(226, 232, 240); pdf.line(margin, y + rowHeight - 9, width - margin, y + rowHeight - 9); y += rowHeight
  })

  // Totals and footer never start in the last few points of a page.
  if (y + 175 > height - margin) { pdf.addPage(); y = 58 }
  y += 12; pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10)
  const totalLines = [['Subtotal', totals.subtotal], ['Discount', -totals.discount], [`Tax (${document.taxRate}%)`, totals.tax]] as const
  totalLines.forEach(([name, value]) => { pdf.text(name, 400, y, { align: 'right' }); pdf.text(formatMoney(value, document.currency), width - margin, y, { align: 'right' }); y += 19 })
  pdf.setFillColor(5, 150, 105); pdf.rect(340, y - 5, width - margin - 340, 32, 'F'); pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12)
  pdf.text('TOTAL', 400, y + 16, { align: 'right' }); pdf.text(formatMoney(totals.total, document.currency), width - margin, y + 16, { align: 'right' })
  y += 68; pdf.setTextColor(15, 23, 42); pdf.setFontSize(9); pdf.text('PAYMENT DETAILS', margin, y); pdf.setFont('helvetica', 'normal'); pdf.text(document.business.bank || 'Payment details not provided.', margin, y + 17)
  if (document.notes) { pdf.setFont('helvetica', 'bold'); pdf.text('NOTES', margin, y + 54); pdf.setFont('helvetica', 'normal'); pdf.text(pdf.splitTextToSize(document.notes, tableWidth), margin, y + 71) }
  return pdf
}

function drawHeader(pdf: import('jspdf').jsPDF, document: InvoiceDocument, title: string, width: number, margin: number) {
  pdf.setFillColor(15, 23, 42); pdf.rect(0, 0, width, 132, 'F')
  pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(24)
  let businessX = margin
  if (document.business.logo) {
    try { pdf.addImage(document.business.logo, 'PNG', margin, 34, 42, 42); businessX += 54 } catch { /* unsupported images never block export */ }
  }
  pdf.text(document.business.name || 'Your business', businessX, 58)
  pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.text([document.business.email, document.business.phone, document.business.address].filter(Boolean), businessX, 80)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(19); pdf.text(title, width - margin, 58, { align: 'right' }); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.text(`# ${document.number}`, width - margin, 80, { align: 'right' })
  pdf.setTextColor(15, 23, 42); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.text('BILL TO', margin, 170); pdf.setFontSize(12); pdf.text(document.customer.name || 'Customer name', margin, 188)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.text([document.customer.phone, document.customer.email, document.customer.address].filter(Boolean), margin, 205)
  pdf.setFont('helvetica', 'bold'); pdf.text('ISSUED', width - margin - 120, 170); pdf.text(document.issueDate, width - margin, 188, { align: 'right' }); pdf.text(document.type === 'invoice' ? 'DUE' : 'VALID UNTIL', width - margin - 120, 210); pdf.text(document.dueDate, width - margin, 228, { align: 'right' })
  return 270
}
