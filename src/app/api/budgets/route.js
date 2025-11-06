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

function normalizeMonthStart(dateStr) {
  if (!dateStr) {
    const d = new Date()
    const s = new Date(d.getFullYear(), d.getMonth(), 1)
    return s.toISOString().slice(0, 10)
  }
  const d = new Date(dateStr)
  const s = new Date(d.getFullYear(), d.getMonth(), 1)
  return s.toISOString().slice(0, 10)
}

function nextMonthStartISO(period) {
  const d = period ? new Date(period) : new Date()
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return end.toISOString().slice(0, 10)
}

export async function GET(req) {
  try {
    const admin = getAdmin()
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const categoryId = searchParams.get('categoryId')
    const categoryIdsParam = searchParams.get('categoryIds') // comma-separated ids
    const periodParam = searchParams.get('period')
    if (!userId || !categoryId) {
      if (!userId || (!categoryId && !categoryIdsParam)) {
        return NextResponse.json({ error: 'Missing userId or category id(s)' }, { status: 400 })
      }
    }
    const period = normalizeMonthStart(periodParam)

    // Bulk fetch when categoryIds are provided
    if (categoryIdsParam && !categoryId) {
      const ids = categoryIdsParam.split(',').map(s => s.trim()).filter(Boolean)
      const { data, error } = await admin
        .from('budgets')
        .select('id, user_id, category_id, period, amount')
        .eq('user_id', userId)
        .in('category_id', ids)
        .eq('period', period)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      const foundByCat = new Map((data || []).map(b => [String(b.category_id), b]))
      const end = nextMonthStartISO(period)
      // Carry-forward fallback: fill missing categories with latest earlier budget
      const results = []
      for (const id of ids) {
        const existing = foundByCat.get(String(id))
        if (existing) {
          results.push({ ...existing, sourcePeriod: existing.period, carriedForward: false })
          continue
        }
        const { data: fb, error: fbErr } = await admin
          .from('budgets')
          .select('id, user_id, category_id, period, amount')
          .eq('user_id', userId)
          .eq('category_id', id)
          .lt('period', end)
          .order('period', { ascending: false })
          .limit(1)
        if (!fbErr && Array.isArray(fb) && fb.length) {
          // Return the fallback row as-is (period reflects its original month)
          results.push({ ...fb[0], sourcePeriod: fb[0].period, carriedForward: true })
        }
      }
      return NextResponse.json({ data: results }, { status: 200 })
    }

    // Single category fetch
    const { data, error } = await admin
      .from('budgets')
      .select('id, user_id, category_id, period, amount')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .eq('period', period)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (data) return NextResponse.json({ data: { ...data, sourcePeriod: data.period, carriedForward: false } }, { status: 200 })

    // Carry-forward fallback: use latest earlier budget when the month has no entry
    const end = nextMonthStartISO(period)
    const { data: fb, error: fbErr } = await admin
      .from('budgets')
      .select('id, user_id, category_id, period, amount')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .lt('period', end)
      .order('period', { ascending: false })
      .limit(1)

    if (fbErr) return NextResponse.json({ error: fbErr.message }, { status: 400 })
    const fallback = Array.isArray(fb) && fb.length ? { ...fb[0], sourcePeriod: fb[0].period, carriedForward: true } : null
    return NextResponse.json({ data: fallback }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const admin = getAdmin()
    const body = await req.json()
    const userId = String(body?.userId || '').trim()
    const categoryId = String(body?.categoryId || '').trim()
    const amount = Number(body?.amount || 0)
    const period = normalizeMonthStart(body?.period)
    if (!userId || !categoryId) {
      return NextResponse.json({ error: 'Missing userId or categoryId' }, { status: 400 })
    }

    // Manual upsert to avoid dependency on a specific unique constraint existing in DB
    const { data: existing, error: selErr } = await admin
      .from('budgets')
      .select('id')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .eq('period', period)
      .maybeSingle()

    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 })

    if (existing?.id) {
      const { data, error } = await admin
        .from('budgets')
        .update({ amount })
        .eq('id', existing.id)
        .select('id, user_id, category_id, period, amount')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json(data, { status: 200 })
    } else {
      const { data, error } = await admin
        .from('budgets')
        .insert({ user_id: userId, category_id: categoryId, period, amount })
        .select('id, user_id, category_id, period, amount')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json(data, { status: 200 })
    }
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}