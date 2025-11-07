
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

async function loadImageAsDataUrl(url) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    // If SVG, convert to PNG data URL via canvas for jsPDF
    if (String(blob.type).includes('image/svg')) {
      return await svgBlobToPngDataUrl(blob)
    }
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  } catch (e) {
    return null
  }
}

function svgBlobToPngDataUrl(svgBlob) {
  return new Promise((resolve, reject) => {
    try {
      const url = URL.createObjectURL(svgBlob)
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const w = img.naturalWidth || 64
          const h = img.naturalHeight || 64
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)
          const pngDataUrl = canvas.toDataURL('image/png')
          URL.revokeObjectURL(url)
          resolve(pngDataUrl)
        } catch (err) {
          URL.revokeObjectURL(url)
          reject(err)
        }
      }
      img.onerror = (err) => {
        URL.revokeObjectURL(url)
        reject(err)
      }
      img.src = url
    } catch (err) {
      reject(err)
    }
  })
}

async function loadFontToDoc(doc) {
  // Try local font first, then fallback to CDN-hosted Noto Sans (ALL subset with ₹ glyph)
  const candidates = [
    '/fonts/noto-sans-all-400-normal.ttf',
    'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans/files/noto-sans-all-400-normal.ttf',
    'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans/files/noto-sans-all-500-normal.ttf',
  ]
  for (const url of candidates) {
    try {
      const res = await fetch(url, { mode: 'cors' })
      if (!res.ok) continue
      const blob = await res.blob()
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
      const base64 = String(dataUrl).split(',')[1]
      doc.addFileToVFS('noto-sans.ttf', base64)
      doc.addFont('noto-sans.ttf', 'noto', 'normal')
      doc.setFont('noto', 'normal')
      return true
    } catch (_) {
      // try next
    }
  }
  return false
}

function resolveLabels({ title, kind }) {
  const amountLabel = 'Amount (₹)'
  const lower = String(title || '').toLowerCase()
  if ((kind && kind === 'sale') || lower.includes('sale')) {
    return { nameLabel: 'Sale Name', payeeLabel: 'Customer', amountLabel, dateLabel: 'Sale Date' }
  }
  if ((kind && (kind === 'buying' || kind === 'purchase')) || lower.includes('purchase') || lower.includes('buying')) {
    return { nameLabel: 'Purchase Name', payeeLabel: 'Where/Who (shop)', amountLabel, dateLabel: 'Spent Date' }
  }
  if ((kind && kind === 'labour') || lower.includes('labour')) {
    return { nameLabel: 'Expense Name', payeeLabel: 'Worker', amountLabel, dateLabel: 'Spent Date' }
  }
  return { nameLabel: 'Expense Name', payeeLabel: 'Payee/Who', amountLabel, dateLabel: 'Spent Date' }
}

export async function exportExpensesPdf({ title, user, logoUrl = '/budgzyx.svg', records = [], labels, kind, budgetAmount, totalSpent }) {
  const doc = new jsPDF()
  await loadFontToDoc(doc)

  // Header: logo left, title to the right; name and email below logo
  const imgData = await loadImageAsDataUrl(logoUrl)
  if (imgData) {
    doc.addImage(imgData, 'PNG', 14, 10, 22, 22)
  }

  doc.setFontSize(16)
  // Keep title aligned horizontally with the logo
  doc.text(String(title || 'Expenses'), 42, 18)

  doc.setFontSize(10)
  const uname = user?.name ? String(user.name) : ''
  const uemail = user?.email ? String(user.email) : ''
  const userLine = `${uname ? `Name: ${uname}` : ''}${uemail ? (uname ? ' • ' : '') + `Email: ${uemail}` : ''}`
  if (userLine) doc.text(userLine, 14, 40)

  // // Divider below header
  // doc.setDrawColor(180)
  // doc.line(14, 50, 196, 50)

  // Budget summary: place ABOVE the expense records table
  const formatINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
  const budgetAmt = Number(budgetAmount || 0)
  const spent = Number(totalSpent ?? (records || []).reduce((s,e)=>s+Number(e.amount||0),0))
  const remaining = Math.max(0, budgetAmt - spent)
  const overspent = Math.max(0, spent - budgetAmt)

  let nextY = 56
  const fullTitle = String(title || '').trim()
  const categoryName = fullTitle.includes('•') ? fullTitle.split('•')[0].trim() : fullTitle
  if (budgetAmt || spent) {
    doc.setFontSize(12)
    doc.text('Budget Summary', 14, nextY - 8)
    // Description under the summary title for clarity
    doc.setFontSize(9)
    doc.setTextColor(90)
    const desc = categoryName ? `This summary reflects the budget for ${categoryName}. Records are listed below.` : 'This summary reflects the budget for this category. Records are listed below.'
    doc.text(desc, 14, nextY - 2)
    doc.setTextColor(0)
    autoTable(doc, {
      head: [['Budget', 'Spent', 'Remaining', 'Overspent']],
      body: [[formatINR(budgetAmt), formatINR(spent), formatINR(remaining), formatINR(overspent)]],
      startY: nextY,
      styles: { fontSize: 10, cellPadding: 3, font: 'noto' },
      headStyles: { fillColor: [36, 36, 36], textColor: 255, font: 'noto' },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [0, 128, 0] },
        1: { fontStyle: 'bold', textColor: [0, 128, 0] },
        2: { fontStyle: 'bold', textColor: [0, 128, 0] },
        3: { fontStyle: 'bold', textColor: [0, 128, 0] },
      },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    })
    nextY = (doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : nextY) + 8
    // Divider between summary and records
    doc.line(14, nextY, 196, nextY)
    nextY += 8
  }

  // Build table rows
  const lab = labels || resolveLabels({ title, kind })
  const body = (records || []).map((e) => [
    e.date ? new Date(e.date).toLocaleDateString() : '',
    e.name || e.title || '—',
    e.payee || e.vendor || e.customer || '—',
    typeof e.amount === 'number'
      ? `₹${Number(e.amount).toLocaleString('en-IN')}`
      : (e.amount ? String(e.amount) : '—')
  ])

  autoTable(doc, {
    head: [[lab.dateLabel, lab.nameLabel, lab.payeeLabel, lab.amountLabel]],
    body,
    startY: nextY,
    styles: { fontSize: 10, cellPadding: 2, font: 'noto' },
    headStyles: { fillColor: [36, 36, 36], textColor: 255, font: 'noto' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  })

  const safeTitle = String(title || 'expenses').replace(/\s+/g, '_').toLowerCase()
  const dateStr = new Date().toISOString().slice(0, 10)
  doc.save(`${safeTitle}_${dateStr}.pdf`)
}