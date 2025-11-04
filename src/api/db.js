import client from './client'

// Categories
export async function getUserCategories(userId) {
  return client
    .from('categories')
    .select('id, user_id, name, slug, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
}

export async function getCategoryBySlug(userId, slug) {
  return client
    .from('categories')
    .select('id, user_id, name, slug')
    .eq('user_id', userId)
    .eq('slug', slug)
    .single()
}

export async function addCategory(userId, { name, slug }) {
  return client
    .from('categories')
    .insert([{ user_id: userId, name, slug }])
    .select('id, user_id, name, slug, created_at')
    .single()
}

// Budgets
export async function getBudgetForMonth(userId, categoryId, periodDate) {
  const period = new Date(periodDate || Date.now())
  const monthStart = new Date(period.getFullYear(), period.getMonth(), 1)
  const iso = monthStart.toISOString().slice(0, 10) // YYYY-MM-DD
  return client
    .from('budgets')
    .select('id, user_id, category_id, period, amount')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .eq('period', iso)
    .maybeSingle()
}

export async function upsertBudget(userId, categoryId, amount, periodDate) {
  const period = new Date(periodDate || Date.now())
  const monthStart = new Date(period.getFullYear(), period.getMonth(), 1)
  const iso = monthStart.toISOString().slice(0, 10)
  return client
    .from('budgets')
    .upsert({ user_id: userId, category_id: categoryId, period: iso, amount }, { onConflict: 'user_id,category_id,period' })
    .select('id, user_id, category_id, period, amount')
    .single()
}

// Bulk budgets for a set of categories for the current month
export async function getBudgetsForMonthBulk(userId, categoryIds = [], periodDate) {
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    return { data: [], error: null }
  }
  const period = new Date(periodDate || Date.now())
  const monthStart = new Date(period.getFullYear(), period.getMonth(), 1)
  const iso = monthStart.toISOString().slice(0, 10) // YYYY-MM-DD
  return client
    .from('budgets')
    .select('id, user_id, category_id, period, amount')
    .eq('user_id', userId)
    .in('category_id', categoryIds)
    .eq('period', iso)
}

// Expenses
export async function listExpenses(userId, categoryId, kind) {
  let query = client
    .from('expenses')
    .select('id, user_id, category_id, budget_id, amount, note, payee, kind, spent_at')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .order('spent_at', { ascending: false })

  if (kind) {
    query = query.eq('kind', kind)
  }
  return query
}

export async function addExpense(userId, { categoryId, budgetId, amount, note, payee, kind, spentAt }) {
  return client
    .from('expenses')
    .insert([{ user_id: userId, category_id: categoryId, budget_id: budgetId || null, amount, note, payee: payee || null, kind: kind || 'buying', spent_at: spentAt || undefined }])
    .select('id, user_id, category_id, budget_id, amount, note, payee, kind, spent_at')
    .single()
}

// Recent expenses across all categories for a user
export async function listRecentExpenses(userId, limit) {
  let query = client
    .from('expenses')
    .select('id, user_id, category_id, amount, note, payee, kind, spent_at')
    .eq('user_id', userId)
    .order('spent_at', { ascending: false })

  // Apply a limit only if provided and valid; otherwise return all
  if (typeof limit === 'number' && limit > 0) {
    query = query.limit(limit)
  }

  return query
}

// Build notifications from current API data for a user
// Local computation fallback (used if RPC is unavailable)
export async function listNotificationsLocal(userId) {
  try {
    const { data: categories, error: catErr } = await getUserCategories(userId)
    if (catErr) return { data: [], error: catErr }

    const notifications = []
    for (const c of (categories || [])) {
      const { data: budgetRow } = await getBudgetForMonth(userId, c.id)
      const amt = Number(budgetRow?.amount || 0)

      const [ { data: buyRows }, { data: labRows }, { data: topRows } ] = await Promise.all([
        listExpenses(userId, c.id, 'buying'),
        listExpenses(userId, c.id, 'labour'),
        listExpenses(userId, c.id, 'topup'),
      ])

      const totalSpent = (buyRows||[]).reduce((s,e)=>s+Number(e.amount||0),0) + (labRows||[]).reduce((s,e)=>s+Number(e.amount||0),0)
      const overspent = Math.max(0, totalSpent - amt)
      if (overspent > 0) {
        notifications.push({
          id: `overspend-${c.slug}`,
          type: 'overspend',
          title: `Overspent in ${c.name}`,
          message: `Exceeded budget by ₹${overspent.toLocaleString()}. Spent ₹${totalSpent.toLocaleString()} of ₹${amt.toLocaleString()}.`,
          categorySlug: c.slug,
          severity: 'danger',
          date: new Date().toISOString(),
        })
      }

      const sevenDaysAgoTs = Date.now() - 7 * 24 * 60 * 60 * 1000
      const recentCount = ([...(buyRows||[]), ...(labRows||[])]).filter(e => {
        const dTs = e.spent_at ? new Date(e.spent_at).getTime() : null
        return dTs && dTs >= sevenDaysAgoTs
      }).length
      if (recentCount >= 5) {
        notifications.push({
          id: `freq-${c.slug}`,
          type: 'frequent',
          title: `Frequent spending in ${c.name}`,
          message: `${recentCount} expenses in the last 7 days. Consider reviewing.`,
          categorySlug: c.slug,
          severity: 'warning',
          date: new Date().toISOString(),
        })
      }

      const twoDaysAgoTs = Date.now() - 2 * 24 * 60 * 60 * 1000
      (topRows || []).filter(t => {
        const dTs = t.spent_at ? new Date(t.spent_at).getTime() : null
        return dTs && dTs >= twoDaysAgoTs
      }).forEach(t => {
        notifications.push({
          id: `topup-${t.id}`,
          type: 'topup',
          title: `Budget increased in ${c.name}`,
          message: `Added ₹${Number(t.amount).toLocaleString()} • ${t.note || 'Top-up'}`,
          categorySlug: c.slug,
          severity: 'info',
          date: t.spent_at || new Date().toISOString(),
        })
      })
    }
    return { data: notifications, error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

// Preferred: RPC-based notifications; falls back to local computation on error
export async function listNotifications(userId) {
  try {
    const { data, error } = await client.rpc('list_notifications', { p_user_id: userId })
    if (error) throw error
    return { data: data || [], error: null }
  } catch (err) {
    return await listNotificationsLocal(userId)
  }
}