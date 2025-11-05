import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Ensure this route runs on Node.js runtime
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
    const slug = searchParams.get('slug')
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // If slug provided, return single category. If missing, seed defaults if needed.
    if (slug) {
      const { data: single, error: singleErr } = await admin
        .from('categories')
        .select('id, user_id, name, slug, created_at')
        .eq('user_id', userId)
        .eq('slug', slug)
        .maybeSingle()
      if (singleErr) return NextResponse.json({ error: singleErr.message }, { status: 400 })
      if (single) return NextResponse.json({ data: single }, { status: 200 })

      // Ensure defaults exist, then try again
      const { count, error: cntErr } = await admin
        .from('categories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
      if (cntErr) return NextResponse.json({ error: cntErr.message }, { status: 400 })
      if (!count || count === 0) {
        const defaults = [
          { name: 'Monthly Grocery', slug: 'grocery' },
          { name: 'Home Building', slug: 'home-building' },
          { name: 'Subscription', slug: 'subscription' },
          { name: 'Personal Expenses', slug: 'personal' },
          { name: 'Other', slug: 'other' },
        ].map((d) => ({ ...d, user_id: userId }))
        const { error: insErr } = await admin.from('categories').insert(defaults)
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
      }
      const { data: afterSeed, error: afterErr } = await admin
        .from('categories')
        .select('id, user_id, name, slug, created_at')
        .eq('user_id', userId)
        .eq('slug', slug)
        .maybeSingle()
      if (afterErr) return NextResponse.json({ error: afterErr.message }, { status: 400 })
      if (!afterSeed) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ data: afterSeed }, { status: 200 })
    } else {
      const { data, error } = await admin
        .from('categories')
        .select('id, user_id, name, slug, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })

      if (!data || data.length === 0) {
        const defaults = [
          { name: 'Monthly Grocery', slug: 'grocery' },
          { name: 'Home Building', slug: 'home-building' },
          { name: 'Subscription', slug: 'subscription' },
          { name: 'Personal Expenses', slug: 'personal' },
          { name: 'Other', slug: 'other' },
        ].map((d) => ({ ...d, user_id: userId }))

        const { data: inserted, error: insErr } = await admin
          .from('categories')
          .insert(defaults)
          .select('id, user_id, name, slug, created_at')

        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
        return NextResponse.json({ data: inserted || [] }, { status: 200 })
      }

      return NextResponse.json({ data: data || [] }, { status: 200 })
    }
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const admin = getAdmin()
    const body = await req.json()
    const userId = String(body?.userId || '').trim()
    const nameRaw = String(body?.name || '').trim()
    let slugRaw = String(body?.slug || '').trim()

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }
    if (!nameRaw) {
      return NextResponse.json({ error: 'Missing category name' }, { status: 400 })
    }
    if (!slugRaw) {
      slugRaw = nameRaw.toLowerCase().replace(/\s+/g, '-')
    }

    // Insert category
    const { data, error } = await admin
      .from('categories')
      .insert([{ user_id: userId, name: nameRaw, slug: slugRaw }])
      .select('id, user_id, name, slug, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}