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

export async function GET(req) {
  try {
    const admin = getAdmin()
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const categoryId = searchParams.get('categoryId')
    const kind = searchParams.get('kind')
    const limit = Number(searchParams.get('limit') || 0)
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    let query = admin
      .from('expenses')
      .select('id, user_id, category_id, budget_id, amount, note, payee, kind, spent_at')
      .eq('user_id', userId)

    if (categoryId) query = query.eq('category_id', categoryId)
    if (kind) query = query.eq('kind', kind)
    query = query.order('spent_at', { ascending: false })
    if (limit && limit > 0) query = query.limit(limit)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ data: data || [] }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const admin = getAdmin()
    const body = await req.json()
    const userId = String(body?.userId || '')
    const categoryId = String(body?.categoryId || '')
    const budgetId = body?.budgetId || null
    const amount = Number(body?.amount || 0)
    const note = body?.note || null
    const payee = body?.payee || null
    const kind = body?.kind || 'buying'
    const spentAt = body?.spentAt || null
    if (!userId || !categoryId || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('expenses')
      .insert([{ user_id: userId, category_id: categoryId, budget_id: budgetId, amount, note, payee, kind, spent_at: spentAt || undefined }])
      .select('id, user_id, category_id, budget_id, amount, note, payee, kind, spent_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}