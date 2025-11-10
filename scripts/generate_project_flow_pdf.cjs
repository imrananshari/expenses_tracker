const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')
const SVGtoPDF = require('svg-to-pdfkit')

const PAGE_MARGIN = 50
const CONTENT_WIDTH = 612 - PAGE_MARGIN * 2

function hr(doc) {
  const y = doc.y + 4
  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).stroke()
  doc.moveDown(0.8)
}

function addHeader(doc, title) {
  doc.font('Helvetica-Bold').fontSize(16).text(title, PAGE_MARGIN, 50, { width: CONTENT_WIDTH, align: 'center' })
  doc.moveDown(0.5)
  hr(doc)
}

function addFooter(doc, pageNumber) {
  const footerY = doc.page.height - PAGE_MARGIN + 10
  doc.font('Helvetica').fontSize(9).fillColor('#666').text(String(pageNumber), PAGE_MARGIN, footerY, { width: CONTENT_WIDTH, align: 'center' })
  doc.fillColor('#000')
}

function addSection(doc, title, body, options = {}) {
  const { after = 12 } = options
  doc.font('Helvetica-Bold').fontSize(13).text(title, { width: CONTENT_WIDTH, align: 'left' })
  doc.moveDown(0.3)
  doc.font('Helvetica').fontSize(10).text(body, { width: CONTENT_WIDTH, align: 'left' })
  doc.moveDown(after / 12)
}

function addCode(doc, code) {
  const startY = doc.y
  doc.rect(PAGE_MARGIN - 2, startY - 2, CONTENT_WIDTH + 4, 18 + Math.ceil(code.length / 60) * 6).fill('#f6f8fa').stroke()
  doc.fillColor('#222')
  doc.font('Courier').fontSize(9).text(code, PAGE_MARGIN, startY, { width: CONTENT_WIDTH })
  doc.moveDown(1)
  doc.font('Helvetica').fillColor('#000')
}

function addDiagramArchitecture(doc) {
  const startY = doc.y + 10
  const leftX = PAGE_MARGIN
  const rightX = PAGE_MARGIN + CONTENT_WIDTH - 160
  const midX = PAGE_MARGIN + CONTENT_WIDTH / 2 - 70
  // Boxes
  doc.rect(leftX, startY, 140, 40).stroke()
  doc.text('Next.js App', leftX + 10, startY + 12, { width: 120, align: 'center' })

  doc.rect(midX, startY + 80, 140, 40).stroke()
  doc.text('DashboardDataProvider', midX + 10, startY + 92, { width: 120, align: 'center' })

  doc.rect(rightX, startY, 140, 40).stroke()
  doc.text('Supabase API', rightX + 10, startY + 12, { width: 120, align: 'center' })

  // Arrows
  doc.moveTo(leftX + 140, startY + 20).lineTo(midX, startY + 100).stroke()
  doc.moveTo(rightX, startY + 20).lineTo(midX + 140, startY + 100).stroke()
  doc.y = startY + 140
}

function addDiagramCaching(doc) {
  const y = doc.y + 10
  const w = (CONTENT_WIDTH - 40) / 2
  doc.rect(PAGE_MARGIN, y, w, 40).stroke()
  doc.text('categoryCache', PAGE_MARGIN + 10, y + 12, { width: w - 20, align: 'center' })
  doc.rect(PAGE_MARGIN + w + 40, y, w, 40).stroke()
  doc.text('shared state: categories/budgets', PAGE_MARGIN + w + 50, y + 12, { width: w - 20, align: 'center' })
  doc.y = y + 60
}

function addDiagramRendering(doc) {
  const y = doc.y + 10
  const w = (CONTENT_WIDTH - 40) / 3
  doc.rect(PAGE_MARGIN, y, w, 40).stroke()
  doc.text('List items', PAGE_MARGIN + 10, y + 12, { width: w - 20, align: 'center' })
  doc.rect(PAGE_MARGIN + w + 20, y, w, 40).stroke()
  doc.text('Invisible sentinel', PAGE_MARGIN + w + 30, y + 12, { width: w - 20, align: 'center' })
  doc.rect(PAGE_MARGIN + (w * 2) + 40, y, w, 40).stroke()
  doc.text('Load more (on intersect)', PAGE_MARGIN + (w * 2) + 50, y + 12, { width: w - 20, align: 'center' })
  doc.y = y + 60
}

function bullets(doc, items) {
  doc.font('Helvetica').fontSize(10)
  items.forEach((line) => {
    doc.text(`• ${line}`, { width: CONTENT_WIDTH, align: 'left' })
  })
  doc.moveDown(1)
}

