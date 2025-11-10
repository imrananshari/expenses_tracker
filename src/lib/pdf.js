
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

export async function exportExpensesPdf({ title, user, logoUrl = '/budgzyx.svg', records = [], labels, kind, budgetAmount, totalSpent, bankSplits = [] }) {
  // Bank helpers for icons and parsing
  function bankIconUrl(name) {
    const n = String(name || '').toLowerCase().trim()
    if (!n) return null
    if (n.includes('hdfc')) return '/banks/hdfc.png'
    if (n.includes('sbi')) return '/banks/sbi.png'
    if (n.includes('icici')) return '/banks/icici.png'
    if (n.includes('central')) return '/banks/central.png'
    if (n.includes('bank of india') || n === 'boi') return '/banks/boi.png'
    if (n.includes('bank of baroda') || n === 'bob') return '/banks/bob.png'
    return null
  }
  function extractBankFromRecord(rec) {
    if (!rec) return null
    if (rec.bankName) return String(rec.bankName)
    const note = String(rec.name || rec.title || '')
    const m = note.match(/\[Bank:\s*([^\]]+)\]/i)
    return m ? m[1] : null
  }
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
    // Optional: bank split table with icons (Bank Icon • Total • Used)
    const splits = Array.isArray(bankSplits) ? bankSplits.filter(s => Number(s.amount || 0) > 0) : []
    if (splits.length) {
      // Compute used amounts per bank from records
      const usedByBank = {}
      for (const r of (records || [])) {
        const b = extractBankFromRecord(r)
        if (!b) continue
        const amt = Number(r.amount || 0) || 0
        usedByBank[b] = (usedByBank[b] || 0) + amt
      }

      doc.setFontSize(11)
      doc.text('Budget Split by Bank', 14, nextY - 2)

      // Preload icons
      const iconCache = {}
      for (const s of splits) {
        const url = bankIconUrl(s.bank)
        if (url && !iconCache[url]) {
          iconCache[url] = await loadImageAsDataUrl(url)
        }
      }

      // Build rows: keep bank name in raw for hooks, show amounts
      const rows = splits.map(s => [String(s.bank || '—'), formatINR(s.amount), formatINR(usedByBank[String(s.bank || '—')] || 0)])

      autoTable(doc, {
        head: [['Bank', 'Total (₹)', 'Used (₹)']],
        body: rows,
        startY: nextY,
        styles: { fontSize: 10, cellPadding: 4, font: 'noto', valign: 'middle' },
        headStyles: { fillColor: [36, 36, 36], textColor: 255, font: 'noto' },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 42, halign: 'right' },
          2: { cellWidth: 42, halign: 'right' },
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        didParseCell: (data) => {
          // Header alignment: right-align Total/Used headers, left-align Bank
          if (data.section === 'head') {
            if (data.column.index === 1 || data.column.index === 2) {
              data.cell.styles.halign = 'right'
            } else {
              data.cell.styles.halign = 'left'
            }
          }
          // Remove text in the Bank column body; we'll draw icon only in didDrawCell
          if (data.section === 'body' && data.column.index === 0) {
            data.cell.text = ['']
          }
        },
        didDrawCell: (data) => {
          const { section, column, row, cell } = data
          if (section === 'body' && column.index === 0) {
            const bankName = String(row.raw[0] || '')
            const url = bankIconUrl(bankName)
            const img = url ? iconCache[url] : null
            if (img) {
              try {
                const size = 8
                const padding = 4
                const y = cell.y + (cell.height - size) / 2
                const x = cell.x + padding
                doc.addImage(img, 'PNG', x, y, size, size)
              } catch (_) { /* ignore */ }
            }
          }
        },
      })
      nextY = (doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : nextY) + 8
      // Soft divider and spacing after bank split
      doc.setDrawColor(200)
      doc.line(14, nextY, 196, nextY)
      nextY += 8
    }
    // Divider between summary and records
    doc.line(14, nextY, 196, nextY)
    nextY += 8
  }

  // Build table rows
  const lab = labels || resolveLabels({ title, kind })
  const body = (records || []).map((e) => {
    const amountStr = typeof e.amount === 'number'
      ? `₹${Number(e.amount).toLocaleString('en-IN')}`
      : (e.amount ? String(e.amount) : '—')
    return [
      e.date ? new Date(e.date).toLocaleDateString() : '',
      e.name || e.title || '—',
      e.payee || e.vendor || e.customer || '—',
      amountStr,
    ]
  })

  // Preload bank icons for records
  const recordBanks = [...new Set((records || []).map(extractBankFromRecord).filter(Boolean))]
  const recordIconCache = {}
  for (const b of recordBanks) {
    const url = bankIconUrl(b)
    if (url && !recordIconCache[url]) {
      recordIconCache[url] = await loadImageAsDataUrl(url)
    }
  }

  autoTable(doc, {
    head: [[lab.dateLabel, lab.nameLabel, lab.payeeLabel, lab.amountLabel]],
    body,
    startY: nextY,
    styles: { fontSize: 10, cellPadding: 3, font: 'noto', valign: 'middle' },
    headStyles: { fillColor: [36, 36, 36], textColor: 255, font: 'noto' },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 86 },
      2: { cellWidth: 42 },
      3: { cellWidth: 28, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    didDrawCell: (data) => {
      const { section, column, row, cell } = data
      if (section === 'body' && column.index === 1) {
        // Draw the bank icon immediately after the expense name text
        const r = (records || [])[row.index]
        const bankName = extractBankFromRecord(r)
        const url = bankIconUrl(bankName)
        const img = url ? recordIconCache[url] : null
        if (img) {
          try {
            const size = 6
            const gap = 2 // minimal space between text and icon
            const leftPad = 3 // matches table cellPadding
            const textLines = Array.isArray(cell.text) ? cell.text : [String(cell.text || '')]
            const firstLine = String(textLines[0] || '')
            const textWidth = doc.getTextWidth(firstLine)
            const x = cell.x + leftPad + textWidth + gap
            const y = cell.y + (cell.height - size) / 2
            doc.addImage(img, 'PNG', x, y, size, size)
          } catch (_) { /* ignore */ }
        }
      }
    },
  })

  const safeTitle = String(title || 'expenses').replace(/\s+/g, '_').toLowerCase()
  const dateStr = new Date().toISOString().slice(0, 10)
  doc.save(`${safeTitle}_${dateStr}.pdf`)
}

