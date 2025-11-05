"use client"
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import client from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
  import { toast } from 'sonner'
import { Bell, LogOut, IndianRupee, Plus, Home as HomeIcon, ShoppingCart, CreditCard, User, MoreHorizontal, Search, Calendar, AlertCircle, AlertTriangle, PlusCircle, Pencil } from 'lucide-react'
import { getUserCategories, getBudgetsForMonthBulk, listRecentExpenses, addCategory, listNotifications, maybeGetAvatarUrlForEmail, getPublicAvatarUrl, uploadAvatarDataUrl, getProfileForUser, upsertProfileByEmail } from '@/api/db'
import LoadingOverlay from '@/app/components/LoadingOverlay'

  const Dashboard = () => {
  const router = useRouter()
  const { user, loading, signOut } = useAuth()
  const [sessionUser, setSessionUser] = useState(null)
  const effectiveUser = user || sessionUser
  const [profile, setProfile] = useState(null)
  const displayName = (profile?.name || effectiveUser?.user_metadata?.name || effectiveUser?.email || '').split('@')[0]
  const initials = (effectiveUser?.user_metadata?.name || displayName || 'U').charAt(0).toUpperCase()
  const [avatarOverride, setAvatarOverride] = useState('')
  const [avatarUpdating, setAvatarUpdating] = useState(false)
  const fileInputRef = useRef(null)
  const avatarUrlBase = profile?.avatar_url ? profile.avatar_url : ''
  const avatarUrl = avatarOverride || avatarUrlBase
  const avatarExts = ['.jpg', '.png', '.webp']
  const [avatarTryIndex, setAvatarTryIndex] = useState(0)
  const [walletTotal, setWalletTotal] = useState(0)
  const [categoryBudgets, setCategoryBudgets] = useState([]) // [{name, slug, amount}]
  const [categories, setCategories] = useState([]) // [{id, name, slug}]
  const [recent, setRecent] = useState([]) // recent expenses
  const [recentFilters, setRecentFilters] = useState({ search: '', dateFrom: '', dateTo: '' })
  const [recentDateDraft, setRecentDateDraft] = useState({ dateFrom: '', dateTo: '' })
  const [recentDatePopoverOpen, setRecentDatePopoverOpen] = useState(false)
  const [recentVisibleCount, setRecentVisibleCount] = useState(5)
  const recentScrollRef = useRef(null)
  const recentSentinelRef = useRef(null)
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const scrollRef = useRef(null)
  const [notifications, setNotifications] = useState([]) // {id,type,title,message,categorySlug,severity,date}
  const [showNotifications, setShowNotifications] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [overlayVisible, setOverlayVisible] = useState(true)
  const overlayStartRef = useRef(0)

  // Bridge: if context user not ready immediately after login, read session user
  useEffect(() => {
    let cancelled = false
    const syncSession = async () => {
      if (user) { setSessionUser(null); return }
      const { data } = await client.auth.getSession()
      if (cancelled) return
      setSessionUser(data?.session?.user || null)
    }
    syncSession()
    const { data: sub } = client.auth.onAuthStateChange((evt, session) => {
      if (evt === 'SIGNED_IN' || evt === 'USER_UPDATED' || evt === 'TOKEN_REFRESHED') {
        setSessionUser(session?.user || null)
      }
      if (evt === 'SIGNED_OUT') {
        setSessionUser(null)
      }
    })
    return () => { cancelled = true; sub?.subscription?.unsubscribe?.() }
  }, [user])
  
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

  useEffect(() => {
    let cancelled = false
    const loadProfile = async () => {
      if (!effectiveUser?.id || cancelled) { setProfile(null); return }
      try {
        const { data, error } = await getProfileForUser(effectiveUser.id)
        if (cancelled) return
        if (error && effectiveUser?.id) {
          // Use warn in dev to avoid Next overlay; ignore after sign-out
          console.warn('Profile load warning:', error)
        }
        setProfile(data || null)
      } catch (err) {
        if (cancelled) return
        console.warn('Failed to load profile', err)
      }
    }
    loadProfile()
    return () => { cancelled = true }
  }, [effectiveUser?.id])

  // Independently attempt to resolve a valid avatar URL by checking known extensions
  useEffect(() => {
    const run = async () => {
      if (!effectiveUser?.email) return
      try {
        // Prefer profile-provided URL; else try public URLs by extension
        if (profile?.avatar_url) {
          setAvatarOverride(profile.avatar_url)
          return
        }
        const firstUrl = getPublicAvatarUrl(effectiveUser.email, avatarExts[0])
        setAvatarTryIndex(0)
        setAvatarOverride(firstUrl || '')
      } catch {
        setAvatarOverride('')
      }
    }
    run()
  }, [effectiveUser?.email, profile?.avatar_url])

  useEffect(() => {
    const loadBudgets = async () => {
      if (!effectiveUser?.id) { setIsLoading(false); return }
      setIsLoading(true)
      overlayStartRef.current = Date.now()
      setOverlayVisible(true)
      try {
        const { data: cats, error } = await getUserCategories(effectiveUser.id)
        if (error) {
          console.error(error)
          setIsLoading(false)
          return
        }
        setCategories(cats || [])

        const ids = (cats || []).map(c => c.id)
        const { data: budgetRows } = await getBudgetsForMonthBulk(effectiveUser.id, ids)
        const byCategory = new Map((budgetRows || []).map(b => [b.category_id, Number(b.amount || 0)]))

        let sum = 0
        const items = (cats || []).map(c => {
          const amt = Number(byCategory.get(c.id) || 0)
          sum += amt
          return { name: c.name, slug: c.slug, amount: amt }
        })

        items.sort((a, b) => b.amount - a.amount)
        setCategoryBudgets(items)
        setWalletTotal(sum)

        const { data: newNotifications } = await listNotifications(effectiveUser.id)

        // recent transactions across all categories (limit for faster load)
        const { data: rec } = await listRecentExpenses(effectiveUser.id, 20)
        setRecent(rec || [])
        setNotifications(newNotifications || [])
      } catch (err) {
        console.error('Failed to load budgets', err)
      } finally {
        setIsLoading(false)
        const elapsed = Date.now() - overlayStartRef.current
        const MIN_MS = 1500
        if (elapsed < MIN_MS) {
          setTimeout(() => setOverlayVisible(false), MIN_MS - elapsed)
        } else {
          setOverlayVisible(false)
        }
      }
    }
    loadBudgets()
  }, [effectiveUser?.id])

  // Badge uses API-derived notifications now; no localStorage syncing needed

  const handleCategoryOpen = (slug) => {
    router.push(`/dashboard/category/${slug}`)
  }

  const handleAddCategory = async () => {
    if (!effectiveUser || addingCat) return
    const name = newCatName.trim()
    if (!name) {
      toast.error('Please enter a category name')
      return
    }
    setAddingCat(true)
    try {
      const slug = name.toLowerCase().replace(/\s+/g, '-')
      const { error } = await addCategory(effectiveUser.id, { name, slug })
      if (error) {
        toast.error('Failed to add category')
        return
      }
      toast.success('Category added')
      setShowAddCategoryModal(false)
      setNewCatName('')
      const { data: cats } = await getUserCategories(effectiveUser.id)
      setCategories(cats || [])
    } finally {
      setAddingCat(false)
    }
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

  const filteredRecent = useMemo(() => applyRecentFilters(recent), [recent, recentFilters, categories])

  // Reset visible count when filters or data change
  useEffect(() => {
    setRecentVisibleCount(5)
  }, [recentFilters, recent.length])

  // Infinite load more when reaching sentinel
  useEffect(() => {
    const root = recentScrollRef.current || null
    const sentinel = recentSentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setRecentVisibleCount((prev) => Math.min(prev + 5, filteredRecent.length))
        }
      })
    }, { root, threshold: 1.0 })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [filteredRecent.length])

  // Show loader after all hooks are declared to avoid hook-order mismatch on sign-out
  if (!effectiveUser) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col">
      <LoadingOverlay visible={overlayVisible} />
      {/* Mobile header (12px rounded bottom with 3D shadow) */}
      <div className="px-4 pt-6 pb-6 bg-brand-dark text-white rounded-b-xl  shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile"
                className="w-10 h-10 rounded-full object-cover"
                onError={() => {
                  // Try the next extension; fall back to initials when exhausted
                  const next = avatarTryIndex + 1
                  if (next < avatarExts.length && effectiveUser?.email) {
                    setAvatarTryIndex(next)
                    setAvatarOverride(getPublicAvatarUrl(effectiveUser.email, avatarExts[next]) || '')
                  } else {
                    setAvatarOverride('')
                  }
                }}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
                {initials}
              </div>
            )}
            <div>
              <p className="text-sm opacity-80">Hello,</p>
              <p className="text-base font-semibold capitalize">{displayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="relative p-2 rounded-full bg-white/10 hover:bg-white/20"
              aria-label="Notifications"
              onClick={() => router.push('/dashboard/notifications')}
            >
              <Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[1rem] px-1 grid place-items-center rounded-full bg-red-600 text-white text-[10px] leading-none">
                  {notifications.length}
                </span>
              )}
            </button>
            {/* Edit avatar (re-upload) */}
            <button
              className="p-2 rounded-full bg-white/10 hover:bg-white/20"
              aria-label="Edit avatar"
              title="Edit avatar"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUpdating}
            >
              <Pencil className="w-5 h-5" />
            </button>
            <button onClick={handleSignOut} className="p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Sign out">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
          {/* Hidden file input for avatar re-upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file || !effectiveUser?.email) return
              if (file.size > 5 * 1024 * 1024) { // 5MB limit
                toast.error('File too large. Max 5MB.')
                return
              }
              try {
                setAvatarUpdating(true)
                const reader = new FileReader()
                reader.onload = async () => {
                  try {
                    const dataUrl = reader.result
                    const { url, error } = await uploadAvatarDataUrl(effectiveUser.email, dataUrl)
                    if (error) {
                      throw error
                    }
                    toast.success('Profile image updated')
                    // Bust cache to show fresh image immediately
                    setAvatarOverride((url || avatarUrlBase) + `?t=${Date.now()}`)
                    try {
                      const { error: profErr } = await upsertProfileByEmail(effectiveUser.email, { avatarUrl: url, userId: effectiveUser.id })
                      if (profErr) {
                        throw profErr
                      }
                      setProfile(p => ({ ...(p || {}), avatar_url: url }))
                    } catch (e) {
                      console.warn('Profile upsert failed', e)
                      toast.warning('Saved image, but profile record did not update')
                    }
                  } catch (err) {
                    console.error('Avatar update failed', err)
                    toast.error('Failed to update avatar')
                  } finally {
                    setAvatarUpdating(false)
                  }
                }
                reader.readAsDataURL(file)
              } catch (err) {
                setAvatarUpdating(false)
                console.error('Avatar read failed', err)
                toast.error('Unable to read selected file')
              }
            }}
          />
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
            onClick={() => setShowAddCategoryModal(true)}
            className="h-8 w-8 rounded-full bg-white/90 dark:bg-zinc-800 shadow flex items-center justify-center ring-1 ring-[var(--brand-primary)]/30"
            aria-label="Add category"
            title="Add category"
          >
            <Plus className="w-5 h-5 text-[var(--brand-primary)]" />
          </button>
        </div>
        <div className="overflow-x-auto no-scrollbar mt-4 mb-2">
          <div className="flex items-center gap-5 min-w-full">
            {categories.map((c) => {
              const Icon = getCategoryIcon(c.name)
              return (
                <Link
                  key={c.slug}
                  href={`/dashboard/category/${c.slug}`}
                  prefetch
                  className="inline-flex flex-col items-center transition-colors hover:brightness-105 select-none"
                >
                  <span className="w-14 h-14 rounded-full chip-ring shadow-3d">
                    <span className="w-full h-full rounded-full bg-brand-dark flex items-center justify-center">
                      <Icon className="w-6 h-6 text-[var(--amount-green)]" />
                    </span>
                  </span>
                  <span className="mt-2 text-xs max-w-[5rem] truncate text-black">{c.name}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddCategoryModal(false)}></div>
          <div className="relative z-10 w-full max-w-sm mx-4 p-4 bg-white dark:bg-zinc-800 rounded-xl shadow ring-1 ring-[var(--brand-primary)]/20">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold">Add New Category</h4>
              <button
                onClick={() => setShowAddCategoryModal(false)}
                aria-label="Close"
                className="grid place-items-center h-8 w-8 rounded-full bg-gray-200 dark:bg-zinc-700"
              >
                <span className="sr-only">Close</span>
                <span className="leading-none">✕</span>
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="newCategoryName" className="text-sm font-medium">Category Name</label>
                <input
                  id="newCategoryName"
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600"
                  placeholder="e.g. Home Building, Grocery, Subscription"
                  autoFocus
                  disabled={addingCat}
                />
              </div>
              <button
                type="button"
                onClick={handleAddCategory}
                className="w-full rounded-md bg-brand-dark text-white py-2 ring-1 ring-[var(--brand-primary)]/30 disabled:opacity-60"
                disabled={addingCat}
              >
                {addingCat ? 'Adding...' : 'Add Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Expenses scrollable area */}
      <div ref={recentScrollRef} className="flex-1 overflow-y-auto scroll-smooth px-4 pb-6">
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
            {filteredRecent.slice(0, recentVisibleCount).map((r) => {
              const catItem = (categories || []).find(c => c.id === r.category_id)
              const catName = catItem?.name || 'Category'
              const CatIcon = getCategoryIcon(catName)
              return (
                <div key={r.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <span className="h-7 w-7 rounded-full chip-ring shadow-3d grid place-items-center">
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
            {filteredRecent.length === 0 && (
              <div className="text-sm text-gray-500">No recent expenses</div>
            )}
            {/* Sentinel for infinite loading */}
            {filteredRecent.length > recentVisibleCount && (
              <div ref={recentSentinelRef} className="h-8 grid place-items-center text-xs text-gray-500">Loading more…</div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

export default Dashboard