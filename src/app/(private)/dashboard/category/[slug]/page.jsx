"use client"
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import client from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { getCategoryBySlug, getBudgetForMonth, upsertBudget, listExpenses, addExpense, updateExpense } from '@/api/db'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import LoadingOverlay from '@/app/components/LoadingOverlay'

// Import budget components
import BudgetForm from '@/app/components/budget/BudgetForm'
import ExpenseForm from '@/app/components/budget/ExpenseForm'
import MiniSpendChart from '@/app/components/budget/MiniSpendChart'
import { useDashboardData } from '@/hooks/useDashboardData'
// Mobile redesign uses custom list rows instead of table summary
import { Bell, LogOut, Home as HomeIcon, ShoppingCart, CreditCard, User, MoreHorizontal, Plus, X, Search, Calendar, AlertCircle, AlertTriangle, PlusCircle, Pencil, IndianRupee, FileDown, Eye } from 'lucide-react'
import { exportExpensesPdf } from '@/lib/pdf'

const CategoryPage = () => {
  const router = useRouter()
  const params = useParams()
  const { user, loading, signOut } = useAuth()
  const { addRecentExpense, updateRecentExpense, getCategoryData, setCategoryData, setCategoryBudgets } = useDashboardData()
  const slug = params.slug
  const [category, setCategory] = useState(null) // { id: dbId, name, slug }
  const displayName = (user?.user_metadata?.name || user?.email || '').split('@')[0]
  const initials = (user?.user_metadata?.name || displayName || 'U').charAt(0).toUpperCase()

  // Budget state
  const [budget, setBudget] = useState(0)
  const [budgetId, setBudgetId] = useState(null)
  const [expensesBuying, setExpensesBuying] = useState([])
  const [expensesLabour, setExpensesLabour] = useState([])
  const [topups, setTopups] = useState([])
  const [bankAllocations, setBankAllocations] = useState([]) // [{bank, amount}]
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [budgetLoading, setBudgetLoading] = useState(true)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [showTopupModal, setShowTopupModal] = useState(false)
  const [topupForm, setTopupForm] = useState({ amount: '', date: '', reason: '', type: '', bankChoice: '', customBank: '', hdfcAmt: '', sbiAmt: '', iciciAmt: '', otherAmt: '' })
  const [addingTopup, setAddingTopup] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [activeKind, setActiveKind] = useState('buying')
  const [filters, setFilters] = useState({
    buying: { search: '', dateFrom: '', dateTo: '' },
    labour: { search: '', dateFrom: '', dateTo: '' }
  })
  const [dateDraft, setDateDraft] = useState({
    buying: { dateFrom: '', dateTo: '' },
    labour: { dateFrom: '', dateTo: '' }
  })
  // Track which tab is selected in the category page
  const [activeTab, setActiveTab] = useState('buying')
  const [datePopoverOpen, setDatePopoverOpen] = useState({ buying: false, labour: false })
  // Bank details modal state
  const [bankModalOpen, setBankModalOpen] = useState(false)
  const [selectedBank, setSelectedBank] = useState(null)
  const openBankModal = (bankName) => { setSelectedBank(bankName); setBankModalOpen(true) }
  const closeBankModal = () => setBankModalOpen(false)

  // Loader visibility with minimum display time
  const [overlayVisible, setOverlayVisible] = useState(true)
  const overlayStartRef = useRef(0)

  // Derived totals for budget alert in the top bar
  const isHomeBuilding = (category?.name || '').toLowerCase().includes('home')
  // Budget period (defaults to current month until budget loads)
  const [periodDate, setPeriodDate] = useState(null)
  const activePeriod = periodDate ? new Date(periodDate) : new Date()
  // Restrict totals to the active budget period
  const monthStart = new Date(activePeriod.getFullYear(), activePeriod.getMonth(), 1)
  const monthEnd = new Date(activePeriod.getFullYear(), activePeriod.getMonth() + 1, 1)
  const sumThisMonth = (items) => (items || []).reduce((sum, e) => {
    const d = e?.date ? new Date(e.date) : null
    if (d && d >= monthStart && d < monthEnd) {
      return sum + Number(e.amount || 0)
    }
    return sum
  }, 0)
  const totalBuying = sumThisMonth(expensesBuying)
  const totalLabourRaw = sumThisMonth(expensesLabour)
  const totalLabour = isHomeBuilding ? totalLabourRaw : 0
  const totalSpent = totalBuying + totalLabour
  const overspent = Math.max(0, totalSpent - Number(budget || 0))
  const remaining = Math.max(0, Number(budget || 0) - totalSpent)
  // Dynamic labels for chart legend and titles based on category name
  const inferLabels = (name) => {
    const n = String(name || '').toLowerCase()
    if (n.includes('shop') || n.includes('store')) return { primary: 'Purchase', secondary: 'Sales' }
    if (n.includes('grocery')) return { primary: 'Groceries', secondary: 'Other' }
    if (n.includes('personal')) return { primary: 'Personal', secondary: 'Other' }
    if (n.includes('subscription')) return { primary: 'Subscriptions', secondary: 'Other' }
    if (n.includes('other')) return { primary: 'Expenses', secondary: 'Misc' }
    if (n.includes('home')) return { primary: 'Buying', secondary: 'Labour' }
    return { primary: 'Buying', secondary: isHomeBuilding ? 'Labour' : 'Other' }
  }
  const { primary: buyingLabel, secondary: labourLabel } = inferLabels(category?.name || '')
  const dominantKind = totalBuying >= totalLabour ? buyingLabel : labourLabel
  const dominantAmount = totalBuying >= totalLabour ? totalBuying : totalLabour

  // Per-bank spending (current month) based on tag in note: [Bank: NAME]
  const parseBankTag = (note) => {
    const s = String(note || '')
    const m = s.match(/\[Bank:\s*([^\]]+)\]/i)
    return m ? m[1].trim() : null
  }
  const normalizeBankName = (name) => String(name || '').trim().toUpperCase()
  const stripBankAndSplitTags = (note) => String(note || '').replace(/\s*\[Bank:[^\]]+\]\s*/ig,'').replace(/\s*\[Split:[^\]]+\]\s*/ig,'').trim()
  const bankSpentMap = useMemo(() => {
    const map = new Map()
    const all = [...(expensesBuying||[]), ...(expensesLabour||[])]
    all.forEach(e => {
      const d = e?.date ? new Date(e.date) : null
      const inPeriod = d && d >= monthStart && d < monthEnd
      const matchesBudget = e?.budgetId && budgetId && String(e.budgetId) === String(budgetId)
      if (!inPeriod && !matchesBudget) return
      const splits = parseTopupSplits(e.name)
      if (splits.length > 0) {
        splits.forEach(s => {
          const key = normalizeBankName(s.bank)
          map.set(key, (map.get(key) || 0) + Number(s.amount || 0))
        })
      } else {
        const tag = parseBankTag(e.name)
        if (!tag) return
        const key = normalizeBankName(tag)
        map.set(key, (map.get(key) || 0) + Number(e.amount || 0))
      }
    })
    return map
  }, [expensesBuying, expensesLabour, monthStart.getTime(), monthEnd.getTime(), budgetId])

  // Build expense list for the selected bank for modal view
  const bankExpenseList = useMemo(() => {
    if (!selectedBank) return []
    const key = normalizeBankName(selectedBank)
    const out = []
    const all = [...(expensesBuying||[]), ...(expensesLabour||[])]
    all.forEach(e => {
      const d = e?.date ? new Date(e.date) : null
      const inPeriod = d && d >= monthStart && d < monthEnd
      const matchesBudget = e?.budgetId && budgetId && String(e.budgetId) === String(budgetId)
      if (!inPeriod && !matchesBudget) return
      const splits = parseTopupSplits(e.name)
      if (splits.length > 0) {
        const m = splits.find(s => normalizeBankName(s.bank) === key)
        if (m) out.push({ id: e.id, name: e.name, amount: Number(m.amount||0), date: e.date })
      } else {
        const tag = parseBankTag(e.name)
        if (tag && normalizeBankName(tag) === key) {
          out.push({ id: e.id, name: e.name, amount: Number(e.amount||0), date: e.date })
        }
      }
    })
    return out
  }, [selectedBank, expensesBuying, expensesLabour, monthStart.getTime(), monthEnd.getTime(), budgetId])

  const bankExpenseTotal = useMemo(() => bankExpenseList.reduce((sum, e) => sum + Number(e.amount||0), 0), [bankExpenseList])

  // Used amount derived from payment sources (sum of per-bank used)
  const usedFromBanks = useMemo(() => {
    if (!Array.isArray(bankAllocations) || bankAllocations.length === 0) return 0
    return bankAllocations.reduce((sum, a) => sum + (bankSpentMap.get(normalizeBankName(a.bank)) || 0), 0)
  }, [bankAllocations, bankSpentMap])
  const remainingBank = Math.max(0, Number(budget || 0) - usedFromBanks)
  const overspentBank = Math.max(0, usedFromBanks - Number(budget || 0))

  // Parse split banks from a note format: "... [Split: HDFC=2000;SBI=1500;ICICI=1000;Custom=500]"
  function parseTopupSplits(note) {
    const s = String(note || '')
    const m = s.match(/\[Split:\s*([^\]]+)\]/i)
    if (!m) return []
    const body = m[1]
    return body.split(';').map(tok => tok.trim()).filter(Boolean).map(tok => {
      const [bank, amtStr] = tok.split('=')
      const amt = Number(amtStr || 0)
      return { bank: (bank || '').trim(), amount: isNaN(amt) ? 0 : amt }
    }).filter(x => x.bank && x.amount > 0)
  }

  useEffect(() => {
    const loadData = async () => {
      try {
        if (!user) return
        // 1) Show cached immediately if available
        const cached = getCategoryData(slug)
        if (cached) {
          setCategory(cached.category || null)
          setBudget(cached.budget || 0)
          setBudgetId(cached.budgetId || null)
          setShowBudgetForm(Boolean(cached.showBudgetForm))
          setExpensesBuying(cached.expensesBuying || [])
          setExpensesLabour(cached.expensesLabour || [])
          setTopups(cached.topups || [])
          setBankAllocations(cached.bankAllocations || [])
          setOverlayVisible(false)
          setBudgetLoading(false)
        } else {
          overlayStartRef.current = Date.now()
          setOverlayVisible(true)
          setBudgetLoading(true)
        }

        // 2) Refresh in background to get latest
        const { data: cat, error: catErr } = await getCategoryBySlug(user.id, slug)
        if (catErr || !cat) {
          if (!cached) toast.error('Category not found')
          setBudgetLoading(false)
          return
        }
        setCategory(cat)

        const { data: budgetRow } = await getBudgetForMonth(user.id, cat.id)
        if (budgetRow) {
          setBudget(budgetRow.amount)
          setBudgetId(budgetRow.id)
          // Align UI period to the budget’s month
          setPeriodDate(budgetRow.sourcePeriod || budgetRow.period)
          setShowBudgetForm(false)
          if (Array.isArray(budgetRow.allocations)) {
            setBankAllocations(budgetRow.allocations.map(a => ({ bank: a.bank, amount: a.amount, source_id: a.source_id })))
          }
        } else {
          setBudget(0)
          setBudgetId(null)
          setShowBudgetForm(true)
        }

        const [
          { data: buyRows },
          { data: labRows },
          { data: topupRows }
        ] = await Promise.all([
          listExpenses(user.id, cat.id, 'buying'),
          listExpenses(user.id, cat.id, 'labour'),
          listExpenses(user.id, cat.id, 'topup')
        ])
        const buyMapped = (buyRows || []).map(e => ({ id: e.id, name: e.note || 'Expense', payee: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'buying', edited: Boolean(e.edited), budgetId: e.budget_id }))
        const labMapped = (labRows || []).map(e => ({ id: e.id, name: e.note || 'Expense', payee: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'labour', edited: Boolean(e.edited), budgetId: e.budget_id }))
        const topMapped = (topupRows || []).map(e => ({ id: e.id, reason: e.note || 'Added amount', type: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'topup' }))
        setExpensesBuying(buyMapped)
        setExpensesLabour(labMapped)
        setTopups(topMapped)

        // Build notifications for this category
        const newNotifications = []
        const totalSpentNow = (buyMapped || []).reduce((s,e)=>s+Number(e.amount||0),0) + (labMapped || []).reduce((s,e)=>s+Number(e.amount||0),0)
        const overspentNow = Math.max(0, totalSpentNow - Number(budgetRow?.amount || 0))
        if (overspentNow > 0) {
          newNotifications.push({
            id: `overspend-${cat.slug}`,
            type: 'overspend',
            title: `Overspent in ${cat.name}`,
            message: `Exceeded by ₹${overspentNow.toLocaleString()}. Spent ₹${totalSpentNow.toLocaleString()} of ₹${Number(budgetRow?.amount||0).toLocaleString()}.`,
            categorySlug: cat.slug,
            severity: 'danger',
            date: new Date().toISOString(),
          })
        }
        const sevenDaysAgoTs = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recentCount = ([...(buyMapped||[]), ...(labMapped||[])]).filter(e => {
          const dTs = e.date ? new Date(e.date).getTime() : null
          return dTs && dTs >= sevenDaysAgoTs
        }).length
        if (recentCount >= 5) {
          newNotifications.push({
            id: `freq-${cat.slug}`,
            type: 'frequent',
            title: `Frequent spending`,
            message: `${recentCount} expenses in the last 7 days.`,
            categorySlug: cat.slug,
            severity: 'warning',
            date: new Date().toISOString(),
          })
        }
        const twoDaysAgoTs = Date.now() - 2 * 24 * 60 * 60 * 1000;
        (topMapped || []).filter(t => {
          const dTs = t.date ? new Date(t.date).getTime() : null
          return dTs && dTs >= twoDaysAgoTs
        }).forEach(t => {
          newNotifications.push({
            id: `topup-${t.id}`,
            type: 'topup',
            title: `Budget increased`,
            message: `Added ₹${Number(t.amount).toLocaleString()} • ${t.reason}`,
            categorySlug: cat.slug,
            severity: 'info',
            date: t.date || new Date().toISOString(),
          })
        })
        setNotifications(newNotifications)

        // 3) Save to shared cache so revisits are instant
        setCategoryData(slug, {
          category: cat,
          budget: budgetRow?.amount || 0,
          budgetId: budgetRow?.id || null,
          showBudgetForm: !budgetRow,
          expensesBuying: buyMapped,
          expensesLabour: labMapped,
          topups: topMapped,
        })
      } finally {
        setBudgetLoading(false)
      }
    }
    if (slug && user) {
      loadData()
    }
  }, [slug, user?.id])

  // Enforce 1.5s minimum loader visibility while loading
  useEffect(() => {
    const isBusy = loading || budgetLoading
    if (isBusy) {
      if (!overlayStartRef.current) overlayStartRef.current = Date.now()
      setOverlayVisible(true)
      return
    }
    const elapsed = Date.now() - (overlayStartRef.current || Date.now())
    const MIN_MS = 1500
    if (elapsed < MIN_MS) {
      const id = setTimeout(() => setOverlayVisible(false), MIN_MS - elapsed)
      return () => clearTimeout(id)
    } else {
      setOverlayVisible(false)
    }
  }, [loading, budgetLoading])

  const handleSignOut = async () => {
    try {
      await signOut('local')
      toast.success('Signed out')
      router.replace('/')
    } catch (err) {
      toast.warning('Signed out locally')
      router.replace('/')
    }
  }

  const handleBudgetSet = async (payload) => {
    if (!category || !user) return
    const amountInput = typeof payload === 'number' ? payload : Number(payload?.amount || 0)
    const allocations = (typeof payload === 'object' && Array.isArray(payload.allocations)) ? payload.allocations : []
    const allocTotal = allocations.reduce((s,a)=> s + Number(a?.amount || 0), 0)
    const amountToSave = allocations.length > 0 ? allocTotal : amountInput
    const { data, error } = await upsertBudget(user.id, category.id, amountToSave, undefined, allocations)
    if (error) {
      console.error(error)
      toast.error(error.message)
      return
    }
    setBudget(data.amount)
    setBudgetId(data.id)
    setShowBudgetForm(false)
    // Prefer server-confirmed allocations if present (with source_id)
    setBankAllocations(Array.isArray(data?.allocations) ? data.allocations.map(a => ({ bank: a.bank, amount: a.amount, source_id: a.source_id })) : allocations)
    // update cache
    setCategoryData(slug, { budget: data.amount, budgetId: data.id, showBudgetForm: false, bankAllocations: Array.isArray(data?.allocations) ? data.allocations.map(a => ({ bank: a.bank, amount: a.amount, source_id: a.source_id })) : allocations })
    // also update shared dashboard budgets so totals reflect instantly
    try {
      setCategoryBudgets(prev => {
        const list = Array.isArray(prev) ? prev : []
        const exists = list.some(b => b.slug === category.slug)
        return exists
          ? list.map(b => (b.slug === category.slug ? { ...b, amount: data.amount } : b))
          : [{ name: category.name, slug: category.slug, amount: data.amount }, ...list]
      })
    } catch {}
    toast.success(`Budget updated to ₹${Number(data.amount||0).toLocaleString()} based on Payment Sources`)
  }

  const handleExpenseAdded = async (expense) => {
    if (!category || !user) return
    // Build note with either a single bank tag or a split tag
    const hasSplits = Array.isArray(expense.bankSplits) && expense.bankSplits.length > 0
    const splitTag = hasSplits
      ? ` [Split: ${expense.bankSplits.map(s => `${String(s.bank).trim()}=${Number(s.amount||0)}`).join(';')}]`
      : ''
    const bankTag = (!hasSplits && expense.bankName && String(expense.bankName).trim()) ? ` [Bank: ${String(expense.bankName).trim()}]` : ''
    const baseName = stripBankAndSplitTags(expense.name)
    const noteWithBank = `${baseName}${splitTag || bankTag}`
    const { data, error } = await addExpense(user.id, { categoryId: category.id, budgetId, amount: expense.amount, note: noteWithBank, payee: expense.payee, kind: expense.kind, spentAt: expense.date })
    if (error) {
      console.error(error)
      toast.error(error.message)
      return
    }
    const mapped = { id: data.id, name: data.note || 'Expense', payee: data.payee || null, amount: data.amount, date: data.spent_at, kind: data.kind, edited: Boolean(data.edited), budgetId: data.budget_id }
    if (mapped.kind === 'labour') {
      setExpensesLabour([mapped, ...expensesLabour])
      setCategoryData(slug, { expensesLabour: [mapped, ...(expensesLabour || [])] })
    } else {
      setExpensesBuying([mapped, ...expensesBuying])
      setCategoryData(slug, { expensesBuying: [mapped, ...(expensesBuying || [])] })
    }
    // Update global recent cache so dashboard reflects this change without full reload
    try { addRecentExpense(data) } catch {}
    // Close modal on successful add
    setShowExpenseModal(false)

    // Refresh expenses from API to ensure real-time totals and chips update
    try {
      const [ { data: buyRows }, { data: labRows } ] = await Promise.all([
        listExpenses(user.id, category.id, 'buying'),
        listExpenses(user.id, category.id, 'labour')
      ])
      const buyMapped2 = (buyRows || []).map(e => ({ id: e.id, name: e.note || 'Expense', payee: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'buying', edited: Boolean(e.edited), budgetId: e.budget_id }))
      const labMapped2 = (labRows || []).map(e => ({ id: e.id, name: e.note || 'Expense', payee: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'labour', edited: Boolean(e.edited), budgetId: e.budget_id }))
      setExpensesBuying(buyMapped2)
      setExpensesLabour(labMapped2)
    } catch (e) {
      console.warn('Failed to refresh expenses after add', e)
    }

    // Frequent spending trigger after new expense
    const sevenDaysAgoTs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentCount = ([...expensesBuying, ...expensesLabour]).filter(e => {
      const dTs = e.date ? new Date(e.date).getTime() : null
      return dTs && dTs >= sevenDaysAgoTs
    }).length
    if (recentCount >= 5) {
      setNotifications(prev => ([
        ...prev.filter(n => !n.id?.startsWith('freq-')),
        { id: `freq-${category.slug}`, type: 'frequent', title: 'Frequent spending', message: `${recentCount} expenses in the last 7 days.`, categorySlug: category.slug, severity: 'warning', date: new Date().toISOString() }
      ]))
    }
  }

  const handleExpenseEdited = async (expense) => {
    if (!category || !user || !editingExpense) return
    const hasSplits = Array.isArray(expense.bankSplits) && expense.bankSplits.length > 0
    const splitTag = hasSplits
      ? ` [Split: ${expense.bankSplits.map(s => `${String(s.bank).trim()}=${Number(s.amount||0)}`).join(';')}]`
      : ''
    const bankTag = (!hasSplits && expense.bankName && String(expense.bankName).trim()) ? ` [Bank: ${String(expense.bankName).trim()}]` : ''
    const baseName = stripBankAndSplitTags(expense.name)
    const noteWithBank = `${baseName}${splitTag || bankTag}`
    const payload = {
      id: editingExpense.id,
      amount: expense.amount,
      note: noteWithBank,
      payee: expense.payee,
      kind: editingExpense.kind,
      spentAt: expense.date,
    }
    const { data, error } = await updateExpense(user.id, payload)
    if (error) {
      console.error(error)
      toast.error(error.message)
      return
    }
    const mapped = { id: data.id, name: data.note || 'Expense', payee: data.payee || null, amount: data.amount, date: data.spent_at, kind: data.kind, edited: Boolean(data.edited), budgetId: data.budget_id }
    if (mapped.kind === 'labour') {
      setExpensesLabour(prev => prev.map(e => e.id === mapped.id ? { ...mapped, edited: true } : e))
      setCategoryData(slug, { expensesLabour: (expensesLabour || []).map(e => e.id === mapped.id ? { ...mapped, edited: true } : e) })
    } else {
      setExpensesBuying(prev => prev.map(e => e.id === mapped.id ? { ...mapped, edited: true } : e))
      setCategoryData(slug, { expensesBuying: (expensesBuying || []).map(e => e.id === mapped.id ? { ...mapped, edited: true } : e) })
    }
    // Patch global recent cache entry if present
    try { updateRecentExpense(data) } catch {}
    // Edited flag now comes from API; no local storage tracking
    setEditingExpense(null)
    setShowExpenseModal(false)

    // Refresh expenses from API to ensure real-time totals and chips update
    try {
      const [ { data: buyRows }, { data: labRows } ] = await Promise.all([
        listExpenses(user.id, category.id, 'buying'),
        listExpenses(user.id, category.id, 'labour')
      ])
      const buyMapped2 = (buyRows || []).map(e => ({ id: e.id, name: e.note || 'Expense', payee: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'buying', edited: Boolean(e.edited), budgetId: e.budget_id }))
      const labMapped2 = (labRows || []).map(e => ({ id: e.id, name: e.note || 'Expense', payee: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'labour', edited: Boolean(e.edited), budgetId: e.budget_id }))
      setExpensesBuying(buyMapped2)
      setExpensesLabour(labMapped2)
    } catch (e) {
      console.warn('Failed to refresh expenses after edit', e)
    }
  }

  // Top-up budget modal and submission
  const openTopupModal = () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth()+1).padStart(2,'0')
    const d = String(today.getDate()).padStart(2,'0')
    setTopupForm({ amount: '', date: `${y}-${m}-${d}`, reason: '', type: '', bankChoice: '', customBank: '', hdfcAmt: '', sbiAmt: '', iciciAmt: '', otherAmt: '' })
    setShowTopupModal(true)
  }

  const handleTopupSubmit = async () => {
    if (!category || !user) return
    const amt = Number(topupForm.amount || 0)
    if (!amt || amt <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    // Build per-source allocations from the form
    const otherName = (topupForm.customBank || '').trim()
    const otherAmt = Number(topupForm.otherAmt || 0)
    if (otherAmt > 0 && !otherName) {
      toast.error('Enter a custom bank name for Other amount')
      return
    }
    const additionsRaw = [
      { bank: 'HDFC', amount: Number(topupForm.hdfcAmt || 0) },
      { bank: 'SBI', amount: Number(topupForm.sbiAmt || 0) },
      { bank: 'ICICI', amount: Number(topupForm.iciciAmt || 0) },
      { bank: otherName, amount: otherAmt },
    ]
    const additions = additionsRaw.filter(a => a.bank && !isNaN(a.amount) && a.amount > 0)
    const sumAdditions = additions.reduce((s,a)=>s + Number(a.amount||0), 0)
    if (sumAdditions !== amt) {
      toast.error(`Split amounts (₹${sumAdditions.toLocaleString()}) must equal total (₹${amt.toLocaleString()})`)
      return
    }
    // Compute updated totals for touched sources
    const existingMap = new Map((bankAllocations || []).map(a => [String(a.bank), Number(a.amount || 0)]))
    const updatedTouched = additions.map(a => ({ bank: a.bank, amount: (existingMap.get(String(a.bank)) || 0) + Number(a.amount || 0) }))
    setAddingTopup(true)
    try {
      // Increase budget for this month
      const newBudget = Number(budget || 0) + amt
      const { data: bData, error: bErr } = await upsertBudget(user.id, category.id, newBudget, undefined, updatedTouched)
      if (bErr) {
        console.error(bErr)
        toast.error('Failed to update budget')
        return
      }
      setBudget(bData.amount)
      setBudgetId(bData.id)
      // Update active period to server’s normalized period
      setPeriodDate(bData.period)
      // Merge returned allocations into local state
      const returnedAllocs = Array.isArray(bData?.allocations) ? bData.allocations.map(a => ({ bank: a.bank, amount: a.amount, source_id: a.source_id })) : []
      const mergedMap = new Map((bankAllocations || []).map(a => [String(a.bank), { bank: a.bank, amount: Number(a.amount||0), source_id: a.source_id }]))
      returnedAllocs.forEach(a => {
        mergedMap.set(String(a.bank), { bank: a.bank, amount: Number(a.amount||0), source_id: a.source_id })
      })
      const merged = Array.from(mergedMap.values())
      setBankAllocations(merged)
      setCategoryData(slug, { bankAllocations: merged, budget: bData.amount, budgetId: bData.id })

      // Record the top-up entry (stored in expenses with kind 'topup')
      const splitTag = additions.map(a => `${a.bank}=${Number(a.amount||0)}`).join(';')
      const noteWithBank = `${topupForm.reason || 'Added to budget'}${splitTag ? ` [Split: ${splitTag}]` : ''}`
      const { data: tData, error: tErr } = await addExpense(user.id, {
        categoryId: category.id,
        budgetId: bData.id,
        amount: amt,
        note: noteWithBank,
        payee: topupForm.type || null,
        kind: 'topup',
        spentAt: topupForm.date || undefined,
      })
      if (tErr) {
        console.error(tErr)
        toast.error('Budget updated, but failed to record entry')
      } else {
        const mapped = { id: tData.id, reason: tData.note || 'Added amount', type: tData.payee || null, amount: tData.amount, date: tData.spent_at, kind: 'topup' }
        setTopups([mapped, ...topups])
        setCategoryData(slug, { topups: [mapped, ...(topups || [])] })
        setNotifications(prev => ([
          ...prev,
          { id: `topup-${tData.id}`, type: 'topup', title: 'Budget increased', message: `Added ₹${Number(tData.amount).toLocaleString()} • ${tData.note || 'Top-up'}`, categorySlug: category.slug, severity: 'info', date: tData.spent_at || new Date().toISOString() }
        ]))

        // Refetch top-ups from API to ensure UI reflects server truth
        try {
          const { data: topRows } = await listExpenses(user.id, category.id, 'topup')
          const topMapped2 = (topRows || []).map(e => ({ id: e.id, reason: e.note || 'Added amount', type: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'topup' }))
          setTopups(topMapped2)
        } catch (e) {
          console.warn('Failed to refresh top-ups after add', e)
        }
      }
      setShowTopupModal(false)
      setTopupForm({ amount: '', date: '', reason: '', type: '', bankChoice: '', customBank: '', hdfcAmt: '', sbiAmt: '', iciciAmt: '', otherAmt: '' })
      toast.success('Budget increased')
    } finally {
      setAddingTopup(false)
    }
  }

  const updateFilter = (kind, key, value) => {
    setFilters(prev => ({ ...prev, [kind]: { ...prev[kind], [key]: value } }))
  }

  const applyFilters = (items, kind) => {
    const f = filters[kind]
    const from = f.dateFrom ? new Date(f.dateFrom) : null
    const to = f.dateTo ? new Date(f.dateTo) : null
    const sq = (f.search || '').trim().toLowerCase()
    return (items || []).filter(e => {
      const dt = e.date ? new Date(e.date) : null
      const amt = Number(e.amount || 0)
      const matchDate = (!from || (dt && dt >= from)) && (!to || (dt && dt <= to))
      const text = `${e.name || ''} ${e.payee || ''} ${amt}`.toLowerCase()
      const matchSearch = !sq || text.includes(sq)
      return matchDate && matchSearch
    })
  }

  const toggleDatePopover = (kind) => {
    setDateDraft(prev => ({ ...prev, [kind]: { ...prev[kind], ...filters[kind] } }))
    setDatePopoverOpen(prev => ({ ...prev, [kind]: !prev[kind] }))
  }

  const applyDateRange = (kind) => {
    setFilters(prev => ({ ...prev, [kind]: { ...prev[kind], ...dateDraft[kind] } }))
    setDatePopoverOpen(prev => ({ ...prev, [kind]: false }))
  }

  const clearDateRange = (kind) => {
    setDateDraft(prev => ({ ...prev, [kind]: { dateFrom: '', dateTo: '' } }))
    setFilters(prev => ({ ...prev, [kind]: { ...prev[kind], dateFrom: '', dateTo: '' } }))
    setDatePopoverOpen(prev => ({ ...prev, [kind]: false }))
  }

  const handleExportPdf = async (kind) => {
    const data = kind === 'buying' ? filteredBuying : filteredLabour
    const title = `${category?.name || 'Category'} • ${kind === 'buying' ? buyingLabel : labourLabel} Expenses`
    const labels = kind === 'buying'
      ? { nameLabel: 'Expense Name', payeeLabel: 'Where/Who (shop)', amountLabel: 'Amount (₹)', dateLabel: 'Spent Date' }
      : { nameLabel: 'Labour Name', payeeLabel: 'Worker', amountLabel: 'Amount (₹)', dateLabel: 'Spent Date' }
    const totalSpentAll = (expensesBuying || []).reduce((s,e)=>s+Number(e.amount||0),0) + (expensesLabour || []).reduce((s,e)=>s+Number(e.amount||0),0)
    await exportExpensesPdf({
      title,
      user: { name: displayName, email: user?.email || '' },
      logoUrl: '/budgzyx.svg',
      records: data,
      kind,
      labels,
      budgetAmount: Number(budget || 0),
      totalSpent: totalSpentAll,
      bankSplits: Array.isArray(bankAllocations) ? bankAllocations : [],
    })
  }

  const handleBackToDashboard = () => {
    router.push('/dashboard')
  }

  // Choose an icon based on category name (same mapping as dashboard)
  const getCategoryIcon = (name) => {
    const n = (name || '').toLowerCase()
    if (n.includes('home')) return HomeIcon
    if (n.includes('grocery')) return ShoppingCart
    if (n.includes('subscription')) return CreditCard
    if (n.includes('personal')) return User
    return MoreHorizontal
  }

  // Resolve bank icon from name (fallback to null if unknown)
  const bankIconSrc = (name) => {
    const n = (name || '').toLowerCase().trim()
    if (!n) return null
    if (n.includes('hdfc')) return '/banks/hdfc.png'
    if (n.includes('sbi')) return '/banks/sbi.png'
    if (n.includes('icici')) return '/banks/icici.png'
    if (n.includes('central')) return '/banks/central.png'
    if (n.includes('bank of india') || n === 'boi') return '/banks/boi.png'
    if (n.includes('bank of baroda') || n === 'bob') return '/banks/bob.png'
    return null
  }

  // Visible counts per list for incremental loading (declare BEFORE any conditional returns)
  const [visibleCounts, setVisibleCounts] = useState({ buying: 3, labour: 3 })
  const contentScrollRef = useRef(null)
  const buyingSentinelRef = useRef(null)
  const labourSentinelRef = useRef(null)

  const filteredBuying = useMemo(() => applyFilters(expensesBuying, 'buying'), [expensesBuying, filters])
  const filteredLabour = useMemo(() => applyFilters(expensesLabour, 'labour'), [expensesLabour, filters])

  // Show all items by default; update when filters or data change
  useEffect(() => {
    const buyLen = applyFilters(expensesBuying, 'buying').length
    const labLen = applyFilters(expensesLabour, 'labour').length
    setVisibleCounts({ buying: buyLen, labour: labLen })
  }, [filters, expensesBuying, expensesLabour])

  // Observe sentinels to load more
  useEffect(() => {
    const root = contentScrollRef.current || null
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        const id = entry.target.getAttribute('data-id')
        if (id === 'buying') {
          setVisibleCounts((prev) => ({ ...prev, buying: Math.min(prev.buying + 3, filteredBuying.length) }))
        }
        if (id === 'labour') {
          setVisibleCounts((prev) => ({ ...prev, labour: Math.min(prev.labour + 3, filteredLabour.length) }))
        }
      })
    }, { root, threshold: 1.0 })
    if (buyingSentinelRef.current) observer.observe(buyingSentinelRef.current)
    if (labourSentinelRef.current) observer.observe(labourSentinelRef.current)
    return () => observer.disconnect()
  }, [filteredBuying.length, filteredLabour.length])

  // Protect the route
  if (!loading && !user) {
    router.push('/')
    return null
  }

  if (loading || budgetLoading) {
    return (
      <div className="max-w-md mx-auto">
        <LoadingOverlay visible={overlayVisible} />
      </div>
    )
  }

  // Handle invalid category
  if (!category && !budgetLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Category Not Found</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            The category you're looking for doesn't exist.
          </p>
          <button 
            onClick={handleBackToDashboard}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }


  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col">
      {/* Mobile header (12px rounded bottom with 3D shadow) */}
      <div className="relative px-4 pt-6 pb-6 bg-brand-dark text-white shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={handleBackToDashboard} aria-label="Back" className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">←</button>
            <div>
              <p className="text-sm opacity-80">{category?.name}</p>
              <p className="text-base font-semibold capitalize">{displayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Notifications" onClick={() => router.push('/dashboard/notifications')}>
              <Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[1rem] px-1 grid place-items-center rounded-full bg-red-600 text-white text-[10px] leading-none">
                  {notifications.length}
                </span>
              )}
            </button>
            <button onClick={handleSignOut} className="p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Sign out">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Single category budget + overspend alert */}
        {!showBudgetForm && (
          <div className="mt-6">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-brand-soft">Budget for</span>
                <span className="text-xs text-brand-soft font-medium">{category?.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-3xl text-[var(--amount-green)]">₹{Number(budget).toLocaleString()}</span>
                <button
                  type="button"
                  onClick={openTopupModal}
                  className="ml-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs ring-1 ring-white/20"
                >
                  <IndianRupee className="w-3 h-3" />
                  <span>Add to Budget</span>
                </button>
              </div>
              {bankAllocations.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs text-white/80">Payment Sources</div>
                    <button
                      type="button"
                      onClick={() => setShowBudgetForm(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] ring-1 ring-white/20"
                      aria-label="Edit payment sources"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {bankAllocations.map((a, idx) => {
                      const used = bankSpentMap.get(normalizeBankName(a.bank)) || 0
                      const icon = a.image_url || bankIconSrc(a.bank)
                      return (
                        <button type="button" onClick={() => openBankModal(a.bank)} key={`${a.bank}-${idx}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] ring-1 ring-white/20">
                          <Eye className="w-3 h-3 opacity-80" />
                          {icon ? (
            <img src={icon} alt={a.bank || 'Bank'} className="h-6 w-auto" style={{ objectFit: 'contain', maxWidth: '24px' }} />
                          ) : (
                            <span className="font-medium">{a.bank || 'Bank'}</span>
                          )}
                          <span className="opacity-80">• Used ₹{Number(used).toLocaleString()}</span>
                          <span className="opacity-60">/ ₹{Number(a.amount || 0).toLocaleString()}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Alert strip */}
            <div className="mt-3 flex items-stretch gap-2">
              {overspentBank > 0 ? (
                <div className="p-2 rounded-xl bg-red-600/20 border border-red-500/40 text-red-100 flex-1 flex items-center min-h-[56px]">
                  <div className="flex w-full items-center justify-between">
                    <div className="text-xs">Overspent</div>
                    <div className="font-medium text-sm">₹{overspentBank.toLocaleString()}</div>
                  </div>
                </div>
              ) : (
                <div className="p-2 rounded-xl bg-green-600/20 border border-green-500/40 text-green-100 flex-1 flex items-center min-h-[56px]">
                  <div className="flex w-full items-center justify-between">
                    <div className="text-xs">Remaining</div>
                    <div className="font-semibold text-base">₹{remainingBank.toLocaleString()}</div>
                  </div>
                </div>
              )}
              <div className="p-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white ring-1 ring-white/20 flex-1 min-h-[56px]">
                <div className="flex items-center justify-between">
                  <div className="text-xs">Used</div>
                  <div className="font-bold text-lg text-amount">₹{usedFromBanks.toLocaleString()}</div>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <div className="opacity-80">Total Budget</div>
                  <div className="font-bold text-lg text-amount">₹{Number(budget || 0).toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Mini bar chart below alert */}
            <MiniSpendChart buyingExpenses={expensesBuying} labourExpenses={isHomeBuilding ? expensesLabour : []} buyingLabel={buyingLabel} labourLabel={labourLabel} />

            {/* Bank detail modal */}
            {bankModalOpen && selectedBank && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
                <div className="w-[520px] max-w-[92vw] max-h-[70vh] overflow-y-auto rounded-xl bg-brand-dark text-white ring-1 ring-white/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {bankIconSrc(selectedBank) ? (
            <img src={bankIconSrc(selectedBank)} alt={selectedBank} className="h-7 w-auto" style={{ objectFit: 'contain', maxWidth: '28px' }} />
                      ) : (
                        <span className="font-medium">{selectedBank}</span>
                      )}
                      <span className="text-xs opacity-80">Details</span>
                    </div>
                    <button type="button" onClick={closeBankModal} aria-label="Close" className="p-1 rounded-md hover:bg-white/10"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs opacity-80">Total Used</div>
                    <div className="font-bold text-lg text-amount">₹{bankExpenseTotal.toLocaleString()}</div>
                  </div>
                  <div className="space-y-2">
                    {bankExpenseList.length === 0 ? (
                      <div className="text-xs opacity-70">No expenses from this source in current period.</div>
                    ) : (
                      bankExpenseList.map(e => (
                        <div key={e.id} className="flex items-center justify-between text-xs">
                          <div className="truncate">{stripBankAndSplitTags(e.name)}</div>
                          <div className="font-medium text-amount">₹{Number(e.amount).toLocaleString()}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Small list of recent budget additions */}
            {topups.length > 0 && (
              <div className="mt-3 p-3 bg-white/10 rounded-xl">
                <div className="text-xs text-white/80 mb-2">Budget Additions</div>
                <div className="space-y-1">
                    {topups.slice(0,3).map(t => (
                      <div key={t.id} className="flex items-center justify-between text-xs text-white/90">
                        <div className="truncate">
                          <span className="font-medium">₹{Number(t.amount).toLocaleString()}</span>
                          <span className="opacity-80"> • {String(t.reason || '').replace(/\s*\[Split:[^\]]+\]\s*/i,'').trim()}</span>
                          {t.type ? <span className="opacity-60"> • {t.type}</span> : null}
                          {/* Split bank chips */}
                          {parseTopupSplits(t.reason).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {parseTopupSplits(t.reason).map((s, idx) => (
                                <span key={`${t.id}-split-${idx}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 text-white text-[10px] ring-1 ring-white/20">
                                  {bankIconSrc(s.bank) ? (
            <img src={bankIconSrc(s.bank)} alt={s.bank} className="h-6 w-auto" style={{ objectFit: 'contain', maxWidth: '24px' }} />
                                  ) : (
                                    <span className="font-medium">{s.bank}</span>
                                  )}
                                  <span className="opacity-90" style={{ color: '#1f2937' }}>₹{Number(s.amount).toLocaleString()}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="opacity-60">{new Date(t.date).toLocaleDateString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
        {/* Animated footer stripe like dashboard topbar */}
        <div className="pointer-events-none absolute left-0 right-0 bottom-0 h-3 overflow-hidden">
          <div className="w-full h-full bg-diagonal-pattern opacity-60 animate-pattern" />
        </div>
      </div>

      

      <div ref={contentScrollRef} className="flex-1 overflow-y-auto px-4 py-5">
        {showBudgetForm ? (
          <BudgetForm 
            categoryId={category.id} 
            categoryName={category.name} 
            onBudgetSet={handleBudgetSet} 
            initialAmount={budget}
            initialAllocations={bankAllocations}
          />
        ) : (
          <>
            {/* Add Expense buttons between topbar and tabs */}
            <div className="mt-3 mb-6">
              {isHomeBuilding ? (
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => { setActiveKind('buying'); setShowExpenseModal(true) }}
                    className="rounded-xl bg-brand-dark text-white py-3 ring-1 ring-[var(--brand-primary)]/30"
                    aria-label="Add buying expense"
                  >Add Buying Expense</button>
                  <button
                    type="button"
                    onClick={() => { setActiveKind('labour'); setShowExpenseModal(true) }}
                    className="rounded-xl bg-brand-dark text-white py-3 ring-1 ring-[var(--brand-primary)]/30"
                    aria-label="Add labour expense"
                  >Add Labour Expense</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setActiveKind('buying'); setShowExpenseModal(true) }}
                  className="w-full rounded-xl bg-brand-dark text-white py-3 ring-1 ring-[var(--brand-primary)]/30"
                  aria-label="Add new expense"
                >Add New Expense</button>
              )}
            </div>

            <Tabs value={activeTab} onValueChange={(v)=>setActiveTab(v)} className="w-full">
              {isHomeBuilding && (
                <TabsList className={`grid w-full grid-cols-2`}>
                  <TabsTrigger value="buying">Buying Expenses</TabsTrigger>
                  <TabsTrigger value="labour">Labour Expenses</TabsTrigger>
                </TabsList>
              )}

              {/* Buying list styled like Recent Expenses */}
              <TabsContent value="buying" className="mt-4 space-y-4">
              <div className="p-4 bg-white dark:bg-zinc-800 rounded-xl shadow">
                {/* Title + count */}
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">Buying Expenses</h3>
                  <span className="text-xs text-gray-500">{filteredBuying.length} items</span>
                </div>
                {/* Controls in one row: search, date filter, PDF */}
                <div className="relative flex items-center mb-3 gap-2">
                  <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-700 rounded-md px-3 py-1 w-full max-w-xs">
                    <Search className="w-4 h-4" />
                    <input type="text" value={filters.buying.search} onChange={(e)=>updateFilter('buying','search', e.target.value)} placeholder="Search" className="bg-transparent text-sm w-full outline-none" />
                  </div>
                  <button type="button" onClick={() => toggleDatePopover('buying')} className="inline-flex items-center justify-center bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 hover:bg-gray-200">
                    <Calendar className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => handleExportPdf('buying')} className="inline-flex items-center justify-center bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 hover:bg-gray-200" title="Export buying expenses as PDF" aria-label="Export PDF">
                    <FileDown className="w-4 h-4" />
                  </button>
                  {datePopoverOpen.buying && (
                    <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-white dark:bg-zinc-800 rounded-md shadow z-10">
                      <div className="text-sm font-medium mb-2">Date range</div>
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
                  {filteredBuying.slice(0, visibleCounts.buying).map((e) => {
                    const CatIcon = getCategoryIcon(category?.name)
                    const bankMatch = String(e.name || '').match(/\[Bank:\s*([^\]]+)\]/i)
                    const bankName = bankMatch ? bankMatch[1].trim() : ''
                    const splits = parseTopupSplits(e.name)
                    const displayName = String(e.name || 'Expense')
                      .replace(/\s*\[Bank:[^\]]+\]\s*/ig,'')
                      .replace(/\s*\[Split:[^\]]+\]\s*/ig,'')
                      .trim()
                    const bankIcon = bankIconSrc(bankName)
                    return (
                      <div key={e.id} className="group flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          <span className="h-7 w-7 rounded-full chip-ring grid place-items-center">
                            <CatIcon className="w-4 h-4 text-white transition-transform group-hover:rotate-12 group-active:-rotate-12" />
                          </span>
                          <div className="leading-tight">
                            <div className="text-sm font-medium flex items-center gap-1">
                              <span>{displayName || 'Expense'}</span>
        {splits.length > 0 ? (
          <span className="ml-1 flex flex-wrap items-center gap-1">
            {splits.map((s, idx) => (
              <span key={`b-split-${e.id}-${idx}`} className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded-md bg-white/10 text-white text-[10px] ring-1 ring-white/20">
                {bankIconSrc(s.bank) ? (
                  <img src={bankIconSrc(s.bank)} alt={s.bank} className="h-4 w-auto" style={{ objectFit: 'contain', maxWidth: '18px' }} />
                ) : (
                  <span className="font-medium">{s.bank}</span>
                )}
                <span className="opacity-90" style={{ color: '#1f2937' }}>₹{Number(s.amount).toLocaleString()}</span>
              </span>
            ))}
          </span>
        ) : (bankIcon ? (<img src={bankIcon} alt={bankName} className="h-6 w-auto" style={{ objectFit: 'contain', maxWidth: '24px' }} />) : null)}
                              {e.edited && (<span className="ml-2 px-1.5 py-[1px] rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-700/20 dark:text-yellow-200 text-[10px]">edited</span>)}
                            </div>
                            <div className="text-[11px] text-black">{category?.name}{e.payee ? ` • ${e.payee}` : ''}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="p-1 rounded-md bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200"
                            title="Edit"
                            onClick={() => { setEditingExpense(e); setActiveKind(e.kind); setShowExpenseModal(true) }}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <div className="text-right leading-tight">
                          <div className="text-sm font-semibold text-[var(--amount-green)]">₹{Number(e.amount).toLocaleString()}</div>
                          <div className="text-[11px] text-gray-500">{new Date(e.date).toLocaleDateString()}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {filteredBuying.length === 0 && (
                    <div className="text-sm text-gray-500">No buying expenses</div>
                  )}
                  {/* Sentinel removed since we show all items by default */}
                </div>
              </div>
              </TabsContent>

              {/* Labour list styled like Recent Expenses (only Home Building) */}
              {isHomeBuilding && (
              <TabsContent value="labour" className="mt-4 space-y-4">
              <div className="p-4 bg-white dark:bg-zinc-800 rounded-xl shadow">
                <div className="relative flex items-center mb-3 gap-2">
                  <h3 className="font-semibold">Labour Expenses</h3>
                  <span className="ml-2 text-xs text-gray-500">{filteredLabour.length} items</span>
                  <div className="flex-1 flex justify-center">
                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-700 rounded-md px-3 py-1 w-full max-w-xs">
                      <Search className="w-4 h-4" />
                      <input type="text" value={filters.labour.search} onChange={(e)=>updateFilter('labour','search', e.target.value)} placeholder="Search" className="bg-transparent text-sm w-full outline-none" />
                    </div>
                  </div>
                  <button type="button" onClick={() => toggleDatePopover('labour')} className="ml-auto inline-flex items-center justify-center bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 hover:bg-gray-200">
                    <Calendar className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => handleExportPdf('labour')} className="inline-flex items-center justify-center bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 hover:bg-gray-200" title="Export labour expenses as PDF" aria-label="Export PDF">
                    <FileDown className="w-4 h-4" />
                  </button>
                  {datePopoverOpen.labour && (
                    <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-white dark:bg-zinc-800 rounded-md shadow z-10">
                      <div className="text-sm font-medium mb-2">Date range</div>
                      <div className="space-y-2">
                        <input type="date" value={dateDraft.labour.dateFrom} onChange={(e)=>setDateDraft(prev=>({ ...prev, labour: { ...prev.labour, dateFrom: e.target.value } }))} className="w-full bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 text-xs" />
                        <input type="date" value={dateDraft.labour.dateTo} onChange={(e)=>setDateDraft(prev=>({ ...prev, labour: { ...prev.labour, dateTo: e.target.value } }))} className="w-full bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 text-xs" />
                        <div className="flex justify-end gap-2 pt-1">
                          <button type="button" onClick={()=>clearDateRange('labour')} className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200">Clear</button>
                          <button type="button" onClick={()=>applyDateRange('labour')} className="text-xs px-2 py-1 rounded-md bg-black text-white">Apply</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                    {filteredLabour.slice(0, visibleCounts.labour).map((e) => {
                    const CatIcon = getCategoryIcon(category?.name)
                    const bankMatch = String(e.name || '').match(/\[Bank:\s*([^\]]+)\]/i)
                    const bankName = bankMatch ? bankMatch[1].trim() : ''
                    const splits = parseTopupSplits(e.name)
                    const displayName = String(e.name || 'Expense')
                      .replace(/\s*\[Bank:[^\]]+\]\s*/ig,'')
                      .replace(/\s*\[Split:[^\]]+\]\s*/ig,'')
                      .trim()
                    const bankIcon = bankIconSrc(bankName)
                    return (
                      <div key={e.id} className="group flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          <span className="h-7 w-7 rounded-full chip-ring grid place-items-center">
                            <CatIcon className="w-4 h-4 text-white transition-transform group-hover:rotate-12 group-active:-rotate-12" />
                          </span>
                          <div className="leading-tight">
                            <div className="text-sm font-medium flex items-center gap-1">
                              <span>{displayName || 'Expense'}</span>
        {splits.length > 0 ? (
          <span className="ml-1 flex flex-wrap items-center gap-1">
            {splits.map((s, idx) => (
              <span key={`l-split-${e.id}-${idx}`} className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded-md bg-white/10 text-white text-[10px] ring-1 ring-white/20">
                {bankIconSrc(s.bank) ? (
                  <img src={bankIconSrc(s.bank)} alt={s.bank} className="h-4 w-auto" style={{ objectFit: 'contain', maxWidth: '18px' }} />
                ) : (
                  <span className="font-medium">{s.bank}</span>
                )}
                <span className="opacity-90" style={{ color: '#1f2937' }}>₹{Number(s.amount).toLocaleString()}</span>
              </span>
            ))}
          </span>
        ) : (bankIcon ? (<img src={bankIcon} alt={bankName} className="h-6 w-auto" style={{ objectFit: 'contain', maxWidth: '24px' }} />) : null)}
                              {e.edited && (<span className="ml-2 px-1.5 py-[1px] rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-700/20 dark:text-yellow-200 text-[10px]">edited</span>)}
                            </div>
                            <div className="text-[11px] text-black">{category?.name}{e.payee ? ` • ${e.payee}` : ''}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="p-1 rounded-md bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200"
                            title="Edit"
                            onClick={() => { setEditingExpense(e); setActiveKind(e.kind); setShowExpenseModal(true) }}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <div className="text-right leading-tight">
                          <div className="text-sm font-semibold text-[var(--amount-green)]">₹{Number(e.amount).toLocaleString()}</div>
                          <div className="text-[11px] text-gray-500">{new Date(e.date).toLocaleDateString()}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {filteredLabour.length === 0 && (
                    <div className="text-sm text-gray-500">No labour expenses</div>
                  )}
                  {/* Sentinel removed since we show all items by default */}
                </div>
              </div>
              </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </div>

      {/* Modal for Add / Edit Expense */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
          <div className="w-full max-w-md bg-white dark:bg-zinc-800 rounded-t-2xl md:rounded-2xl shadow-lg p-4 text-black dark:text-white max-h-[85vh] overflow-y-auto thin-scrollbar">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold">{editingExpense ? 'Edit Expense' : (activeKind === 'labour' ? 'Add Labour Expense' : 'Add New Purchase')}</h4>
              <button onClick={() => { setShowExpenseModal(false); setEditingExpense(null) }} aria-label="Close" className="p-2 rounded-full bg-gray-200 dark:bg-zinc-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Removed kind toggle to show only the selected form type */}
            <ExpenseForm 
              categoryId={category.id} 
              onExpenseAdded={handleExpenseAdded}
              onExpenseEdited={handleExpenseEdited}
              initialExpense={editingExpense ? { id: editingExpense.id, name: editingExpense.name, payee: editingExpense.payee || '', amount: editingExpense.amount, date: editingExpense.date } : undefined}
              mode={editingExpense ? 'edit' : 'add'}
              kind={editingExpense ? editingExpense.kind : (isHomeBuilding ? activeKind : 'buying')}
              payeeLabel={activeKind === 'labour' ? 'Labour Name' : 'Where/Who (shop)'}
              categoryName={category?.name}
              allocatedBanks={(bankAllocations || []).map(a => String(a.bank))}
            />
          </div>
        </div>
      )}

      {/* Add to Budget Modal */}
      {showTopupModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
          <div className="w-full max-w-md bg-white dark:bg-zinc-800 rounded-t-2xl md:rounded-2xl shadow-lg p-4 max-h-[85vh] overflow-y-auto thin-scrollbar">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-black dark:text-white">Add to Budget</h4>
              <button onClick={() => setShowTopupModal(false)} aria-label="Close" className="p-2 rounded-full bg-gray-200 dark:bg-zinc-700">
                <X className="w-4 h-4" />
              </button>
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
                {/* Payment Sources Allocation */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-black dark:text-white">Payment Sources Allocation</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
        <div className="text-xs mb-1 flex items-center gap-1"><img src="/banks/hdfc.png" alt="HDFC" className="h-6 w-auto" style={{ objectFit: 'contain', maxWidth: '24px' }} /><span>HDFC</span></div>
                      <input type="number" min="0" step="0.01" value={topupForm.hdfcAmt} onChange={(e)=>setTopupForm(prev=>({...prev, hdfcAmt: e.target.value }))} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white" placeholder="e.g. 2,000" />
                    </div>
                    <div>
        <div className="text-xs mb-1 flex items-center gap-1"><img src="/banks/sbi.png" alt="SBI" className="h-6 w-auto" style={{ objectFit: 'contain', maxWidth: '24px' }} /><span>SBI</span></div>
                      <input type="number" min="0" step="0.01" value={topupForm.sbiAmt} onChange={(e)=>setTopupForm(prev=>({...prev, sbiAmt: e.target.value }))} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white" placeholder="e.g. 1,500" />
                    </div>
                    <div>
        <div className="text-xs mb-1 flex items-center gap-1"><img src="/banks/icici.png" alt="ICICI" className="h-6 w-auto" style={{ objectFit: 'contain', maxWidth: '24px' }} /><span>ICICI</span></div>
                      <input type="number" min="0" step="0.01" value={topupForm.iciciAmt} onChange={(e)=>setTopupForm(prev=>({...prev, iciciAmt: e.target.value }))} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white" placeholder="e.g. 1,000" />
                    </div>
                    <div>
                      <div className="text-xs mb-1 flex items-center gap-1">
                        {bankIconSrc(topupForm.customBank) ? (
        <img src={bankIconSrc(topupForm.customBank)} alt={topupForm.customBank || 'Other'} className="h-6 w-auto" style={{ objectFit: 'contain', maxWidth: '24px' }} />
                        ) : null}
                        <span>Other</span>
                      </div>
                      <div className="grid grid-cols-[1fr,1fr] gap-2">
                        <input type="text" value={topupForm.customBank} onChange={(e)=>setTopupForm(prev=>({...prev, customBank: e.target.value }))} className="px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white" placeholder="Custom bank name" />
                        <input type="number" min="0" step="0.01" value={topupForm.otherAmt} onChange={(e)=>setTopupForm(prev=>({...prev, otherAmt: e.target.value }))} className="px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white" placeholder="e.g. 500" />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-white/60">Ensure these add up to the total being added.</p>
                </div>
              <button type="button" onClick={handleTopupSubmit} disabled={addingTopup} className="w-full rounded-md bg-brand-dark text-white py-2 ring-1 ring-[var(--brand-primary)]/30 disabled:opacity-60">
                {addingTopup ? 'Adding...' : 'Add Amount'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CategoryPage