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