"use client"
import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import client from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
  import { toast } from 'sonner'
  import { Bell, LogOut, IndianRupee, Plus, Home as HomeIcon, ShoppingCart, CreditCard, User, MoreHorizontal, Search, Calendar } from 'lucide-react'
import { getUserCategories, getBudgetForMonth, listRecentExpenses, addCategory } from '@/api/db'

  const Dashboard = () => {
  const router = useRouter()
  const { user, loading } = useAuth()
  const displayName = (user?.user_metadata?.name || user?.email || '').split('@')[0]
  const initials = (user?.user_metadata?.name || displayName || 'U').charAt(0).toUpperCase()
  const [walletTotal, setWalletTotal] = useState(0)
  const [categoryBudgets, setCategoryBudgets] = useState([]) // [{name, slug, amount}]
  const [categories, setCategories] = useState([]) // [{id, name, slug}]
  const [recent, setRecent] = useState([]) // recent expenses
  const [recentFilters, setRecentFilters] = useState({ search: '', dateFrom: '', dateTo: '' })
  const [recentDateDraft, setRecentDateDraft] = useState({ dateFrom: '', dateTo: '' })
  const [recentDatePopoverOpen, setRecentDatePopoverOpen] = useState(false)
  const scrollRef = useRef(null)
  
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

  useEffect(() => {
    const loadBudgets = async () => {
      if (!user) return
      try {
        const { data: cats, error } = await getUserCategories(user.id)
        if (error) {
          console.error(error)
          return
        }
        setCategories(cats || [])
        const now = new Date()
        let sum = 0
        const items = []
        for (const c of (cats || [])) {
          const { data: bRow } = await getBudgetForMonth(user.id, c.id, now)
          const amt = Number(bRow?.amount || 0)
          sum += amt
          items.push({ name: c.name, slug: c.slug, amount: amt })
        }
        // Sort to show higher budgets first (optional)
        items.sort((a, b) => b.amount - a.amount)
        setCategoryBudgets(items)
        setWalletTotal(sum)

        // recent transactions across all categories
        const { data: rec } = await listRecentExpenses(user.id, 5)
        setRecent(rec || [])
      } catch (err) {
        console.error('Failed to load budgets', err)
      }
    }
    loadBudgets()
  }, [user])

  const handleCategoryOpen = (slug) => {
    router.push(`/dashboard/category/${slug}`)
  }

  const handleAddCategory = async () => {
    if (!user) return
    const name = window.prompt('Enter category name')
    if (!name) return
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-')
    const { error } = await addCategory(user.id, { name, slug })
    if (error) {
      toast.error('Failed to add category')
      return
    }
    toast.success('Category added')
    // refresh
    const { data: cats } = await getUserCategories(user.id)
    setCategories(cats || [])
  }

  // Choose an icon based on category name
  const getCategoryIcon = (name) => {
    const n = (name || '').toLowerCase()
    if (n.includes('home')) return HomeIcon
    if (n.includes('grocery')) return ShoppingCart
    if (n.includes('subscription')) return CreditCard
    if (n.includes('personal')) return User
    return MoreHorizontal
  }

  // Protect the dashboard route
  if (!loading && !user) {
    router.push('/')
    return null
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  // Derived: show only budgets with assigned amounts and total sum
  const visibleBudgets = (categoryBudgets || []).filter(b => Number(b.amount) > 0)
  const totalBudget = (categoryBudgets || []).reduce((sum, b) => sum + Number(b.amount || 0), 0)

  // Auto-scroll budgets three-at-a-time
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const pages = Math.max(1, Math.ceil(visibleBudgets.length / 3))
    let page = 0
    const tick = () => {
      const pageWidth = el.clientWidth
      page = (page + 1) % pages
      el.scrollTo({ left: page * pageWidth, behavior: 'smooth' })
    }
    const id = setInterval(tick, 4000)
    return () => clearInterval(id)
  }, [visibleBudgets.length])

  // Helpers for Recent filters (must be inside component for state access)
  const updateRecentFilter = (field, value) => {
    setRecentFilters(prev => ({ ...prev, [field]: value }))
  }

  const toggleRecentDatePopover = () => {
    setRecentDatePopoverOpen(v => !v)
    // initialize draft from current filters when opening
    setRecentDateDraft({ dateFrom: recentFilters.dateFrom || '', dateTo: recentFilters.dateTo || '' })
  }

  const applyRecentDateRange = () => {
    setRecentFilters(prev => ({ ...prev, dateFrom: recentDateDraft.dateFrom, dateTo: recentDateDraft.dateTo }))
    setRecentDatePopoverOpen(false)
  }

  const clearRecentDateRange = () => {
    setRecentDateDraft({ dateFrom: '', dateTo: '' })
    setRecentFilters(prev => ({ ...prev, dateFrom: '', dateTo: '' }))
    setRecentDatePopoverOpen(false)
  }

  const applyRecentFilters = (items = []) => {
    const q = (recentFilters.search || '').trim().toLowerCase()
    const from = recentFilters.dateFrom ? new Date(recentFilters.dateFrom) : null
    const to = recentFilters.dateTo ? new Date(recentFilters.dateTo) : null
    if (from) from.setHours(0,0,0,0)
    if (to) to.setHours(23,59,59,999)

    return items.filter(e => {
      // text match against note, payee, and category name
      const catItem = (categories || []).find(c => c.id === e.category_id)
      const catName = (catItem?.name || '').toLowerCase()
      const note = (e.note || '').toLowerCase()
      const payee = (e.payee || '').toLowerCase()
      const textOk = q ? (note.includes(q) || payee.includes(q) || catName.includes(q)) : true

      // date match against spent_at
      const d = e.spent_at ? new Date(e.spent_at) : null
      const dateOk = (!from || (d && d >= from)) && (!to || (d && d <= to))
      return textOk && dateOk
    })
  }

  return (
    <div className="max-w-md mx-auto">
      {/* Mobile header */}
      <div className="rounded-b-3xl px-4 pt-6 pb-8 bg-brand-dark text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
              {initials}
            </div>
            <div>
              <p className="text-sm opacity-80">Hello,</p>
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

        {/* Budget Cards Section */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm opacity-90">Your Budgets</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-brand-soft">Total Budget</span>
              <span className="font-extrabold text-3xl text-[var(--amount-green)]">₹{totalBudget.toLocaleString()}</span>
            </div>
          </div>
          <div ref={scrollRef} className="budget-cards-container overflow-x-auto no-scrollbar mt-2 px-2">
            <div className="budget-cards-scroll flex gap-4">
              {categoryBudgets
                .filter(budget => budget.amount > 0)
                .map((budget) => {
                  const Icon = getCategoryIcon(budget.name)
                  return (
                <div key={budget.slug} className="budget-card flex-shrink-0 bg-brand-dark rounded-xl p-4 text-center border border-white/20">
                  <span className="w-8 h-8 rounded-full chip-ring mx-auto mb-2 block">
                    <span className="w-full h-full rounded-full bg-brand-dark flex items-center justify-center">
                      <Icon className="w-5 h-5 text-white" />
                    </span>
                  </span>
                  <div className="text-brand-soft text-xs mb-1 truncate">
                    {budget.name}
                  </div>
                  <div className="font-extrabold text-2xl text-[var(--amount-green)]">
                    ₹{Number(budget.amount).toLocaleString()}
                  </div>
                </div>
              )})}
            </div>
          </div>
          {categoryBudgets.length === 0 && (
            <div className="px-3 py-2 rounded-xl bg-white/10 text-white/90 text-sm">No budgets set yet</div>
          )}
        </div>
      </div>

      {/* Categories section: header with right-corner Add, chips below (no scrollbar UI) */}
      <div className="px-4 py-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Categories</h3>
          <button
            onClick={handleAddCategory}
            className="h-8 w-8 rounded-full bg-white/90 dark:bg-zinc-800 shadow flex items-center justify-center ring-1 ring-[var(--brand-primary)]/30"
            aria-label="Add category"
            title="Add category"
          >
            <Plus className="w-5 h-5 text-[var(--brand-primary)]" />
          </button>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-4 min-w-full">
            {categories.map((c) => {
              const Icon = getCategoryIcon(c.name)
              return (
                <button key={c.slug} onClick={() => handleCategoryOpen(c.slug)} className="inline-flex flex-col items-center chip-breath hover:scale-105 transition-transform">
                  <span className="w-14 h-14 rounded-full chip-ring">
                    <span className="w-full h-full rounded-full bg-brand-dark flex items-center justify-center">
                      <Icon className="w-6 h-6 text-[var(--amount-green)]" />
                    </span>
                  </span>
                <span className="mt-2 text-xs max-w-[5rem] truncate text-black">{c.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Recent Expenses (only section) */}
      <div className="px-4 pb-6">
        <div className="p-4 bg-white dark:bg-zinc-800 rounded-xl shadow">
          <div className="relative flex items-center mb-3 gap-2">
            <h3 className="font-semibold">Recent Expenses</h3>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-700 rounded-md px-3 py-1 w-full max-w-xs">
                <Search className="w-4 h-4" />
                <input
                  type="text"
                  value={recentFilters.search}
                  onChange={(e) => updateRecentFilter('search', e.target.value)}
                  placeholder="Search"
                  className="bg-transparent text-sm w-full outline-none"
                />
              </div>
              <button
                type="button"
                onClick={toggleRecentDatePopover}
                className="inline-flex items-center justify-center bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 hover:bg-gray-200"
                title="Filter by date"
                aria-label="Filter by date"
              >
                <Calendar className="w-4 h-4" />
              </button>
              {recentDatePopoverOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-white dark:bg-zinc-800 rounded-md shadow z-10">
                  <div className="text-sm font-medium mb-2">Date range</div>
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={recentDateDraft.dateFrom}
                      onChange={(e) => setRecentDateDraft(prev => ({ ...prev, dateFrom: e.target.value }))}
                      className="w-full bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 text-xs"
                    />
                    <input
                      type="date"
                      value={recentDateDraft.dateTo}
                      onChange={(e) => setRecentDateDraft(prev => ({ ...prev, dateTo: e.target.value }))}
                      className="w-full bg-gray-100 dark:bg-zinc-700 rounded-md px-2 py-1 text-xs"
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={clearRecentDateRange} className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200">Clear</button>
                      <button type="button" onClick={applyRecentDateRange} className="text-xs px-2 py-1 rounded-md bg-black text-white">Apply</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {applyRecentFilters(recent).map((r) => {
              const catItem = (categories || []).find(c => c.id === r.category_id)
              const catName = catItem?.name || 'Category'
              const CatIcon = getCategoryIcon(catName)
              return (
                <div key={r.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <span className="h-7 w-7 rounded-full chip-ring grid place-items-center">
                      <CatIcon className="w-4 h-4 text-white" />
                    </span>
                    <div className="leading-tight">
                      <div className="text-sm font-medium">{r.note || 'Expense'}</div>
                      <div className="text-[11px] text-black">{catName}{r.payee ? ` • ${r.payee}` : ''}</div>
                    </div>
                  </div>
                  <div className="text-right leading-tight">
                    <div className="text-sm font-semibold text-[var(--amount-green)]">₹{Number(r.amount).toLocaleString()}</div>
                    <div className="text-[11px] text-gray-500">{new Date(r.spent_at).toLocaleDateString()}</div>
                  </div>
                </div>
              )
            })}
            {applyRecentFilters(recent).length === 0 && (
              <div className="text-sm text-gray-500">No recent expenses</div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

export default Dashboard