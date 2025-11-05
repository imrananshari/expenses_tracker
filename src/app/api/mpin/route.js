import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const pepper = process.env.MPIN_PEPPER || ''

const admin = createClient(supabaseUrl || '', serviceRoleKey || '')

function hashMpin(email, mpin) {
  return crypto.createHash('sha256').update(`${email}:${mpin}:${pepper}`).digest('hex')
}

export async function POST(req) {
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })
  }
  try {
    const body = await req.json()
    const { email, mpin } = body || {}
    const cleanEmail = (email || '').trim().toLowerCase()
    const mpinStr = String(mpin || '').trim()

    if (!/.+@.+\..+/.test(cleanEmail)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }
    if (!/^\d{4}$/.test(mpinStr)) {
      return NextResponse.json({ error: 'M-PIN must be 4 digits' }, { status: 400 })
    }

    const mpin_hash = hashMpin(cleanEmail, mpinStr)

    const { data, error } = await admin
      .from('user_mpin')
      .upsert({ email: cleanEmail, mpin_hash })
      .select('email')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, email: data?.email })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}