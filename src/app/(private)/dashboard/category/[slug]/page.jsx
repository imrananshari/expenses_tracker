"use client"
import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import client from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { getCategoryBySlug, getBudgetForMonth, upsertBudget, listExpenses, addExpense } from '@/api/db'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// Import budget components
import BudgetForm from '@/app/components/budget/BudgetForm'
import ExpenseForm from '@/app/components/budget/ExpenseForm'
import MiniSpendChart from '@/app/components/budget/MiniSpendChart'
// Mobile redesign uses custom list rows instead of table summary
import { Bell, LogOut, Home as HomeIcon, ShoppingCart, CreditCard, User, MoreHorizontal, Plus, X, Search, Calendar } from 'lucide-react'

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
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [budgetLoading, setBudgetLoading] = useState(true)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
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
        const [{ data: buyRows, error: buyErr }, { data: labRows, error: labErr }] = await Promise.all([
          listExpenses(user.id, cat.id, 'buying'),
          listExpenses(user.id, cat.id, 'labour')
        ])
        if (buyErr) console.error(buyErr)
        if (labErr) console.error(labErr)
        const buyMapped = (buyRows || []).map(e => ({ id: e.id, name: e.note || 'Expense', payee: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'buying' }))
        const labMapped = (labRows || []).map(e => ({ id: e.id, name: e.note || 'Expense', payee: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'labour' }))
        setExpensesBuying(buyMapped)
        setExpensesLabour(labMapped)
      } finally {
        setBudgetLoading(false)
      }
    }
    if (slug && user) {
      loadData()
    }
  }, [slug, user])

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
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
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
      {/* Mobile header (same style as dashboard) */}
      <div className="rounded-b-3xl px-4 pt-6 pb-8 bg-brand-dark text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={handleBackToDashboard} aria-label="Back" className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">←</button>
            <div>
              <p className="text-sm opacity-80">{category?.name}</p>
              <p className="text-base font-semibold capitalize">{displayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Notifications">
              <Bell className="w-5 h-5" />
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
    </div>
  )
}

export default CategoryPage