// Client-side exports (no server round-trip, so they work unchanged on
// Vercel serverless): CSV via Blob download, PDF via jsPDF with a real
// file download — no print dialog, no popup window.
import { jsPDF } from 'jspdf'
import { localDateString } from './time.js'

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value)
  // Quote when the cell contains a comma, quote, newline OR carriage
  // return: a bare \r would otherwise corrupt the row on some parsers.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// columns: [{ key, label }]; rows: plain objects. Downloads a .csv file.
export function exportCSV(filename, columns, rows) {
  const header = columns.map((c) => csvCell(c.label)).join(',')
  const lines = rows.map((r) => columns.map((c) => csvCell(r[c.key] ?? '—')).join(','))
  const blob = new Blob([[header, ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  triggerDownload(URL.createObjectURL(blob), filename)
}

// PDF: dark-forest header row (#0A120E) with pale-mint text (#D1FAE5)
// and dark body text (#0A120E) on white — both high-contrast pairs.
// Title in dark forest on white. Tables paginate automatically.
export function exportPDF(title, filename, columns, rows) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const usable = pageW - margin * 2
  const widths = columns.map((c) => Math.max(52, usable * (c.width || 1) / columns.reduce((s, x) => s + (x.width || 1), 0)))
  const fontSize = 9
  const lineH = 12
  const pad = 5
  let y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor('#0A120E')
  doc.text(title, margin, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor('#404040')
  doc.text(`Faculty Management System — exported ${new Date().toLocaleString()} — ${rows.length} row(s)`, margin, y)
  y += 22

  function drawHeader() {
    doc.setFillColor('#0A120E')
    doc.rect(margin, y, usable, 22, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(fontSize)
    doc.setTextColor('#D1FAE5')
    let x = margin
    columns.forEach((c, i) => {
      // Wrap header labels like body cells: a long label used to
      // overflow its column (doc.text with maxWidth only clips).
      doc.text(doc.splitTextToSize(c.label, widths[i] - pad * 2), x + pad, y + 14)
      x += widths[i]
    })
    y += 22
  }

  drawHeader()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(fontSize)
  rows.forEach((r, rowIdx) => {
    const cells = columns.map((c, i) => {
      // Guard missing fields with '—' so e.g. a missing semester never
      // renders as the literal string "undefined".
      const text = r[c.key] === null || r[c.key] === undefined ? '—' : String(r[c.key])
      return doc.splitTextToSize(text, widths[i] - pad * 2)
    })
    const rowH = Math.max(...cells.map((c) => c.length)) * lineH + pad * 2
    if (y + rowH > pageH - margin) {
      doc.addPage()
      y = margin
      drawHeader()
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(fontSize)
    }
    if (rowIdx % 2 === 1) {
      doc.setFillColor('#ECFDF5')
      doc.rect(margin, y, usable, rowH, 'F')
    }
    doc.setTextColor('#0A120E')
    let x = margin
    cells.forEach((lines, i) => {
      doc.text(lines, x + pad, y + pad + lineH - 3)
      x += widths[i]
    })
    y += rowH
  })
  if (rows.length === 0) {
    doc.setTextColor('#0A120E')
    doc.text('No rows to export.', margin, y + 14)
  }
  doc.save(filename)
}

function triggerDownload(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function fileStamp() {
  // Local date, not UTC: see localDateString in utils/time.js.
  return localDateString()
}
