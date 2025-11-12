"use client"
import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { getUserCategories, getBudgetForMonth, getBudgetsForMonthBulk, listRecentExpenses, upsertBudget, listExpenses, addExpense, addCategory, updateExpense } from '@/api/db'
import { IndianRupee, ShoppingCart, Calendar, Plus, Bell, LogOut, Search, Shirt, Store, Car, Wrench, Utensils, UtensilsCrossed, FileDown, Eye } from 'lucide-react'
import { exportExpensesPdf } from '@/lib/pdf'
import MiniSpendChart from '@/app/components/budget/MiniSpendChart'
import ExpenseForm from '@/app/components/budget/ExpenseForm'
import BudgetForm from '@/app/components/budget/BudgetForm'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useDashboardData } from '@/hooks/useDashboardData'

const ShopPage = () => {
  const router = useRouter()
  const { user, signOut } = useAuth()
  const { addRecentExpense, updateRecentExpense, setCategoryBudgets: setCachedBudgets } = useDashboardData()
  const [categories, setCategories] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedCategoryName, setSelectedCategoryName] = useState('')
  const [budgetInfo, setBudgetInfo] = useState({ amount: 0, id: null })
  const [bankAllocations, setBankAllocations] = useState([])
  const [expensesBuying, setExpensesBuying] = useState([])
  const [expensesSales, setExpensesSales] = useState([])
  const [topups, setTopups] = useState([])
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [activeKind, setActiveKind] = useState('buying') // 'buying' | 'sale'
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [showTopupModal, setShowTopupModal] = useState(false)
  const [topupForm, setTopupForm] = useState({ amount: '', date: '', reason: '', type: '' })
  const [addingTopup, setAddingTopup] = useState(false)
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [setupMode, setSetupMode] = useState('template') // 'template' | 'custom'
  const [setupTemplateName, setSetupTemplateName] = useState('')
  const [setupNewName, setSetupNewName] = useState('')
  const [setupBudgetAmount, setSetupBudgetAmount] = useState('')
  const [setupAllocations, setSetupAllocations] = useState([
    { bank: '', amount: '', other: '' },
  ])
  const SHOP_TEMPLATES = [
    'Cloths Garments',
    'Grocery',
    'Auto Spare Parts',
    'General Store',
    'Restaurant and Cafe',
    'Food Shop',
  ]
  const [filters, setFilters] = useState({
    buying: { search: '', dateFrom: '', dateTo: '' },
    sale: { search: '', dateFrom: '', dateTo: '' }
  })
  const [dateDraft, setDateDraft] = useState({
    buying: { dateFrom: '', dateTo: '' },
    sale: { dateFrom: '', dateTo: '' }
  })
  const [datePopoverOpen, setDatePopoverOpen] = useState({ buying: false, sale: false })
  const [activeTab, setActiveTab] = useState('buying')
  const contentScrollRef = useRef(null)
  const [shopCandidates, setShopCandidates] = useState([]) // [{id,name}]
  const templateNamesSet = useMemo(() => new Set([
    'Cloths Garments', 'Grocery', 'Auto Spare Parts', 'General Store', 'Restaurant and Cafe', 'Food Shop'
  ].map(n => n.toLowerCase())), [])
  const isShopCategory = (c) => {
    const nm = (c?.name || '').toLowerCase()
    const sg = (c?.slug || '').toLowerCase()
    return sg.startsWith('shop-') || templateNamesSet.has(nm)
  }

  // Pick an icon based on the current shop category name
  const getCategoryIcon = (name) => {
    const n = (name || '').toLowerCase()
    if (n.includes('cloth') || n.includes('garment')) return Shirt
    if (n.includes('general store')) return Store
    if (n.includes('auto') || n.includes('spare')) return Wrench
    if (n.includes('grocery')) return ShoppingCart
    if (n.includes('restaurant')) return UtensilsCrossed
    if (n.includes('food')) return Utensils
    return ShoppingCart
  }
