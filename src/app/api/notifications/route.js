import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdmin() {
  if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL')
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

function monthStartISO(d = new Date()) {
  const s = new Date(d.getFullYear(), d.getMonth(), 1)
  return s.toISOString().slice(0, 10)
}

function monthBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  }
}

async function getBudget(admin, userId, categoryId, period, end) {
  // First try exact month budget
  const { data: exact, error: exactErr } = await admin
    .from('budgets')
    .select('amount, period')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .eq('period', period)
    .maybeSingle()
  if (!exactErr && exact && typeof exact.amount !== 'undefined') {
    return { amount: Number(exact.amount || 0), sourcePeriod: exact.period, carriedForward: false }
  }
  // Fallback to latest earlier month budget
  const { data: fallback, error: fbErr } = await admin
    .from('budgets')
    .select('amount, period')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .lt('period', end)
    .order('period', { ascending: false })
    .limit(1)
  if (!fbErr && Array.isArray(fallback) && fallback.length) {
    return { amount: Number(fallback[0]?.amount || 0), sourcePeriod: fallback[0]?.period || null, carriedForward: true }
  }
  return { amount: 0, sourcePeriod: null, carriedForward: false }
}

export async function GET(req) {
  try {
    const admin = getAdmin()
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    // Fallback: compute locally
    const period = monthStartISO()
    const { start, end } = monthBounds()
    const { data: categories, error: catErr } = await admin
      .from('categories')
      .select('id, name, slug')
      .eq('user_id', userId)
    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 400 })

    const notifications = []
    for (const c of (categories || [])) {
      const [{ data: buyRows }, { data: labRows }, { data: topRows }] = await Promise.all([
        admin
          .from('expenses')
          .select('amount, spent_at')
          .eq('user_id', userId)
          .eq('category_id', c.id)
          .eq('kind', 'buying')
          .gte('spent_at', start)
          .lt('spent_at', end)
          .order('spent_at', { ascending: false })
          .limit(200),
        admin
          .from('expenses')
          .select('amount, spent_at')
          .eq('user_id', userId)
          .eq('category_id', c.id)
          .eq('kind', 'labour')
          .gte('spent_at', start)
          .lt('spent_at', end)
          .order('spent_at', { ascending: false })
          .limit(200),
        admin
          .from('expenses')
          .select('id, amount, note, spent_at')
          .eq('user_id', userId)
          .eq('category_id', c.id)
          .eq('kind', 'topup')
          .gte('spent_at', start)
          .lt('spent_at', end)
          .order('spent_at', { ascending: false })
          .limit(50),
      ])
      const budget = await getBudget(admin, userId, c.id, period, end)
      const budgetAmt = budget.amount
      const totalSpent = (buyRows || []).reduce((s, e) => s + Number(e.amount || 0), 0) + (labRows || []).reduce((s, e) => s + Number(e.amount || 0), 0)
      const overspent = Math.max(0, totalSpent - budgetAmt)
      // Only flag overspend when a budget exists for the month
      if (budgetAmt > 0 && overspent > 0) {
        notifications.push({
          id: `overspend-${c.slug}`,
          type: 'overspend',
          title: `Overspent in ${c.name}`,
          message: `Exceeded budget by ₹${overspent.toLocaleString()}. Spent ₹${totalSpent.toLocaleString()} of ₹${budgetAmt.toLocaleString()}.`,
          category_slug: c.slug,
          sourcePeriod: budget.sourcePeriod,
          carriedForward: budget.carriedForward,
          severity: 'danger',
          date: new Date().toISOString(),
        })
      }

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const recentCount = ([...(buyRows || []), ...(labRows || [])]).filter(e => {
        const t = e.spent_at ? new Date(e.spent_at).getTime() : 0
        return t >= sevenDaysAgo
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

      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000
      ;(topRows || []).filter(t => {
        const ts = t.spent_at ? new Date(t.spent_at).getTime() : 0
        return ts >= twoDaysAgo
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

    return NextResponse.json({ data: notifications }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}