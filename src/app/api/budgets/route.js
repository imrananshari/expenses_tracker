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

function toISODateString(y, m, d = 1) {
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

function normalizeMonthStart(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date()
  // Use local year/month directly to avoid timezone shifting when converting to UTC
  return toISODateString(d.getFullYear(), d.getMonth() + 1, 1)
}

function nextMonthStartISO(period) {
  const d = period ? new Date(period) : new Date()
  let y = d.getFullYear()
  let m = d.getMonth() + 2 // next month in 1..12
  if (m > 12) { y += 1; m = 1 }
  return toISODateString(y, m, 1)
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
    if (data) {
      // Load allocations for this budget (if tables exist)
      let allocations = []
      try {
        const { data: allocRows, error: allocErr } = await admin
          .from('budget_allocations')
          .select('source_id, amount, payment_sources(name, image_url)')
          .eq('user_id', userId)
          .eq('budget_id', data.id)
        if (!allocErr && Array.isArray(allocRows)) {
          allocations = allocRows.map(r => ({ source_id: r.source_id, bank: r.payment_sources?.name || null, image_url: r.payment_sources?.image_url || null, amount: r.amount }))
        }
      } catch {}
      return NextResponse.json({ data: { ...data, sourcePeriod: data.period, carriedForward: false, allocations } }, { status: 200 })
    }

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
    // If carrying forward, also try loading allocations from that budget id
    if (fallback?.id) {
      try {
        const { data: allocRows } = await admin
          .from('budget_allocations')
          .select('source_id, amount, payment_sources(name, image_url)')
          .eq('user_id', userId)
          .eq('budget_id', fallback.id)
        const allocations = Array.isArray(allocRows) ? allocRows.map(r => ({ source_id: r.source_id, bank: r.payment_sources?.name || null, image_url: r.payment_sources?.image_url || null, amount: r.amount })) : []
        return NextResponse.json({ data: { ...fallback, allocations } }, { status: 200 })
      } catch {}
    }
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
    const allocations = Array.isArray(body?.allocations) ? body.allocations : [] // [{bank, amount}] or [{source_id, amount}]
    const syncAllocations = Object.prototype.hasOwnProperty.call(body || {}, 'allocations')
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
      // Upsert allocations if provided
      const response = await upsertAllocations(admin, { userId, budgetId: existing.id, allocations, sync: syncAllocations })
      if (response.error) return NextResponse.json({ error: response.error }, { status: 400 })
      return NextResponse.json({ ...data, allocations: response.allocations }, { status: 200 })
    } else {
      const { data, error } = await admin
        .from('budgets')
        .insert({ user_id: userId, category_id: categoryId, period, amount })
        .select('id, user_id, category_id, period, amount')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      const response = await upsertAllocations(admin, { userId, budgetId: data.id, allocations, sync: syncAllocations })
      if (response.error) return NextResponse.json({ error: response.error }, { status: 400 })
      return NextResponse.json({ ...data, allocations: response.allocations }, { status: 200 })
    }
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}

// Helper: create sources if needed and upsert allocations
async function upsertAllocations(admin, { userId, budgetId, allocations, sync = false }) {
  const provided = Array.isArray(allocations)
  if (!provided) {
    return { allocations: [], error: null }
  }
  try {
    // Normalize input to { source_id?, bank?, amount }
    const normalized = allocations
      .map(a => ({
        source_id: a.source_id || null,
        bank: (a.bank ?? a.name ?? a.source_name ?? a.payment_source ?? '').trim(),
        amount: Number(a.amount || 0)
      }))
      .filter(a => (a.source_id || a.bank) && !isNaN(a.amount) && a.amount > 0)

    // If syncing and user cleared allocations, delete all existing for this budget
    if (sync && normalized.length === 0) {
      const { error: delErr } = await admin
        .from('budget_allocations')
        .delete()
        .eq('user_id', userId)
        .eq('budget_id', budgetId)
      if (delErr) return { allocations: [], error: delErr.message }
      return { allocations: [], error: null }
    }

    // Resolve or create source_ids when only bank names are provided
    const resolved = []
    for (const a of normalized) {
      let sourceId = a.source_id
      let bankName = a.bank
      let imageUrl = null
      if (!sourceId && bankName) {
        // Try find existing source with this name (GLOBAL by name)
        const { data: existing, error: srcErr } = await admin
          .from('payment_sources')
          .select('id, name, image_url')
          // Avoid user_id filter because name is globally unique in DB
          // Use case-insensitive exact match to reuse existing records
          .ilike('name', bankName)
          .maybeSingle()
        if (srcErr) return { allocations: [], error: srcErr.message }
        if (existing?.id) {
          sourceId = existing.id
          bankName = existing.name
          imageUrl = existing.image_url || null
        } else {
          const { data: created, error: insErr } = await admin
            .from('payment_sources')
            // Insert a new global payment source when none exists
            .insert({ user_id: userId, name: bankName })
            .select('id, name, image_url')
            .single()
          if (insErr) return { allocations: [], error: insErr.message }
          sourceId = created.id
          bankName = created.name
          imageUrl = created.image_url || null
        }
      }
      resolved.push({ source_id: sourceId, bank: bankName, image_url: imageUrl, amount: a.amount })
    }

    // Upsert each allocation by (budget_id, source_id)
    const results = []
    for (const r of resolved) {
      // Check if exists
      const { data: exists, error: selErr } = await admin
        .from('budget_allocations')
        .select('id')
        .eq('user_id', userId)
        .eq('budget_id', budgetId)
        .eq('source_id', r.source_id)
        .maybeSingle()
      if (selErr) return { allocations: [], error: selErr.message }
      if (exists?.id) {
        const { data: updated, error: updErr } = await admin
          .from('budget_allocations')
          .update({ amount: r.amount })
          .eq('id', exists.id)
          .select('source_id, amount')
          .single()
        if (updErr) return { allocations: [], error: updErr.message }
        results.push({ ...r, amount: updated.amount })
      } else {
        const { data: inserted, error: insErr } = await admin
          .from('budget_allocations')
          .insert({ user_id: userId, budget_id: budgetId, source_id: r.source_id, amount: r.amount })
          .select('source_id, amount')
          .single()
        if (insErr) return { allocations: [], error: insErr.message }
        results.push({ ...r, amount: inserted.amount })
      }
    }

    // Synchronize: delete any allocations not present in the payload
    if (sync) {
      const keep = new Set(resolved.map(r => r.source_id))
      const { data: existingRows, error: listErr } = await admin
        .from('budget_allocations')
        .select('id, source_id')
        .eq('user_id', userId)
        .eq('budget_id', budgetId)
      if (listErr) return { allocations: results, error: listErr.message }
      const toDeleteIds = (existingRows || [])
        .filter(row => !keep.has(row.source_id))
        .map(row => row.id)
      if (toDeleteIds.length) {
        const { error: delErr } = await admin
          .from('budget_allocations')
          .delete()
          .in('id', toDeleteIds)
        if (delErr) return { allocations: results, error: delErr.message }
      }
    }

    return { allocations: results, error: null }
  } catch (err) {
    return { allocations: [], error: err?.message || 'Failed to upsert allocations' }
  }
}