const CategoryIcon = useMemo(() => getCategoryIcon(selectedCategoryName), [selectedCategoryName])
  // Setup modal validation helpers (must be inside component scope)
  const setupBudgetNum = useMemo(() => Number(setupBudgetAmount || 0), [setupBudgetAmount])
  const setupAllocSum = useMemo(() => (setupAllocations || []).reduce((s,a)=> s + Number(a.amount||0), 0), [setupAllocations])
  const overBudget = useMemo(() => setupBudgetNum > 0 && setupAllocSum > setupBudgetNum, [setupAllocSum, setupBudgetNum])
  const underBudget = useMemo(() => setupBudgetNum > 0 && setupAllocSum < setupBudgetNum, [setupAllocSum, setupBudgetNum])

  // Helpers to parse bank/split tags and icons
  const stripBankAndSplitTags = (note) => String(note||'').replace(/\s*\[Split:[^\]]+\]\s*/ig,'').replace(/\s*\[Bank:[^\]]+\]\s*/ig,'').trim()
  const normalizeBankName = (name) => String(name||'').trim().toLowerCase()
  const bankIconSrc = (bank) => {
    const n = normalizeBankName(bank)
    if (n.includes('hdfc')) return '/banks/hdfc.png'
    if (n.includes('sbi')) return '/banks/sbi.png'
    if (n.includes('icici')) return '/banks/icici.png'
    if (n.includes('bank of baroda') || n.includes('bob')) return '/banks/bob.png'
    if (n.includes('bank of india') || n.includes('boi')) return '/banks/boi.png'
    if (n.includes('central')) return '/banks/central.png'
    return null
  }
  function parseTopupSplits(note) {
    const m = String(note||'').match(/\[Split:([^\]]+)\]/i)
    if (!m) return []
    return m[1].split(';').map(s => {
      const [bank, amt] = s.split('=')
      return { bank: String(bank||'').trim(), amount: Number(amt||0) }
    }).filter(x => x.bank && x.amount > 0)
  }
  function parseBankTag(note) {
    const m = String(note||'').match(/\[Bank:([^\]]+)\]/i)
    return m ? String(m[1]||'').trim() : null
  }

  // Compute per-bank used from expenses
  const bankSpentMap = useMemo(() => {
    const map = new Map()
    ;[...expensesBuying, ...expensesSales].forEach(e => {
      const splits = parseTopupSplits(e.name)
      if (splits.length > 0) {
        splits.forEach(s => {
          const key = normalizeBankName(s.bank)
          map.set(key, (map.get(key) || 0) + Number(s.amount||0))
        })
      } else {
        const bank = parseBankTag(e.name)
        if (bank) {
          const key = normalizeBankName(bank)
          map.set(key, (map.get(key) || 0) + Number(e.amount||0))
        }
      }
    })
    return map
  }, [expensesBuying, expensesSales])

  // Bank modal state
  const [bankModalOpen, setBankModalOpen] = useState(false)
  const [selectedBank, setSelectedBank] = useState(null)
  const openBankModal = (bank) => { setSelectedBank(bank); setBankModalOpen(true) }
  const closeBankModal = () => { setBankModalOpen(false); setSelectedBank(null) }
  const bankExpenseList = useMemo(() => {
    if (!selectedBank) return []
    const key = normalizeBankName(selectedBank)
    const list = [...expensesBuying, ...expensesSales].filter(e => {
      const splits = parseTopupSplits(e.name)
      if (splits.length > 0) return splits.some(s => normalizeBankName(s.bank) === key)
      const tag = parseBankTag(e.name)
      return tag ? normalizeBankName(tag) === key : false
    }).map(e => {
      const splits = parseTopupSplits(e.name)
      const amt = splits.length > 0 ? (splits.find(s => normalizeBankName(s.bank) === key)?.amount || 0) : Number(e.amount||0)
      return { id: e.id, name: stripBankAndSplitTags(e.name), amount: Number(amt||0) }
    })
    return list
  }, [selectedBank, expensesBuying, expensesSales])
  const bankExpenseTotal = useMemo(() => bankExpenseList.reduce((s,e)=>s+Number(e.amount||0),0), [bankExpenseList])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!user) return
      const { data, error } = await getUserCategories(user.id)
      if (cancelled) return
      if (error) { toast.error(error.message); return }
      // Load categories then auto-select a category using real-time API data (no localStorage)
      const rows = data || []
      setCategories(rows)
      setSelectedCategoryId('')
      setSelectedCategoryName('')
      // Build toggle candidates and default selection from real-time activity
      try {
        const ids = rows.map(c => String(c.id))
        const shopRows = rows.filter(isShopCategory)

        // Recent activity first for default selection (restricted to shop categories)
        const { data: recentOne } = await listRecentExpenses(user.id, 1)
        if (Array.isArray(recentOne) && recentOne.length) {
          const latest = recentOne[0]
          const match = shopRows.find(c => String(c.id) === String(latest.category_id))
          if (match) {
            setSelectedCategoryId(String(match.id))
            setSelectedCategoryName(match.name || '')
          }
        }
        if (!selectedCategoryId) {
          // Fallback: prefer shop categories with current-month budgets
          const { data: budgets } = await getBudgetsForMonthBulk(user.id, ids)
          if (Array.isArray(budgets) && budgets.length) {
            const prioritized = budgets.find(b => shopRows.find(c => String(c.id) === String(b.category_id)))
            const match = prioritized ? shopRows.find(c => String(c.id) === String(prioritized.category_id)) : null
            if (match) {
              setSelectedCategoryId(String(match.id))
              setSelectedCategoryName(match.name || '')
            }
          }
        }

        // Toggle list: ONLY shop-store categories
        setShopCandidates(shopRows.map(c => ({ id: String(c.id), name: c.name })))
      } catch (err) {
        console.warn('Activity and candidate build failed', err)
        const shopRows = rows.filter(isShopCategory)
        setShopCandidates(shopRows.map(c => ({ id: String(c.id), name: c.name })))
      }
    }
    load()
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    let cancelled = false
    const loadBudgetAndExpenses = async () => {
      if (!user || !selectedCategoryId) return
      const [{ data: budgetRow }, { data: buyRows }, { data: saleRows }, { data: topupRows }] = await Promise.all([
        getBudgetForMonth(user.id, selectedCategoryId),
        listExpenses(user.id, selectedCategoryId, 'buying'),
        listExpenses(user.id, selectedCategoryId, 'sale'),
        listExpenses(user.id, selectedCategoryId, 'topup'),
      ])
      if (cancelled) return
      const amt = Number(budgetRow?.amount || 0)
      setBudgetInfo({ amount: amt, id: budgetRow?.id || null })
      setBankAllocations(Array.isArray(budgetRow?.allocations) ? budgetRow.allocations.map(a => ({ bank: a.bank, amount: Number(a.amount||0), source_id: a.source_id })) : [])
      setExpensesBuying((buyRows || []).map(e => ({ id: e.id, name: e.note || 'Expense', payee: e.payee || null, amount: Number(e.amount||0), date: e.spent_at, kind: e.kind, edited: Boolean(e.edited) })))
      setExpensesSales((saleRows || []).map(e => ({ id: e.id, name: e.note || 'Sale', payee: e.payee || null, amount: Number(e.amount||0), date: e.spent_at, kind: e.kind, edited: Boolean(e.edited) })))
      setTopups((topupRows || []).map(e => ({ id: e.id, reason: e.note || 'Added amount', type: e.payee || null, amount: Number(e.amount||0), date: e.spent_at, kind: 'topup' })))
      // If there is no budget for selected shop, prompt user to set it
      setShowBudgetForm(!budgetRow)
    }
    loadBudgetAndExpenses()
    return () => { cancelled = true }
  }, [user, selectedCategoryId])

  const handleSetBudget = async (e) => {
    e.preventDefault()
    const amountNum = Number(e.target.elements.budget.value || 0)
    if (!user || !selectedCategoryId || amountNum <= 0) { toast.error('Enter a valid budget amount'); return }
    const { data, error } = await upsertBudget(user.id, selectedCategoryId, amountNum)
    if (error) { toast.error(error.message); return }
    setBudgetInfo({ amount: Number(data.amount || 0), id: data.id })
    setShowBudgetForm(false)
    toast.success(`Budget set: ₹${amountNum.toLocaleString()}`)
  }

  // Top-up budget modal and submission
  const openTopupModal = () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth()+1).padStart(2,'0')
    const d = String(today.getDate()).padStart(2,'0')
    setTopupForm({ amount: '', date: `${y}-${m}-${d}`, reason: '', type: '' })
    setShowTopupModal(true)
  }

  const handleTopupSubmit = async () => {
    if (!user || !selectedCategoryId) return
    const amt = Number(topupForm.amount || 0)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    setAddingTopup(true)
    try {
      const newBudget = Number(budgetInfo.amount || 0) + amt
      const { data: bData, error: bErr } = await upsertBudget(user.id, selectedCategoryId, newBudget)
      if (bErr) { console.error(bErr); toast.error('Failed to update budget'); return }
      setBudgetInfo({ amount: Number(bData.amount || newBudget), id: bData.id })
      // Update global budget cache for this category
      try {
        const cat = (categories || []).find(c => String(c.id) === String(selectedCategoryId))
        if (cat) {
          setCachedBudgets(prev => {
            const list = Array.isArray(prev) ? prev : []
            const exists = list.some(b => b.slug === cat.slug)
            const updated = exists
              ? list.map(b => (b.slug === cat.slug ? { ...b, name: cat.name, amount: Number(bData.amount || newBudget) } : b))
              : [{ name: cat.name, slug: cat.slug, amount: Number(bData.amount || newBudget) }, ...list]
            return updated
          })
        }
      } catch {}

      const { data: tData, error: tErr } = await addExpense(user.id, {
        categoryId: selectedCategoryId,
        budgetId: bData.id,
        amount: amt,
        note: topupForm.reason || 'Added to budget',
        payee: topupForm.type || null,
        kind: 'topup',
        spentAt: topupForm.date || undefined,
      })
      if (tErr) {
        console.error(tErr)
        toast.error('Budget updated, but failed to record entry')
      } else {
        const mapped = { id: tData.id, reason: tData.note || 'Added amount', type: tData.payee || null, amount: Number(tData.amount||0), date: tData.spent_at, kind: 'topup' }
        setTopups([mapped, ...topups])
        try { addRecentExpense(tData) } catch {}
      }
      setShowTopupModal(false)
      setTopupForm({ amount: '', date: '', reason: '', type: '' })
      toast.success('Budget increased')
    } finally {
      setAddingTopup(false)
    }
  }

  const slugify = (name) => String(name || '').trim().toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-')

  const handleInitialSetup = async (e) => {
    e.preventDefault()
    if (!user) return
    let catId = ''
    let catName = ''
    try {
      if (setupMode === 'custom') {
        const name = setupNewName.trim()
        if (!name) { toast.error('Please type a category name'); return }
        const existing = (categories || []).find(c => (c.name || '').toLowerCase() === name.toLowerCase())
        if (existing) {
          catId = String(existing.id)
          catName = existing.name
        } else {
          const slug = 'shop-' + slugify(name)
          const { data, error } = await addCategory(user.id, { name, slug })
          if (error) { toast.error(error.message); return }
          catId = String(data.id)
          catName = data.name
        }
      } else {
        const name = setupTemplateName.trim()
        if (!name) { toast.error('Please select a template'); return }
        const existing = (categories || []).find(c => (c.name || '').toLowerCase() === name.toLowerCase())
        if (existing) {
          catId = String(existing.id)
          catName = existing.name
        } else {
          const slug = 'shop-' + slugify(name)
          const { data, error } = await addCategory(user.id, { name, slug })
          if (error) { toast.error(error.message); return }
          catId = String(data.id)
          catName = data.name
        }
      }

      const amountNum = Number(setupBudgetAmount || 0)
      if (amountNum <= 0) { toast.error('Enter a valid purchasing budget'); return }
      // Clean allocations from setup form (resolve Other -> custom name)
      const cleanedAllocations = (setupAllocations || [])
        .map(a => ({ bank: String((a.bank === 'Other' ? a.other : a.bank) || '').trim(), amount: Number(a.amount||0) }))
        .filter(a => a.bank && a.amount > 0)
      // Validate splits equal to budget
      const splitTotal = cleanedAllocations.reduce((s,a)=> s + Number(a.amount||0), 0)
      if (Math.round(splitTotal) !== Math.round(amountNum)) {
        toast.error('Payment source splits must equal the purchasing budget')
        return
      }
      const { data: budgetRow, error: budErr } = await upsertBudget(user.id, catId, amountNum, undefined, cleanedAllocations)
      if (budErr) { toast.error(budErr.message); return }

      setSelectedCategoryId(catId)
      setSelectedCategoryName(catName)
      setBudgetInfo({ amount: Number(budgetRow.amount || amountNum), id: budgetRow.id })
      setBankAllocations(Array.isArray(budgetRow?.allocations) ? budgetRow.allocations.map(a => ({ bank: a.bank, amount: Number(a.amount||0), source_id: a.source_id })) : cleanedAllocations)
      setShowSetupModal(false)
      toast.success('Shop category and budget saved')
    } catch (err) {
      console.error(err)
      toast.error('Failed to save setup')
    }
  }

  const handleExpenseAdded = async (expense) => {
    if (!user || !selectedCategoryId) return
    const { data, error } = await addExpense(user.id, {
      categoryId: selectedCategoryId,
      budgetId: activeKind === 'buying' ? budgetInfo.id : null,
      amount: expense.amount,
      note: expense.name,
      payee: expense.payee,
      kind: activeKind,
      spentAt: expense.date,
    })
    if (error) { toast.error(error.message); return }
    const mapped = { id: data.id, name: data.note || 'Item', payee: data.payee || null, amount: Number(data.amount||0), date: data.spent_at, kind: data.kind }
    if (mapped.kind === 'sale') {
      setExpensesSales([mapped, ...expensesSales])
    } else {
      setExpensesBuying([mapped, ...expensesBuying])
    }
    try { addRecentExpense(data) } catch {}
    setShowExpenseModal(false)
    setEditingExpense(null)
  }

  const handleExpenseEdited = async (expense) => {
    if (!user || !selectedCategoryId || !editingExpense) return
    const payload = {
      id: editingExpense.id,
      amount: expense.amount,
      note: expense.name,
      payee: expense.payee,
      kind: editingExpense.kind,
      spentAt: expense.date,
    }
    const { data, error } = await updateExpense(user.id, payload)
    if (error) { toast.error(error.message); return }
    const mapped = { id: data.id, name: data.note || 'Item', payee: data.payee || null, amount: Number(data.amount||0), date: data.spent_at, kind: data.kind, edited: Boolean(data.edited) }
    if (mapped.kind === 'sale') {
      setExpensesSales(prev => prev.map(e => e.id === mapped.id ? { ...mapped, edited: true } : e))
    } else {
      setExpensesBuying(prev => prev.map(e => e.id === mapped.id ? { ...mapped, edited: true } : e))
    }
    try { updateRecentExpense(data) } catch {}
    setEditingExpense(null)
    setShowExpenseModal(false)
  }

  const categoryOptions = useMemo(() => (categories || []).map(c => ({ id: String(c.id), name: c.name })), [categories])
  const displayName = (user?.user_metadata?.name || user?.email || '').split('@')[0]
  const remaining = Math.max(0, Number(budgetInfo.amount || 0) - (
    (expensesBuying || []).reduce((s,e)=>s+Number(e.amount||0),0) +
    (expensesSales || []).reduce((s,e)=>s+Number(e.amount||0),0)
  ))
  const overspent = Math.max(0, (
    (expensesBuying || []).reduce((s,e)=>s+Number(e.amount||0),0) +
    (expensesSales || []).reduce((s,e)=>s+Number(e.amount||0),0)
  ) - Number(budgetInfo.amount || 0))
  const applyFilters = (items, kind) => {
    const cfg = filters[kind] || {}
    const q = (cfg.search || '').trim().toLowerCase()
    const from = cfg.dateFrom ? new Date(cfg.dateFrom) : null
    const to = cfg.dateTo ? new Date(cfg.dateTo) : null
    if (from) from.setHours(0,0,0,0)
    if (to) to.setHours(23,59,59,999)

    return (items || []).filter(e => {
      const note = (e.name || '').toLowerCase()
      const payee = (e.payee || '').toLowerCase()
      const textOk = q ? (note.includes(q) || payee.includes(q)) : true
      const d = e.date ? new Date(e.date) : null
      const dateOk = (!from || (d && d >= from)) && (!to || (d && d <= to))
      return textOk && dateOk
    })
  }
  const filteredBuying = useMemo(() => applyFilters(expensesBuying,'buying'), [expensesBuying, filters.buying.search, filters.buying.dateFrom, filters.buying.dateTo])
  const filteredSales = useMemo(() => applyFilters(expensesSales,'sale'), [expensesSales, filters.sale.search, filters.sale.dateFrom, filters.sale.dateTo])

  const toggleDatePopover = (kind) => {
    setDatePopoverOpen(prev => ({ ...prev, [kind]: !prev[kind] }))
    // initialize from current filters when opening
    setDateDraft(prev => ({ ...prev, [kind]: { dateFrom: filters[kind].dateFrom || '', dateTo: filters[kind].dateTo || '' } }))
  }
  const applyDateRange = (kind) => {
    setFilters(prev => ({ ...prev, [kind]: { ...prev[kind], dateFrom: dateDraft[kind].dateFrom || '', dateTo: dateDraft[kind].dateTo || '' } }))
    setDatePopoverOpen(prev => ({ ...prev, [kind]: false }))
  }
  const clearDateRange = (kind) => {
    setDateDraft(prev => ({ ...prev, [kind]: { dateFrom: '', dateTo: '' } }))
    setFilters(prev => ({ ...prev, [kind]: { ...prev[kind], dateFrom: '', dateTo: '' } }))
    setDatePopoverOpen(prev => ({ ...prev, [kind]: false }))
  }

  const handleExportPdf = async (kind) => {
    const data = kind === 'buying' ? filteredBuying : filteredSales
    const title = `${selectedCategoryName || 'Shop'} • ${kind === 'buying' ? 'Purchase' : 'Sales'} Records`
    const lowerCat = (selectedCategoryName || '').toLowerCase()
    let labels
    if (lowerCat.includes('grocery')) {
      labels = kind === 'buying'
        ? { nameLabel: 'Item Name', payeeLabel: 'Shop', amountLabel: 'Amount (₹)', dateLabel: 'Purchase Date' }
        : { nameLabel: 'Sale Item', payeeLabel: 'Customer', amountLabel: 'Amount (₹)', dateLabel: 'Sale Date' }
    } else if (lowerCat.includes('garment') || lowerCat.includes('cloth')) {
      labels = kind === 'buying'
        ? { nameLabel: 'Garment Name', payeeLabel: 'Supplier', amountLabel: 'Amount (₹)', dateLabel: 'Purchase Date' }
        : { nameLabel: 'Garment Name', payeeLabel: 'Customer', amountLabel: 'Amount (₹)', dateLabel: 'Sale Date' }
    } else {
      labels = kind === 'buying'
        ? { nameLabel: 'Purchase Name', payeeLabel: 'Where/Who (shop)', amountLabel: 'Amount (₹)', dateLabel: 'Spent Date' }
        : { nameLabel: 'Sale Name', payeeLabel: 'Customer', amountLabel: 'Amount (₹)', dateLabel: 'Sale Date' }
    }
    const totalSpentAll = (expensesBuying || []).reduce((s,e)=>s+Number(e.amount||0),0) + (expensesSales || []).reduce((s,e)=>s+Number(e.amount||0),0)
    await exportExpensesPdf({
      title,
      user: { name: displayName, email: user?.email || '' },
      logoUrl: '/budgzyx.svg',
      records: data,
      kind,
      labels,
      budgetAmount: Number(budgetInfo.amount || 0),
      totalSpent: totalSpentAll,
    })
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-brand-dark">
      {/* Mobile header to match Home Building */}
      <div className="px-4 pt-6 pb-6 bg-brand-dark text-white shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/dashboard')} aria-label="Back" className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">←</button>
            <div>
              <p className="text-base font-semibold capitalize">{displayName}</p>
            </div>
          </div>
        <div className="flex items-center gap-3">
          <button className="relative p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Notifications" onClick={() => router.push('/dashboard/notifications')}>
            <Bell className="w-5 h-5" />
          </button>
          <button onClick={signOut} className="p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Sign out">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        </div>

        {/* First-time prompt to setup shop category and budget */}
        {!selectedCategoryId && (
          <div className="p-4 bg-white/10 rounded-xl shadow mb-4">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="w-5 h-5 text-[var(--brand-primary)]" />
              <h2 className="text-base font-semibold">Select Shop Store Categories</h2>
            </div>
            <p className="text-sm opacity-80 mb-3">Choose or type your shop category, then set purchasing budget.</p>
            <button type="button" onClick={() => setShowSetupModal(true)} className="px-3 py-2 rounded-md bg-brand-dark text-white">Start Setup</button>
          </div>
        )}

        {/* Category toggles (if multiple shops) */}
        {(shopCandidates.length > 0) && (
          <div className="mt-3 overflow-x-auto no-scrollbar">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {shopCandidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSelectedCategoryId(String(c.id)); setSelectedCategoryName(c.name || ''); }}
                    aria-pressed={String(selectedCategoryId)===String(c.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border focus:outline-none focus:ring-2 focus:ring-white/30 ${String(selectedCategoryId)===String(c.id) ? 'bg-white text-black border-white/60 shadow-sm' : 'bg-transparent text-white border-white/20 hover:bg-white/10'}`}
                  >{c.name}</button>
                ))}
              </div>
              <div className="ml-4 shrink-0">
                <button className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20" onClick={() => setShowSetupModal(true)} title="Setup New Shop Category">
                  <Plus className="w-3 h-3" />
                  New Shop Category
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Budget + Alert + Chart to match Home Building */}
        <div className="mt-6">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-brand-soft">Budget for</span>
              <span className="text-xs text-brand-soft font-medium">{selectedCategoryName || 'Shop Store'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-3xl text-[var(--amount-green)]">₹{Number(budgetInfo.amount||0).toLocaleString()}</span>
              <button
                type="button"
                onClick={openTopupModal}
                className="ml-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs ring-1 ring-white/20"
              >
                <IndianRupee className="w-3 h-3" />
                <span>Add to Budget</span>
              </button>
            </div>
          </div>

          {overspent > 0 ? (
            <div className="mt-3 p-3 rounded-xl bg-red-600/20 border border-red-500/40 text-red-100">
              <div className="flex items-center justify-between">
                <div className="text-sm">Overspent</div>
                <div className="font-extrabold text-2xl">₹{overspent.toLocaleString()}</div>
              </div>
            </div>
          ) : (
            <div className="mt-3 p-3 rounded-xl bg-green-600/20 border border-green-500/40 text-green-100">
              <div className="flex items-center justify-between">
                <div className="text-sm">Remaining</div>
                <div className="font-extrabold text-xl">₹{remaining.toLocaleString()}</div>
              </div>
            </div>
          )}

          <MiniSpendChart buyingExpenses={expensesBuying} labourExpenses={expensesSales} />

          {/* Payment Sources chips */}
          {bankAllocations && bankAllocations.length > 0 && (
            <div className="mt-3 p-3 bg-white/10 rounded-xl">
              <div className="text-xs text-white/80 mb-2">Payment Sources</div>
              <div className="flex flex-wrap gap-2">
                {bankAllocations.map((a, idx) => {
                  const total = Number(a.amount || 0)
                  const used = bankSpentMap.get(normalizeBankName(a.bank)) || 0
                  const remaining = Math.max(0, total - used)
                  const icon = bankIconSrc(a.bank)
                  return (
                    <div key={idx} className="min-w-[160px] max-w-[200px] px-3 py-2 rounded-lg bg-white/10 text-white text-xs ring-1 ring-white/20">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1 truncate">
                          {icon ? <img src={icon} alt="bank" className="w-4 h-4" /> : <span className="inline-block w-4 h-4 rounded-full bg-white/20" />}
                          <span className="font-semibold truncate">{a.bank}</span>
                        </div>
                        <button type="button" title="View details" onClick={() => openBankModal(a.bank)} className="p-1 rounded-md bg-white/10 hover:bg-white/20">
                          <Eye className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="leading-tight">
                        <div>Used ₹{Number(used).toLocaleString()} / ₹{Number(total).toLocaleString()}</div>
                        <div className="opacity-80">Remaining ₹{Number(remaining).toLocaleString()}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {topups.length > 0 && (
            <div className="mt-3 p-3 bg-white/10 rounded-xl">
              <div className="text-xs text-white/80 mb-2">Budget Additions</div>
              <div className="space-y-1">
                {topups.slice(0,3).map(t => (
                  <div key={t.id} className="flex items-center justify-between text-xs text-white/90">
                    <div className="truncate">
                      <span className="font-medium">₹{Number(t.amount).toLocaleString()}</span>
                      <span className="opacity-80"> • {t.reason}</span>
                      {t.type ? <span className="opacity-60"> • {t.type}</span> : null}
                    </div>
                    <div className="opacity-60">{new Date(t.date).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      
        {/* Action buttons: Add Purchase / Add Sales */}
        {selectedCategoryId && (
          <div className="mt-7 mb-6 grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => { setActiveKind('buying'); setShowExpenseModal(true) }}
              className="rounded-xl bg-brand-dark text-white py-3 ring-1 ring-[var(--brand-primary)]/30"
            >Add Purchase</button>
            <button
              type="button"
              onClick={() => { setActiveKind('sale'); setShowExpenseModal(true) }}
              className="rounded-xl bg-brand-dark text-white py-3 ring-1 ring-[var(--brand-primary)]/30"
            >Add Sales</button>
          </div>
        )}

        {/* Tabs: Buying / Sales lists with search */}
        <div ref={contentScrollRef} className="flex-1 overflow-y-auto pb-8 mt-3">
          <div className="mt-3 p-4 bg-white dark:bg-zinc-800 rounded-xl shadow text-black dark:text-white">
            <Tabs value={activeTab} onValueChange={(v)=>setActiveTab(v)} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="buying">Purchase Records</TabsTrigger>
                <TabsTrigger value="sale">Sales Records</TabsTrigger>
              </TabsList>

              <TabsContent value="buying" className="mt-4 space-y-4">
                <div className="mb-2">
                  <h3 className="font-semibold text-black dark:text-white">Purchase Record</h3>
                </div>
                <div className="relative flex items-center mb-3 gap-2">
                  <button type="button" onClick={() => toggleDatePopover('buying')} className="inline-flex items-center justify-center bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 hover:bg-gray-200" title="Filter by date" aria-label="Filter by date">
                    <Calendar className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => handleExportPdf('buying')} className="inline-flex items-center justify-center bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 hover:bg-gray-200" title="Export purchase records as PDF" aria-label="Export PDF">
                    <FileDown className="w-4 h-4" />
                  </button>
                  <div className="ml-auto flex items-center gap-2 bg-gray-100 dark:bg-zinc-700 rounded-md px-3 py-1 w-full max-w-xs">
                    <Search className="w-4 h-4 text-black dark:text-white" />
                    <input type="text" value={filters.buying.search} onChange={(e)=>setFilters(prev=>({ ...prev, buying: { search: e.target.value } }))} placeholder="Search" className="bg-transparent text-sm w-full outline-none text-black dark:text-white placeholder:text-gray-500 dark:placeholder:text-white/60" />
                  </div>
                  {datePopoverOpen.buying && (
                    <div className="absolute left-0 top-full mt-2 w-64 p-3 bg-white dark:bg-zinc-800 rounded-md shadow z-10">
                      <div className="text-sm font-medium mb-2 text-black dark:text-white">Date range</div>
                      <div className="space-y-2">
                        <input type="date" value={dateDraft.buying.dateFrom} onChange={(e)=>setDateDraft(prev=>({ ...prev, buying: { ...prev.buying, dateFrom: e.target.value } }))} className="w-full bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 text-xs" />
                        <input type="date" value={dateDraft.buying.dateTo} onChange={(e)=>setDateDraft(prev=>({ ...prev, buying: { ...prev.buying, dateTo: e.target.value } }))} className="w-full bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 text-xs" />
                        <div className="flex justify-end gap-2 pt-1">
                          <button type="button" onClick={()=>clearDateRange('buying')} className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200">Clear</button>
                          <button type="button" onClick={()=>applyDateRange('buying')} className="text-xs px-2 py-1 rounded-md bg-black text-white">Apply</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {filteredBuying.map((e) => (
                    <div key={e.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-black to-[var(--amount-green)] shadow-lg ring-1 ring-[var(--amount-green)]/30 flex items-center justify-center">
                          {CategoryIcon && (<CategoryIcon className="w-4 h-4 text-white" />)}
                        </div>
                        <div className="leading-tight">
                          <div className="text-sm font-medium">{e.name || 'Expense'}{e.edited && (<span className="ml-2 px-1.5 py-[1px] rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-700/20 dark:text-yellow-200 text-[10px]">edited</span>)}</div>
                          <div className="text-[11px] text-gray-700 dark:text-white/70">{selectedCategoryName}{e.payee ? ` • ${e.payee}` : ''}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="group p-1 rounded-md bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200"
                          title="Edit"
                          onClick={() => { setEditingExpense({ id: e.id, name: e.name, payee: e.payee || '', amount: e.amount, date: e.date, kind: 'buying' }); setActiveKind('buying'); setShowExpenseModal(true) }}
                        >
                          <span className="inline-block transition-transform duration-300 group-hover:rotate-12 group-active:-rotate-12">✎</span>
                        </button>
                        <div className="text-right leading-tight">
                          <div className="text-sm font-semibold text-[var(--amount-green)]">₹{Number(e.amount).toLocaleString()}</div>
                          <div className="text-[11px] text-gray-500">{new Date(e.date).toLocaleDateString()}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredBuying.length === 0 && (
                    <div className="text-sm text-gray-500">No buying expenses</div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="sale" className="mt-4 space-y-4">
                <div className="mb-2">
                  <h3 className="font-semibold text-black dark:text-white">Sales Record</h3>
                </div>
                <div className="relative flex items-center mb-3 gap-2">
                  <button type="button" onClick={() => toggleDatePopover('sale')} className="inline-flex items-center justify-center bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 hover:bg-gray-200" title="Filter by date" aria-label="Filter by date">
                    <Calendar className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => handleExportPdf('sale')} className="inline-flex items-center justify-center bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 hover:bg-gray-200" title="Export sales records as PDF" aria-label="Export PDF">
                    <FileDown className="w-4 h-4" />
                  </button>
                  <div className="ml-auto flex items-center gap-2 bg-gray-100 dark:bg-zinc-700 rounded-md px-3 py-1 w-full max-w-xs">
                    <Search className="w-4 h-4 text-black dark:text-white" />
                    <input type="text" value={filters.sale.search} onChange={(e)=>setFilters(prev=>({ ...prev, sale: { search: e.target.value } }))} placeholder="Search" className="bg-transparent text-sm w-full outline-none text-black dark:text-white placeholder:text-gray-500 dark:placeholder:text-white/60" />
                  </div>
                  {datePopoverOpen.sale && (
                    <div className="absolute left-0 top-full mt-2 w-64 p-3 bg-white dark:bg-zinc-800 rounded-md shadow z-10">
                      <div className="text-sm font-medium mb-2">Date range</div>
                      <div className="space-y-2">
                        <input type="date" value={dateDraft.sale.dateFrom} onChange={(e)=>setDateDraft(prev=>({ ...prev, sale: { ...prev.sale, dateFrom: e.target.value } }))} className="w-full bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 text-xs" />
                        <input type="date" value={dateDraft.sale.dateTo} onChange={(e)=>setDateDraft(prev=>({ ...prev, sale: { ...prev.sale, dateTo: e.target.value } }))} className="w-full bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 text-xs" />
                        <div className="flex justify-end gap-2 pt-1">
                          <button type="button" onClick={()=>clearDateRange('sale')} className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200">Clear</button>
                          <button type="button" onClick={()=>applyDateRange('sale')} className="text-xs px-2 py-1 rounded-md bg-black text-white">Apply</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {filteredSales.map((e) => (
                    <div key={e.id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-black to-[var(--amount-green)] shadow-lg ring-1 ring-[var(--amount-green)]/30 flex items-center justify-center">
                          {CategoryIcon && (<CategoryIcon className="w-4 h-4 text-white" />)}
                        </div>
                        <div className="leading-tight">
                          <div className="text-sm font-medium">{e.name || 'Sale'}{e.edited && (<span className="ml-2 px-1.5 py-[1px] rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-700/20 dark:text-yellow-200 text-[10px]">edited</span>)}</div>
                          <div className="text-[11px] text-gray-700 dark:text-white/70">{selectedCategoryName}{e.payee ? ` • ${e.payee}` : ''}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="group p-1 rounded-md bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200"
                          title="Edit"
                          onClick={() => { setEditingExpense({ id: e.id, name: e.name, payee: e.payee || '', amount: e.amount, date: e.date, kind: 'sale' }); setActiveKind('sale'); setShowExpenseModal(true) }}
                        >
                          <span className="inline-block transition-transform duration-300 group-hover:rotate-12 group-active:-rotate-12">✎</span>
                        </button>
                        <div className="text-right leading-tight">
                          <div className="text-sm font-semibold text-[var(--amount-green)]">₹{Number(e.amount).toLocaleString()}</div>
                          <div className="text-[11px] text-gray-500">{new Date(e.date).toLocaleDateString()}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredSales.length === 0 && (
                    <div className="text-sm text-gray-500">No sales expenses</div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Initial Budget form modal (shown when no budget set yet) */}
        {showBudgetForm && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
            <div className="w-full max-w-md bg-white dark:bg-zinc-800 rounded-t-2xl md:rounded-2xl shadow-lg p-4 text-black dark:text-white max-h-[85vh] overflow-y-auto thin-scrollbar">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-black dark:text-white">Set Budget</h4>
                <button onClick={() => setShowBudgetForm(false)} aria-label="Close" className="p-2 rounded-full bg-gray-200 dark:bg-zinc-700">✕</button>
              </div>
              <form onSubmit={handleSetBudget} className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="text-sm font-medium text-black dark:text-white">Budget of Purchasing (₹)</label>
                  <input name="budget" type="number" min="0" step="0.01" className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white placeholder:text-black/70 dark:placeholder:text-black/70 caret-black" placeholder="e.g. 500000" defaultValue={budgetInfo.amount || ''} />
                </div>
                <button type="submit" className="px-3 py-2 rounded-md bg-brand-dark text-white">Save Budget</button>
              </form>
            </div>
          </div>
        )}

        {/* Add to Budget Modal (top-up) */}
        {showTopupModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
            <div className="w-full max-w-md bg-white dark:bg-zinc-800 rounded-t-2xl md:rounded-2xl shadow-lg p-4 text-black dark:text-white">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-black dark:text-white">Add to Budget</h4>
                <button onClick={() => setShowTopupModal(false)} aria-label="Close" className="p-2 rounded-full bg-gray-200 dark:bg-zinc-700">✕</button>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-black dark:text-white">Amount (₹)</label>
                  <input type="number" min="0" step="0.01" value={topupForm.amount} onChange={(e)=>setTopupForm(prev=>({...prev, amount: e.target.value}))} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 text-black dark:text-white placeholder:text-black/70 dark:placeholder:text-black/70 caret-black" placeholder="e.g. 10,000" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-black dark:text-white">Date</label>
                  <input type="date" value={topupForm.date} onChange={(e)=>setTopupForm(prev=>({...prev, date: e.target.value}))} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 text-black dark:text-white caret-black" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-black dark:text-white">Reason</label>
                  <input type="text" value={topupForm.reason} onChange={(e)=>setTopupForm(prev=>({...prev, reason: e.target.value}))} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 text-black dark:text-white placeholder:text-black/70 dark:placeholder:text-black/70 caret-black" placeholder="e.g. Extra funds, bonus, correction" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-black dark:text-white">Type</label>
                  <input type="text" value={topupForm.type} onChange={(e)=>setTopupForm(prev=>({...prev, type: e.target.value}))} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 text-black dark:text-white placeholder:text-black/70 dark:placeholder:text-black/70 caret-black" placeholder="e.g. Cash, Bank transfer" />
                </div>
                <button type="button" onClick={handleTopupSubmit} disabled={addingTopup} className="w-full rounded-md bg-brand-dark text-white py-2 ring-1 ring-[var(--brand-primary)]/30 disabled:opacity-60">
                  {addingTopup ? 'Adding...' : 'Add Amount'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Initial Setup Modal: select/type category + purchasing budget */}
        {showSetupModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
            <div className="w-full max-w-md bg-white dark:bg-zinc-800 rounded-t-2xl md:rounded-2xl shadow-lg p-4 text-black dark:text-white">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-black dark:text-white">Setup Shop Category & Budget</h4>
                <button onClick={() => setShowSetupModal(false)} aria-label="Close" className="p-2 rounded-full bg-gray-200 dark:bg-zinc-700">✕</button>
              </div>
              <form onSubmit={handleInitialSetup} className="space-y-4">
                <div className="text-sm font-medium text-black dark:text-white">Choose how to set category</div>
                <div className="flex items-center gap-4">
                  <label className="text-sm flex items-center gap-2 text-black dark:text-white">
                    <input type="radio" name="setupMode" checked={setupMode==='template'} onChange={()=>setSetupMode('template')} />
                    Use Template
                  </label>
                  <label className="text-sm flex items-center gap-2 text-black dark:text-white">
                    <input type="radio" name="setupMode" checked={setupMode==='custom'} onChange={()=>setSetupMode('custom')} />
                    Type Custom
                  </label>
                </div>

                {setupMode === 'template' ? (
                  <div>
                    <label className="text-sm font-medium text-black dark:text-white">Shop Category (Template)</label>
                    <select value={setupTemplateName} onChange={(e)=>setSetupTemplateName(e.target.value)} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white">
                      <option value="">Choose…</option>
                      {SHOP_TEMPLATES.map(name => (<option key={name} value={name}>{name}</option>))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="text-sm font-medium text-black dark:text-white">Shop Category (Custom)</label>
                    <input type="text" value={setupNewName} onChange={(e)=>setSetupNewName(e.target.value)} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white placeholder:text-black/70 dark:placeholder:text-black/70 caret-black" placeholder="e.g. Grocery Shop" />
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-black dark:text-white">Budget of Purchasing (₹)</label>
                  <input type="number" min="0" step="0.01" value={setupBudgetAmount} onChange={(e)=>setSetupBudgetAmount(e.target.value)} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white placeholder:text-black/70 dark:placeholder:text-black/70 caret-black" placeholder="e.g. 500000" />
                </div>

                {/* Payment Sources & Bank Splits (like Home Building) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-black dark:text-white">Payment Sources Allocation</div>
                    <button type="button" onClick={()=> setSetupAllocations(prev => [...prev, { bank: '', amount: '', other: '' }])} className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs ring-1 ring-white/20">+ Add Split</button>
                  </div>
                  <div className="space-y-2">
                    {setupAllocations.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_auto] gap-2 items-end">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-black dark:text-white">Bank</label>
                            <div className="flex items-center gap-2">
                              {bankIconSrc(row.bank === 'Other' ? row.other : row.bank) ? (
                                <img src={bankIconSrc(row.bank === 'Other' ? row.other : row.bank)} alt="bank" className="w-5 h-5" />
                              ) : (
                                <span className="inline-block w-5 h-5 rounded-full bg-white/20" />
                              )}
                              <select value={row.bank} onChange={(e)=>{
                                const v = e.target.value
                                setSetupAllocations(prev => prev.map((r,i)=> i===idx ? { ...r, bank: v } : r))
                              }} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white">
                                <option value="">Select bank…</option>
                                <option value="HDFC">HDFC</option>
                                <option value="SBI">SBI</option>
                                <option value="ICICI">ICICI</option>
                                <option value="Bank of Baroda">Bank of Baroda</option>
                                <option value="Bank of India">Bank of India</option>
                                <option value="Central Bank of India">Central Bank of India</option>
                                <option value="Other">Other (custom)</option>
                              </select>
                            </div>
                            {row.bank === 'Other' && (
                              <input type="text" value={row.other} onChange={(e)=>{
                                const v = e.target.value
                                setSetupAllocations(prev => prev.map((r,i)=> i===idx ? { ...r, other: v } : r))
                              }} className="mt-2 w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white" placeholder="Custom bank name" />
                            )}
                          </div>
                          <div>
                            <label className="text-xs text-black dark:text-white">Amount (₹)</label>
                            <input type="number" min="0" step="0.01" value={row.amount} onChange={(e)=>{
                              const v = e.target.value
                              setSetupAllocations(prev => prev.map((r,i)=> i===idx ? { ...r, amount: v } : r))
                            }} className={`w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white placeholder:text-black/70 dark:placeholder:text-black/70 caret-black ${overBudget ? 'ring-1 ring-red-400' : (underBudget ? 'ring-1 ring-amber-400' : '')}` } placeholder="e.g. 350000" />
                          </div>
                        </div>
                        <button type="button" onClick={()=> setSetupAllocations(prev => prev.filter((_,i)=> i!==idx))} className="px-2 py-2 rounded-md bg-gray-200 dark:bg-zinc-700 text-black dark:text-white text-xs">Remove</button>
                      </div>
                    ))}
                    <button type="button" onClick={()=> setSetupAllocations(prev => [...prev, { bank: '', amount: '', other: '' }])} className="px-3 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs w-full">+ Add Another Split</button>
                    <div className="mt-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="opacity-80">Split total: ₹{Number(setupAllocSum).toLocaleString()} • Budget: ₹{Number(setupBudgetNum).toLocaleString()}</span>
                        {setupBudgetNum > 0 && (
                          overBudget ? (
                            <span className="text-red-500">Exceeds by ₹{Number(setupAllocSum - setupBudgetNum).toLocaleString()}</span>
                          ) : underBudget ? (
                            <span className="text-amber-400">Short by ₹{Number(setupBudgetNum - setupAllocSum).toLocaleString()}</span>
                          ) : (
                            <span className="text-green-500">Perfectly matched</span>
                          )
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-black/70 dark:text-white/70">Add as many banks as needed. This matches the Home Building split design.</p>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={()=>setShowSetupModal(false)} className="px-3 py-2 rounded-md bg-gray-200 dark:bg-zinc-700 text-black dark:text-white">Cancel</button>
                  <button type="submit" className="px-3 py-2 rounded-md bg-brand-dark text-white">Save</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Bank details modal */}
        {bankModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
            <div className="w-full max-w-md bg-white dark:bg-zinc-800 rounded-t-2xl md:rounded-2xl shadow-lg p-4 text-black dark:text-white">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-black dark:text-white">{selectedBank ? `${selectedBank} Details` : 'Bank Details'}</h4>
                <button onClick={closeBankModal} aria-label="Close" className="p-2 rounded-full bg-gray-200 dark:bg-zinc-700">✕</button>
              </div>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {bankExpenseList.length > 0 ? bankExpenseList.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <div className="truncate pr-2">{item.name}</div>
                    <div className="font-medium">₹{Number(item.amount).toLocaleString()}</div>
                  </div>
                )) : (
                  <div className="text-sm text-gray-500">No expenses for this bank</div>
                )}
              </div>
              <div className="mt-3 p-3 rounded-xl bg-white/10 dark:bg-zinc-700">
                <div className="flex items-center justify-between">
                  <div className="text-sm">Total Used</div>
                  <div className="font-extrabold text-xl">₹{Number(bankExpenseTotal).toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Expense Modal */}
        {showExpenseModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
            <div className="w-full max-w-md bg-white dark:bg-zinc-800 rounded-t-2xl md:rounded-2xl shadow-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold">{editingExpense ? 'Edit Expense' : (activeKind === 'sale' ? 'Add New Sales' : 'Add New Purchase')}</h4>
                <button onClick={() => { setShowExpenseModal(false); setEditingExpense(null) }} aria-label="Close" className="p-2 rounded-full bg-gray-200 dark:bg-zinc-700">✕</button>
              </div>
              <ExpenseForm 
                categoryId={selectedCategoryId}
                onExpenseAdded={handleExpenseAdded}
                onExpenseEdited={handleExpenseEdited}
                initialExpense={editingExpense ? { id: editingExpense.id, name: editingExpense.name, payee: editingExpense.payee || '', amount: editingExpense.amount, date: editingExpense.date } : undefined}
                mode={editingExpense ? 'edit' : 'add'}
                kind={editingExpense ? editingExpense.kind : activeKind}
                payeeLabel={activeKind === 'sale' ? 'Customer' : 'Where/Who (shop)'}
                categoryName={selectedCategoryName}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ShopPage