function main() {
  const outPath = path.resolve(__dirname, '..', 'src', 'lib', 'project_flow_guide.pdf')
  const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN })
  const stream = fs.createWriteStream(outPath)
  doc.pipe(stream)

  // Header with SVG logo (budgzyx.svg)
  const svgLogoPath = path.resolve(__dirname, '..', 'public', 'budgzyx.svg')
  if (fs.existsSync(svgLogoPath)) {
    try {
      const svg = fs.readFileSync(svgLogoPath, 'utf8')
      // Center the SVG at top
      SVGtoPDF(doc, svg, PAGE_MARGIN + CONTENT_WIDTH / 2 - 40, 40, { width: 80, height: 80 })
    } catch {}
  }
  addHeader(doc, 'Budget Tracker – Project Flow Guide')

  addSection(doc, 'Overview', 'This Next.js (App Router) project implements a mobile-first budget tracker. It uses client-side React components, a shared dashboard data provider for caching, and Supabase (via API helpers) for persistent data and file storage (avatars). The architecture favors quick navigation with minimal re-fetching and supports exporting reports to PDF.')

  addSection(doc, 'Structure & Routing', 'App directory structure under src/app uses the App Router. Private routes live under src/app/(private)/dashboard/* (dashboard, category pages). Shared UI and forms are in src/app/components/budget/*. Global layout is src/app/layout.js; private layouts gate auth.')

  addSection(doc, 'Authentication', 'Auth helpers are provided in src/hooks/useAuth.js (session, user, signOut). Private pages gate on auth and show a loading overlay while session resolves. The dashboard reads effectiveUser and profile to render header state including avatar and initials.')

  addSection(doc, 'Data & API Layer', 'API helpers in src/api/db.js include categories (getUserCategories, addCategory), budgets (getBudgetForMonth, upsertBudget, getBudgetsForMonthBulk), expenses (listExpenses, addExpense, updateExpense, listRecentExpenses), notifications (listNotifications), and avatars (uploadAvatarDataUrl, getProfileForUser, getPublicAvatarUrl). Next.js API routes under src/app/api/* proxy to Supabase. Avatars are stored in the Supabase storage bucket “avatars”, with public URLs built by getPublicAvatarUrl.')

  addDiagramArchitecture(doc)

  addSection(doc, 'State & Caching', 'src/hooks/useDashboardData.js provides a context that caches top-level data (categories, budgets, recent transactions, notifications) and a per-category cache (categoryCache) to avoid reloading when revisiting category pages. Pages hydrate from cache instantly and then refresh in the background, updating only changed pieces to avoid full re-renders.')
  addDiagramCaching(doc)

  addSection(doc, 'Rendering Flow', 'Dashboard shows a header with avatar; recent list uses IntersectionObserver with an invisible sentinel to implement incremental “load more” without visible loaders. Category pages render Buying and Labour sections; infinite scroll in category lists also uses sentinel elements kept invisible to preserve functionality.')
  addDiagramRendering(doc)

  addSection(doc, 'Performance & Avoiding Re-renders', 'Avatar URLs avoid cache-busting, allowing browser caching across navigations. DashboardDataProvider minimizes re-renders by keeping shared lists and updating selectively (addRecentExpense, updateRecentExpense). Category pages reuse cached data via getCategoryData/setCategoryData and only merge deltas after background refresh.')

  addSection(doc, 'Security & Sanitization', 'Text inputs in ExpenseForm and numeric inputs in BudgetForm are sanitized using src/lib/sanitize.js. sanitizeTextStrict strips HTML tags, normalizes whitespace, and blocks URL/domain-like strings. sanitizeAmount parses positive numbers and rejects invalid values. This prevents URL/tag injection and harmful links from entering the database.')

  addSection(doc, 'PDF Exports', 'src/lib/pdf.js uses jsPDF and jspdf-autotable to export expenses with a budget summary. Logos are converted to PNG data URLs (SVG capability included). Fonts are loaded from local or CDN to ensure the ₹ glyph renders correctly.')

  doc.addPage()
  addHeader(doc, 'Key Files & API Examples')
  addSection(doc, 'Key Files', '')
  bullets(doc, [
    'src/app/(private)/dashboard/page.jsx: Dashboard UI, header, avatar logic, recent',
    'src/app/(private)/dashboard/category/[slug]/page.jsx: Category UI, buying/labour forms, filters, infinite scroll',
    'src/app/components/budget/ExpenseForm.jsx: Add/Edit expenses, sanitized',
    'src/app/components/budget/BudgetForm.jsx: Set budgets, sanitized',
    'src/hooks/useDashboardData.js: Shared cache/state for data and category revisits',
    'src/api/db.js: API helpers and storage utilities',
    'src/lib/pdf.js: PDF generation utilities',
  ])

  addSection(doc, 'API Examples', 'Examples of calling helpers from components:')
  addCode(doc, `import { listExpenses, addExpense } from "src/api/db"\n\nasync function loadExpenses(categorySlug) {\n  const expenses = await listExpenses(categorySlug)\n  return expenses\n}\n\nasync function createExpense(payload) {\n  const res = await addExpense(payload)\n  // update cache and UI...\n}`)

  addSection(doc, 'How Data Flows (Step-by-Step)', '')
  bullets(doc, [
    'User authenticates via useAuth; private layouts gate routes.',
    'Dashboard loads profile via getProfileForUser; avatar resolves via stable public URL.',
    'Provider initializes categories, budgets, recent transactions, notifications and caches them.',
    'Category page reads cache via getCategoryData(slug) to render immediately; background fetch merges updates via setCategoryData.',
    'Adding/editing an expense updates local UI and writes to API; provider updates recent list via addRecentExpense/updateRecentExpense.',
    'Infinite scroll increases visible count when sentinel intersects, avoiding visible loaders.',
  ])

  addSection(doc, 'Screenshots', 'If you want real UI screenshots (Dashboard header, Category lists), I can capture them and embed them into this PDF. This version includes diagrams and the budgzyx.svg logo at top.')

  addSection(doc, 'Notes', 'This guide summarizes the implementation and design choices to help students understand the flow, data management, and security posture of the project.')

  // Footer page numbers
  let pageIndex = 1
  addFooter(doc, pageIndex)
  doc.on('pageAdded', () => {
    pageIndex += 1
    addFooter(doc, pageIndex)
  })

  doc.end()

  stream.on('finish', () => {
    console.log('PDF generated at:', outPath)
  })
}

main()