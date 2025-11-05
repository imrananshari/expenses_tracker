import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

function monthStartISO(d = new Date()) {
  const s = new Date(d.getFullYear(), d.getMonth(), 1)
  return s.toISOString().slice(0, 10)
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    // Try RPC first
    try {
      const { data, error } = await admin.rpc('list_notifications', { p_user_id: userId })
      if (!error) return NextResponse.json({ data: data || [] }, { status: 200 })
    } catch (e) {/* fallthrough to local */}

    // Fallback: compute locally
    const period = monthStartISO()
    const { data: categories, error: catErr } = await admin
      .from('categories')
      .select('id, name, slug')
      .eq('user_id', userId)
    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 400 })

    const notifications = []
    for (const c of (categories || [])) {
      const [{ data: budgetRow }, { data: buyRows }, { data: labRows }, { data: topRows }] = await Promise.all([
        admin
          .from('budgets')
          .select('amount')
          .eq('user_id', userId)
          .eq('category_id', c.id)
          .eq('period', period)
          .maybeSingle(),
        admin
          .from('expenses')
          .select('amount, spent_at')
          .eq('user_id', userId)
          .eq('category_id', c.id)
          .eq('kind', 'buying')
          .order('spent_at', { ascending: false })
          .limit(200),
        admin
          .from('expenses')
          .select('amount, spent_at')
          .eq('user_id', userId)
          .eq('category_id', c.id)
          .eq('kind', 'labour')
          .order('spent_at', { ascending: false })
          .limit(200),
        admin
          .from('expenses')
          .select('id, amount, note, spent_at')
          .eq('user_id', userId)
          .eq('category_id', c.id)
          .eq('kind', 'topup')
          .order('spent_at', { ascending: false })
          .limit(50),
      ])

      const budgetAmt = Number(budgetRow?.amount || 0)
      const totalSpent = (buyRows || []).reduce((s, e) => s + Number(e.amount || 0), 0) + (labRows || []).reduce((s, e) => s + Number(e.amount || 0), 0)
      const overspent = Math.max(0, totalSpent - budgetAmt)
      if (overspent > 0) {
        notifications.push({
          id: `overspend-${c.slug}`,
          type: 'overspend',
          title: `Overspent in ${c.name}`,
          message: `Exceeded budget by ₹${overspent.toLocaleString()}. Spent ₹${totalSpent.toLocaleString()} of ₹${budgetAmt.toLocaleString()}.`,
          categorySlug: c.slug,
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