// Helper to add a section with a title and wrapped body text
function addSection(doc, { title, body }, startY) {
  const marginL = 14
  let y = startY
  if (title) {
    doc.setFontSize(13)
    doc.text(String(title), marginL, y)
    y += 6
  }
  if (body) {
    doc.setFontSize(10)
    const lines = doc.splitTextToSize(String(body), 182)
    doc.text(lines, marginL, y)
    y += (lines.length * 5) + 6
  }
  return y
}

export async function exportProjectFlowPdf({ user, logoUrl = '/budgzyx.svg' } = {}) {
  const doc = new jsPDF()
  await loadFontToDoc(doc)

  // Header
  const imgData = await loadImageAsDataUrl(logoUrl)
  if (imgData) doc.addImage(imgData, 'PNG', 14, 10, 22, 22)
  doc.setFontSize(16)
  doc.text('Budget Tracker – Project Flow Guide', 42, 18)
  doc.setFontSize(10)
  const uname = user?.name ? String(user.name) : ''
  const uemail = user?.email ? String(user.email) : ''
  const userLine = `${uname ? `Prepared for: ${uname}` : ''}${uemail ? (uname ? ' • ' : '') + `Email: ${uemail}` : ''}`
  if (userLine) doc.text(userLine, 14, 40)

  // Sections
  let y = 56
  y = addSection(doc, {
    title: 'Overview',
    body: 'This Next.js (App Router) project implements a mobile-first budget tracker. It uses client-side React components, a shared dashboard data provider for caching, and Supabase (via API helpers) for persistent data and file storage (avatars). The architecture favors quick navigation with minimal re-fetching and supports exporting reports to PDF.'
  }, y)

  y = addSection(doc, {
    title: 'Structure & Routing',
    body: 'App directory structure under src/app uses the App Router. Private routes live under src/app/(private)/dashboard/* (dashboard, category pages, shop). Shared UI and forms are in src/app/components/budget/*. The layout files src/app/layout.js and src/app/(private)/layout.jsx provide global and private wrappers, respectively.'
  }, y)

  y = addSection(doc, {
    title: 'Authentication',
    body: 'Auth helpers are provided in src/hooks/useAuth.js (session, user, signOut). Private pages gate on auth and show a loading overlay while session resolves. The dashboard reads effectiveUser and profile to render header state including avatar and initials.'
  }, y)

  y = addSection(doc, {
    title: 'Data & API Layer',
    body: 'API helpers in src/api/db.js include categories (getUserCategories, addCategory), budgets (getBudgetForMonth, upsertBudget, getBudgetsForMonthBulk), expenses (listExpenses, addExpense, updateExpense, listRecentExpenses), notifications (listNotifications), and avatars (uploadAvatarDataUrl, getProfileForUser, getPublicAvatarUrl). Components call these functions; Next.js API routes under src/app/api/* proxy to Supabase. Avatars are stored in the Supabase storage bucket “avatars”, with public URLs built by getPublicAvatarUrl.'
  }, y)

  y = addSection(doc, {
    title: 'State & Caching',
    body: 'src/hooks/useDashboardData.js provides a context that caches top-level data (categories, budgets, recent, notifications) and a per-category cache (categoryCache) to avoid reloading when revisiting category pages. Pages hydrate from cache instantly and then refresh in the background, updating only changed pieces to avoid full re-renders.'
  }, y)

  y = addSection(doc, {
    title: 'Rendering Flow',
    body: 'Dashboard shows a header with avatar; recent list uses IntersectionObserver with an invisible sentinel to implement incremental “load more” without visible loaders. Category pages render “Buying” and “Labour” sections; for non-home-building categories the buying header layout was adjusted per requirements. Infinite scroll in category lists also uses sentinel elements kept invisible to preserve functionality.'
  }, y)

  y = addSection(doc, {
    title: 'Performance & Avoiding Re-renders',
    body: 'Avatar URLs now avoid cache-busting, allowing browser caching across navigations. DashboardDataProvider minimizes re-renders by keeping shared lists and updating selectively (addRecentExpense, updateRecentExpense). Category pages reuse cached data via getCategoryData/setCategoryData and only merge deltas after background refresh.'
  }, y)

  y = addSection(doc, {
    title: 'Security & Sanitization',
    body: 'Text inputs in ExpenseForm and numeric inputs in BudgetForm are sanitized using src/lib/sanitize.js. sanitizeTextStrict strips HTML tags, normalizes whitespace, and blocks URL/domain-like strings. sanitizeAmount parses positive numbers and rejects invalid values. This prevents URL/tag injection and harmful links from entering the database.'
  }, y)

  y = addSection(doc, {
    title: 'PDF Exports',
    body: 'src/lib/pdf.js uses jsPDF and jspdf-autotable to export expenses with a budget summary. Logos are converted to PNG data URLs (SVG capability included). Fonts are loaded from local or CDN to ensure the ₹ glyph renders correctly.'
  }, y)

  if (y > 260) { doc.addPage(); y = 20 }
  y = addSection(doc, {
    title: 'Key Files',
    body: `- src/app/(private)/dashboard/page.jsx: Dashboard UI, header, avatar logic, recent expenses.
 - src/app/(private)/dashboard/category/[slug]/page.jsx: Category UI, buying/labour forms, filters, infinite scroll.
 - src/app/components/budget/ExpenseForm.jsx: Add/Edit expenses, now sanitized.
 - src/app/components/budget/BudgetForm.jsx: Set budgets, now sanitized.
 - src/hooks/useDashboardData.js: Shared cache and state for data and category revisits.
 - src/api/db.js: API helpers and storage utilities.
 - src/lib/pdf.js: PDF generation utilities.`
  }, y)

  if (y > 260) { doc.addPage(); y = 20 }
  y = addSection(doc, {
    title: 'How Data Flows (Step-by-Step)',
    body: `1) User authenticates via useAuth; private layouts gate routes.
 2) Dashboard loads profile via getProfileForUser; avatar resolves via stable public URL.
 3) DashboardDataProvider initializes categories, budgets, recent, notifications and caches them.
 4) Category page: reads cache via getCategoryData(slug) to render immediately; then fetches budget and expenses and merges updates via setCategoryData.
 5) Adding or editing an expense updates local UI and writes to API; provider updates recent list with addRecentExpense/updateRecentExpense.
 6) Infinite scroll observers increase the visible count when the sentinel intersects, without visible loaders.`
  }, y)

  const fileTitle = 'project_flow_guide'
  const dateStr = new Date().toISOString().slice(0, 10)
  doc.save(`${fileTitle}_${dateStr}.pdf`)
}