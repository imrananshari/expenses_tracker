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
      .select('id, user_id, category_id, budget_id, amount, note, payee, kind, spent_at, is_edited')
      .eq('user_id', userId)

    if (categoryId) query = query.eq('category_id', categoryId)
    if (kind) query = query.eq('kind', kind)
    query = query.order('spent_at', { ascending: false })
    if (limit && limit > 0) query = query.limit(limit)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const withEdited = (data || []).map((d) => {
      const { is_edited, ...rest } = d
      return { ...rest, edited: Boolean(is_edited) }
    })
    return NextResponse.json({ data: withEdited }, { status: 200 })
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
      .select('id, user_id, category_id, budget_id, amount, note, payee, kind, spent_at, is_edited')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const { is_edited, ...rest } = data
    return NextResponse.json({ ...rest, edited: Boolean(is_edited) }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const admin = getAdmin()
    const body = await req.json()
    const userId = String(body?.userId || '')
    const id = body?.id
    if (!userId || !id) {
      return NextResponse.json({ error: 'Missing userId or id' }, { status: 400 })
    }
    const update = {}
    if (typeof body?.amount !== 'undefined') update.amount = Number(body.amount)
    if (typeof body?.note !== 'undefined') update.note = body.note || null
    if (typeof body?.payee !== 'undefined') update.payee = body.payee || null
    if (typeof body?.kind !== 'undefined') update.kind = body.kind
    if (typeof body?.spentAt !== 'undefined') update.spent_at = body.spentAt || null
    if (typeof body?.budgetId !== 'undefined') update.budget_id = body.budgetId || null
    // Persist edited flag
    update.is_edited = true

    const { data, error } = await admin
      .from('expenses')
      .update(update)
      .eq('user_id', userId)
      .eq('id', id)
      .select('id, user_id, category_id, budget_id, amount, note, payee, kind, spent_at, is_edited')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const { is_edited, ...rest } = data
    return NextResponse.json({ ...rest, edited: Boolean(is_edited) }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req) {
  try {
    const admin = getAdmin()
    const body = await req.json()
    const userId = String(body?.userId || '')
    const id = body?.id
    if (!userId || !id) {
      return NextResponse.json({ error: 'Missing userId or id' }, { status: 400 })
    }
    const { error } = await admin
      .from('expenses')
      .delete()
      .eq('user_id', userId)
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}