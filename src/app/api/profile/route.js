import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const admin = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '')

export async function POST(req) {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })
  }
  try {
    const body = await req.json()
    const email = String(body?.email || '').trim().toLowerCase()
    const name = String(body?.name || '').trim()
    const avatarUrl = String(body?.avatarUrl || '').trim()
    const bodyUserId = String(body?.userId || '').trim()

    if (!email || !/.+@.+\..+/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    // Resolve user_id: prefer explicit userId, else find by email via admin list
    let userId = bodyUserId
    if (!userId) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
      if (listErr) {
        return NextResponse.json({ error: listErr.message }, { status: 500 })
      }
      const users = list?.users || list?.data?.users || []
      const match = users.find((u) => String(u?.email || '').toLowerCase() === email)
      userId = match?.id || ''
    }
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const payload = { user_id: userId }
    if (name) payload.name = name
    if (avatarUrl) payload.avatar_url = avatarUrl

    // Update if row exists; otherwise insert
    const { data: existing, error: existErr } = await admin
      .from('profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (existErr) {
      return NextResponse.json({ error: existErr.message }, { status: 400 })
    }
    let data, error
    if (existing?.user_id) {
      ({ data, error } = await admin
        .from('profiles')
        .update(payload)
        .eq('user_id', userId)
        .select('user_id, name, avatar_url')
        .single())
    } else {
      ({ data, error } = await admin
        .from('profiles')
        .insert(payload)
        .select('user_id, name, avatar_url')
        .single())
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true, profile: data })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}