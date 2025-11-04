"use client"
import React, { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import client from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { getCategoryBySlug, getBudgetForMonth, upsertBudget, listExpenses, addExpense } from '@/api/db'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import LoadingOverlay from '@/app/components/LoadingOverlay'

// Import budget components
import BudgetForm from '@/app/components/budget/BudgetForm'
import ExpenseForm from '@/app/components/budget/ExpenseForm'
import MiniSpendChart from '@/app/components/budget/MiniSpendChart'
// Mobile redesign uses custom list rows instead of table summary
import { Bell, LogOut, Home as HomeIcon, ShoppingCart, CreditCard, User, MoreHorizontal, Plus, X, Search, Calendar, AlertCircle, AlertTriangle, PlusCircle } from 'lucide-react'

const CategoryPage = () => {
  const router = useRouter()
  const params = useParams()
  const { user, loading } = useAuth()
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
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [budgetLoading, setBudgetLoading] = useState(true)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showTopupModal, setShowTopupModal] = useState(false)
  const [topupForm, setTopupForm] = useState({ amount: '', date: '', reason: '', type: '' })
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
  const [datePopoverOpen, setDatePopoverOpen] = useState({ buying: false, labour: false })

  // Loader visibility with minimum display time
  const [overlayVisible, setOverlayVisible] = useState(true)
  const overlayStartRef = useRef(0)

  // Derived totals for budget alert in the top bar
  const isHomeBuilding = (category?.name || '').toLowerCase().includes('home')
  const totalBuying = (expensesBuying || []).reduce((sum, e) => sum + Number(e.amount || 0), 0)
  const totalLabourRaw = (expensesLabour || []).reduce((sum, e) => sum + Number(e.amount || 0), 0)
  const totalLabour = isHomeBuilding ? totalLabourRaw : 0
  const totalSpent = totalBuying + totalLabour
  const overspent = Math.max(0, totalSpent - Number(budget || 0))
  const remaining = Math.max(0, Number(budget || 0) - totalSpent)
  const dominantKind = totalBuying >= totalLabour ? 'Buying' : 'Labour'
  const dominantAmount = totalBuying >= totalLabour ? totalBuying : totalLabour

  useEffect(() => {
    const loadData = async () => {
      overlayStartRef.current = Date.now()
      setOverlayVisible(true)
      setBudgetLoading(true)
      try {
        if (!user) return
        // Load category by slug
        const { data: cat, error: catErr } = await getCategoryBySlug(user.id, slug)
        if (catErr) {
          console.error(catErr)
          toast.error('Category not found')
          setBudgetLoading(false)
          return
        }
        setCategory(cat)

        // Load budget for current month
        const { data: budgetRow, error: budgetErr } = await getBudgetForMonth(user.id, cat.id)
        if (budgetErr) {
          console.error(budgetErr)
        }
        if (budgetRow) {
          setBudget(budgetRow.amount)
          setBudgetId(budgetRow.id)
          setShowBudgetForm(false)
        } else {
          setBudget(0)
          setBudgetId(null)
          setShowBudgetForm(true)
        }

        // Load expenses by kind for this category
        const [
          { data: buyRows, error: buyErr },
          { data: labRows, error: labErr },
          { data: topupRows, error: topupErr }
        ] = await Promise.all([
          listExpenses(user.id, cat.id, 'buying'),
          listExpenses(user.id, cat.id, 'labour'),
          listExpenses(user.id, cat.id, 'topup')
        ])
        if (buyErr) console.error(buyErr)
        if (labErr) console.error(labErr)
        if (topupErr) console.error(topupErr)
        const buyMapped = (buyRows || []).map(e => ({ id: e.id, name: e.note || 'Expense', payee: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'buying' }))
        const labMapped = (labRows || []).map(e => ({ id: e.id, name: e.note || 'Expense', payee: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'labour' }))
        const topMapped = (topupRows || []).map(e => ({ id: e.id, reason: e.note || 'Added amount', type: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'topup' }))
        setExpensesBuying(buyMapped)
        setExpensesLabour(labMapped)
        setTopups(topMapped)

        // Build notifications for this category
        const newNotifications = []
        const totalSpentNow = (buyMapped || []).reduce((s,e)=>s+Number(e.amount||0),0) + (labMapped || []).reduce((s,e)=>s+Number(e.amount||0),0)
        const overspentNow = Math.max(0, totalSpentNow - Number(budget || 0))
        if (overspentNow > 0) {
          newNotifications.push({
            id: `overspend-${cat.slug}`,
            type: 'overspend',
            title: `Overspent in ${cat.name}`,
            message: `Exceeded by ₹${overspentNow.toLocaleString()}. Spent ₹${totalSpentNow.toLocaleString()} of ₹${Number(budget||0).toLocaleString()}.`,
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
      } finally {
        setBudgetLoading(false)
      }
    }
    if (slug && user) {
      loadData()
    }
  }, [slug, user])

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
      const { error } = await client.auth.signOut()
      if (error) {
        toast.error(error.message)
      } else {
        toast.success('Signed out successfully')
        router.push('/')
      }
    } catch (err) {
      toast.error('Error signing out')
      console.error(err)
    }
  }

  const handleBudgetSet = async (amount) => {
    if (!category || !user) return
    const { data, error } = await upsertBudget(user.id, category.id, amount)
    if (error) {
      console.error(error)
      toast.error(error.message)
      return
    }
    setBudget(data.amount)
    setBudgetId(data.id)
    setShowBudgetForm(false)
  }

  const handleExpenseAdded = async (expense) => {
    if (!category || !user) return
    const { data, error } = await addExpense(user.id, { categoryId: category.id, budgetId, amount: expense.amount, note: expense.name, payee: expense.payee, kind: expense.kind, spentAt: expense.date })
    if (error) {
      console.error(error)
      toast.error(error.message)
      return
    }
    const mapped = { id: data.id, name: data.note || 'Expense', payee: data.payee || null, amount: data.amount, date: data.spent_at, kind: data.kind }
    if (mapped.kind === 'labour') {
      setExpensesLabour([mapped, ...expensesLabour])
    } else {
      setExpensesBuying([mapped, ...expensesBuying])
    }
    // Close modal on successful add
    setShowExpenseModal(false)

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
    if (!category || !user) return
    const amt = Number(topupForm.amount || 0)
    if (!amt || amt <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    setAddingTopup(true)
    try {
      // Increase budget for this month
      const newBudget = Number(budget || 0) + amt
      const { data: bData, error: bErr } = await upsertBudget(user.id, category.id, newBudget)
      if (bErr) {
        console.error(bErr)
        toast.error('Failed to update budget')
        return
      }
      setBudget(bData.amount)
      setBudgetId(bData.id)

      // Record the top-up entry (stored in expenses with kind 'topup')
      const { data: tData, error: tErr } = await addExpense(user.id, {
        categoryId: category.id,
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
        const mapped = { id: tData.id, reason: tData.note || 'Added amount', type: tData.payee || null, amount: tData.amount, date: tData.spent_at, kind: 'topup' }
        setTopups([mapped, ...topups])
        setNotifications(prev => ([
          ...prev,
          { id: `topup-${tData.id}`, type: 'topup', title: 'Budget increased', message: `Added ₹${Number(tData.amount).toLocaleString()} • ${tData.note || 'Top-up'}`, categorySlug: category.slug, severity: 'info', date: tData.spent_at || new Date().toISOString() }
        ]))
      }
      setShowTopupModal(false)
      setTopupForm({ amount: '', date: '', reason: '', type: '' })
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

  // Protect the route
  if (!loading && !user) {
    router.push('/')
    return null
  }

  if (loading || budgetLoading) {
    return (
      <div className="max-w-md mx-auto">
        <LoadingOverlay visible={overlayVisible} text="Loading data..." />
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
    <div className="max-w-md mx-auto">
      {/* Mobile header (12px rounded bottom with 3D shadow) */}
      <div className="px-4 pt-6 pb-6 bg-brand-dark text-white rounded-b-3xl shadow-2xl shadow-black/30">
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-brand-soft">Budget for</span>
                <span className="text-xs text-brand-soft font-medium">{category?.name}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-extrabold text-3xl text-[var(--amount-green)]">₹{Number(budget).toLocaleString()}</span>
                <button
                  type="button"
                  onClick={openTopupModal}
                  className="ml-2 px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs ring-1 ring-white/20"
                >
                  Add to Budget
                </button>
              </div>
            </div>

            {/* Alert strip */}
            {overspent > 0 ? (
              <div className="mt-3 p-3 rounded-xl bg-red-600/20 border border-red-500/40 text-red-100">
                <div className="flex items-center justify-between">
                  <div className="text-sm">Overspent</div>
                  <div className="font-extrabold text-2xl">₹{overspent.toLocaleString()}</div>
                </div>
                <div className="mt-1 text-xs opacity-80">Mostly on <span className="font-semibold">{dominantKind}</span> (₹{dominantAmount.toLocaleString()})</div>
              </div>
            ) : (
              <div className="mt-3 p-3 rounded-xl bg-green-600/20 border border-green-500/40 text-green-100">
                <div className="flex items-center justify-between">
                  <div className="text-sm">Remaining</div>
                  <div className="font-extrabold text-xl">₹{remaining.toLocaleString()}</div>
                </div>
              </div>
            )}

            {/* Mini bar chart below alert */}
            <MiniSpendChart buyingExpenses={expensesBuying} labourExpenses={isHomeBuilding ? expensesLabour : []} />

            {/* Small list of recent budget additions */}
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
        )}
      </div>

      

      <div className="px-4 py-5">
        {showBudgetForm ? (
          <BudgetForm 
            categoryId={category.id} 
            categoryName={category.name} 
            onBudgetSet={handleBudgetSet} 
          />
        ) : (
          <>
            {/* Add Expense button between topbar and tabs */}
            <div className="mb-3">
              <button
                onClick={() => { setActiveKind('buying'); setShowExpenseModal(true) }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-dark text-white py-3 ring-1 ring-[var(--brand-primary)]/30"
                aria-label="Add new expense"
              >
                <Plus className="w-5 h-5" />
                Add New Expense
              </button>
            </div>

            <Tabs defaultValue="buying" className="w-full">
              <TabsList className={`grid w-full ${isHomeBuilding ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <TabsTrigger value="buying">Buying Expenses</TabsTrigger>
                {isHomeBuilding && (<TabsTrigger value="labour">Labour Expenses</TabsTrigger>)}
              </TabsList>

              {/* Buying list styled like Recent Expenses */}
              <TabsContent value="buying" className="mt-4 space-y-4">
              <div className="p-4 bg-white dark:bg-zinc-800 rounded-xl shadow">
                <div className="relative flex items-center mb-3 gap-2">
                  <h3 className="font-semibold">Buying Expenses</h3>
                  <div className="flex-1 flex justify-center">
                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-700 rounded-md px-3 py-1 w-full max-w-xs">
                      <Search className="w-4 h-4" />
                      <input type="text" value={filters.buying.search} onChange={(e)=>updateFilter('buying','search', e.target.value)} placeholder="Search" className="bg-transparent text-sm w-full outline-none" />
                    </div>
                  </div>
                  <button type="button" onClick={() => toggleDatePopover('buying')} className="ml-auto inline-flex items-center justify-center bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 hover:bg-gray-200">
                    <Calendar className="w-4 h-4" />
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
                  {applyFilters(expensesBuying, 'buying').map((e) => {
                    const CatIcon = getCategoryIcon(category?.name)
                    return (
                      <div key={e.id} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          <span className="h-7 w-7 rounded-full chip-ring grid place-items-center">
                            <CatIcon className="w-4 h-4 text-white" />
                          </span>
                          <div className="leading-tight">
                            <div className="text-sm font-medium">{e.name || 'Expense'}</div>
                            <div className="text-[11px] text-black">{category?.name}{e.payee ? ` • ${e.payee}` : ''}</div>
                          </div>
                        </div>
                        <div className="text-right leading-tight">
                          <div className="text-sm font-semibold text-[var(--amount-green)]">₹{Number(e.amount).toLocaleString()}</div>
                          <div className="text-[11px] text-gray-500">{new Date(e.date).toLocaleDateString()}</div>
                        </div>
                      </div>
                    )
                  })}
                  {applyFilters(expensesBuying, 'buying').length === 0 && (
                    <div className="text-sm text-gray-500">No buying expenses</div>
                  )}
                </div>
              </div>
              </TabsContent>

              {/* Labour list styled like Recent Expenses (only Home Building) */}
              {isHomeBuilding && (
              <TabsContent value="labour" className="mt-4 space-y-4">
              <div className="p-4 bg-white dark:bg-zinc-800 rounded-xl shadow">
                <div className="relative flex items-center mb-3 gap-2">
                  <h3 className="font-semibold">Labour Expenses</h3>
                  <div className="flex-1 flex justify-center">
                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-700 rounded-md px-3 py-1 w-full max-w-xs">
                      <Search className="w-4 h-4" />
                      <input type="text" value={filters.labour.search} onChange={(e)=>updateFilter('labour','search', e.target.value)} placeholder="Search" className="bg-transparent text-sm w-full outline-none" />
                    </div>
                  </div>
                  <button type="button" onClick={() => toggleDatePopover('labour')} className="ml-auto inline-flex items-center justify-center bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 hover:bg-gray-200">
                    <Calendar className="w-4 h-4" />
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
                  {applyFilters(expensesLabour, 'labour').map((e) => {
                    const CatIcon = getCategoryIcon(category?.name)
                    return (
                      <div key={e.id} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          <span className="h-7 w-7 rounded-full chip-ring grid place-items-center">
                            <CatIcon className="w-4 h-4 text-white" />
                          </span>
                          <div className="leading-tight">
                            <div className="text-sm font-medium">{e.name || 'Expense'}</div>
                            <div className="text-[11px] text-black">{category?.name}{e.payee ? ` • ${e.payee}` : ''}</div>
                          </div>
                        </div>
                        <div className="text-right leading-tight">
                          <div className="text-sm font-semibold text-[var(--amount-green)]">₹{Number(e.amount).toLocaleString()}</div>
                          <div className="text-[11px] text-gray-500">{new Date(e.date).toLocaleDateString()}</div>
                        </div>
                      </div>
                    )
                  })}
                  {applyFilters(expensesLabour, 'labour').length === 0 && (
                    <div className="text-sm text-gray-500">No labour expenses</div>
                  )}
                </div>
              </div>
              </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </div>

      {/* Modal for Add New Expense */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
          <div className="w-full max-w-md bg-white dark:bg-zinc-800 rounded-t-2xl md:rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold">Add New Expense</h4>
              <button onClick={() => setShowExpenseModal(false)} aria-label="Close" className="p-2 rounded-full bg-gray-200 dark:bg-zinc-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <button
                className={`px-3 py-1 rounded-full text-sm ${activeKind === 'buying' ? 'bg-brand-dark text-white' : 'bg-gray-200 dark:bg-zinc-700'}`}
                onClick={() => setActiveKind('buying')}
              >
                Buying
              </button>
              {isHomeBuilding && (
                <button
                  className={`px-3 py-1 rounded-full text-sm ${activeKind === 'labour' ? 'bg-brand-dark text-white' : 'bg-gray-200 dark:bg-zinc-700'}`}
                  onClick={() => setActiveKind('labour')}
                >
                  Labour
                </button>
              )}
            </div>
            <ExpenseForm 
              categoryId={category.id} 
              onExpenseAdded={handleExpenseAdded} 
              kind={isHomeBuilding ? activeKind : 'buying'}
              payeeLabel={activeKind === 'labour' ? 'Labour Name' : 'Where/Who (shop)'}
            />
          </div>
        </div>
      )}

      {/* Add to Budget Modal */}
      {showTopupModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
          <div className="w-full max-w-md bg-white dark:bg-zinc-800 rounded-t-2xl md:rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold">Add to Budget</h4>
              <button onClick={() => setShowTopupModal(false)} aria-label="Close" className="p-2 rounded-full bg-gray-200 dark:bg-zinc-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Amount (₹)</label>
                <input type="number" min="0" step="0.01" value={topupForm.amount} onChange={(e)=>setTopupForm(prev=>({...prev, amount: e.target.value}))} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600" placeholder="e.g. 10,000" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Date</label>
                <input type="date" value={topupForm.date} onChange={(e)=>setTopupForm(prev=>({...prev, date: e.target.value}))} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Reason</label>
                <input type="text" value={topupForm.reason} onChange={(e)=>setTopupForm(prev=>({...prev, reason: e.target.value}))} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600" placeholder="e.g. Extra funds, bonus, correction" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Type</label>
                <input type="text" value={topupForm.type} onChange={(e)=>setTopupForm(prev=>({...prev, type: e.target.value}))} className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600" placeholder="e.g. Cash, Bank transfer" />
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