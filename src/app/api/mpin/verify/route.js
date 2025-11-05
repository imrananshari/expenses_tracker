import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Ensure Node runtime for crypto and admin SDK
export const runtime = 'nodejs'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const pepper = process.env.MPIN_PEPPER || ''

function getAdmin() {
  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL')
  if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createClient(supabaseUrl, serviceRoleKey)
}

function hashMpin(email, mpin) {
  return crypto.createHash('sha256').update(`${email}:${mpin}:${pepper}`).digest('hex')
}

export async function POST(req) {
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })
  }
  try {
    const admin = getAdmin()
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

    const { data: exists, error: selErr } = await admin
      .from('user_mpin')
      .select('email')
      .eq('email', cleanEmail)
      .eq('mpin_hash', mpin_hash)
      .maybeSingle()

    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 })
    if (!exists) return NextResponse.json({ ok: false, error: 'Invalid M-PIN' }, { status: 401 })

    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: cleanEmail })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const tokenHash = data?.properties?.hashed_token
    const otp = data?.properties?.email_otp
    const actionLink = data?.properties?.action_link
    if (!tokenHash && !otp) return NextResponse.json({ error: 'Token generation failed' }, { status: 500 })

    // Prefer token_hash for magiclink verification, fall back to email_otp
    return NextResponse.json({ ok: true, email: cleanEmail, tokenHash, otp, actionLink })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}