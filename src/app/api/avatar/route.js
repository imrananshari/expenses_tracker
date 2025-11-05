import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Ensure this route runs on Node.js runtime (for Buffer)
export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'avatars'

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export async function POST(req) {
  try {
    const body = await req.json()
    const email = String(body?.email || '').trim().toLowerCase()
    const dataUrl = String(body?.dataUrl || '')

    if (!email || !/.+@.+\..+/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }
    if (!dataUrl.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid image data' }, { status: 400 })
    }

    // Decode base64
    const base64 = dataUrl.split(',')[1]
    const buffer = Buffer.from(base64, 'base64')
    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image exceeds 5MB limit' }, { status: 413 })
    }

    // Determine mime and extension from the data URL
    const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)
    const mime = mimeMatch?.[1] || 'image/png'
    const ext = mime === 'image/jpeg' ? '.jpg' : mime === 'image/webp' ? '.webp' : '.png'

    const safePath = email + ext

    // Ensure bucket exists (auto-create if missing)
    const { data: bucketInfo } = await supabaseAdmin.storage.getBucket(BUCKET)
    if (!bucketInfo) {
      const { error: createErr } = await supabaseAdmin.storage.createBucket(BUCKET, { public: true })
      if (createErr) {
        return NextResponse.json({ error: createErr.message }, { status: 500 })
      }
    }

    const { error: uploadError } = await supabaseAdmin
      .storage
      .from(BUCKET)
      .upload(safePath, buffer, { contentType: mime, upsert: true })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(safePath)
    return NextResponse.json({ url: data.publicUrl }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}