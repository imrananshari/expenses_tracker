import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const admin = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

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

export async function GET(req) {
  try {
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
      return NextResponse.json({ data: data || [] }, { status: 200 })
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
    return NextResponse.json({ data: data || null }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const userId = String(body?.userId || '').trim()
    const categoryId = String(body?.categoryId || '').trim()
    const amount = Number(body?.amount || 0)
    const period = normalizeMonthStart(body?.period)
    if (!userId || !categoryId) {
      return NextResponse.json({ error: 'Missing userId or categoryId' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('budgets')
      .upsert({ user_id: userId, category_id: categoryId, period, amount }, { onConflict: 'user_id,category_id,period' })
      .select('id, user_id, category_id, period, amount')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}