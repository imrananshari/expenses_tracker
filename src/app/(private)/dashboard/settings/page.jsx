"use client"
import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { getProfileForUser, uploadAvatarDataUrl, upsertMpinForEmail, getPublicAvatarUrl, upsertProfileByEmail } from '@/api/db'
import LoadingOverlay from '@/app/components/LoadingOverlay'
import { ArrowLeft, Pencil } from 'lucide-react'

const SettingsPage = () => {
  const addBuster = (u) => (u ? u + (u.includes('?') ? '&' : '?') + 't=' + Date.now() : '')
  const router = useRouter()
  const { user } = useAuth()
  const [overlayVisible, setOverlayVisible] = useState(false)
  const overlayStartRef = useRef(0)

  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileInputRef = useRef(null)
  const avatarExts = ['.jpg', '.png', '.webp']
  const [avatarTryIndex, setAvatarTryIndex] = useState(0)

  const [mpin, setMpin] = useState('')
  const [mpinConfirm, setMpinConfirm] = useState('')
  const [mpinSaving, setMpinSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return
      overlayStartRef.current = Date.now()
      setOverlayVisible(true)
      try {
        const { data } = await getProfileForUser(user.id)
        const p = data || {}
        setProfile(p)
        setEmail(user.email || '')
        const nameCandidate = p?.name || user?.user_metadata?.name || user?.name || ''
        setDisplayName(nameCandidate || (user.email ? user.email.split('@')[0] : ''))
        // Prefer persistent public URLs like dashboard (try known extensions)
        if (p?.avatar_url) {
          setAvatarPreview(addBuster(p.avatar_url))
        } else if (user?.email) {
          const firstUrl = addBuster(getPublicAvatarUrl(user.email, avatarExts[0]))
          setAvatarTryIndex(0)
          setAvatarPreview(firstUrl || '')
        }
      } catch (err) {
        console.warn('Failed to load profile', err)
      } finally {
        const elapsed = Date.now() - overlayStartRef.current
        const MIN_MS = 600
        if (elapsed < MIN_MS) setTimeout(() => setOverlayVisible(false), MIN_MS - elapsed)
        else setOverlayVisible(false)
      }
    }
    load()
  }, [user?.id])

  const handleAvatarUpload = async (file) => {
    if (!file || !user?.email) return
    if (file.size > 5 * 1024 * 1024) { // 5MB
      toast.error('File too large. Max 5MB')
      return
    }
    setAvatarUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = reader.result
        const { error, url } = await uploadAvatarDataUrl(user.email, dataUrl)
        if (error) {
          toast.error('Avatar upload failed')
        } else {
          // Use returned public URL and bust cache so it shows immediately
          const nextUrl = addBuster(url || avatarPreview || '')
          setAvatarPreview(String(nextUrl))
          try {
            if (user?.email && user?.id && url) {
              const { error: profErr } = await upsertProfileByEmail(user.email, { avatarUrl: url, userId: user.id })
              if (profErr) console.warn('Profile avatar_url update failed', profErr)
            }
          } catch (e) {
            console.warn('Profile upsert error', e)
          }
          toast.success('Avatar updated')
        }
        setAvatarUploading(false)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      setAvatarUploading(false)
      toast.error('Avatar upload failed')
    }
  }

  const handleSaveMpin = async () => {
    if (!user?.email) return
    const pin = mpin.trim()
    if (!pin || pin.length < 4) { toast.error('Enter at least 4 digits'); return }
    if (pin !== mpinConfirm.trim()) { toast.error('MPINs do not match'); return }
    setMpinSaving(true)
    try {
      const { error } = await upsertMpinForEmail(user.email, pin)
      if (error) {
        toast.error('Failed to update MPIN')
      } else {
        setMpin(''); setMpinConfirm('')
        toast.success('MPIN updated')
      }
    } finally {
      setMpinSaving(false)
    }
  }

  const [showMpinModal, setShowMpinModal] = useState(false)

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center">Loading…</div>
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col">
      <LoadingOverlay visible={overlayVisible} />
      {/* Brand container like Notifications to avoid bottom whitespace */}
      <div className="bg-brand-dark text-white p-4 flex flex-col min-h-screen rounded-b-xl shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/dashboard')} className="p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-semibold">Settings</h2>
          <div className="w-5" />
        </div>

        {/* Content */}
        <div className="mt-3 flex-1 overflow-y-auto">
          {/* Single Card: glassmorphism */}
          <div className="p-5 rounded-xl shadow ring-1 ring-white/20 bg-white/10 backdrop-blur-md text-white">
            {/* Avatar with pencil overlay */}
            <div className="flex items-center gap-4">
              <div className="relative">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="avatar"
                    className="w-16 h-16 rounded-full object-cover"
                    onError={() => {
                      const next = avatarTryIndex + 1
                      if (next < avatarExts.length && user?.email) {
                        setAvatarTryIndex(next)
                        setAvatarPreview(addBuster(getPublicAvatarUrl(user.email, avatarExts[next])) || '')
                      } else {
                        setAvatarPreview('')
                      }
                    }}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-white/20 grid place-items-center font-bold">
                    {(displayName || (user?.email||'U')).charAt(0).toUpperCase()}
                  </div>
                )}
                <button
                  type="button"
                className="absolute -bottom-1 -right-1 p-1 rounded-full bg-black/70 hover:bg-black/80 text-white disabled:opacity-60"
                  aria-label="Edit avatar"
                  title="Edit avatar"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e)=>handleAvatarUpload(e.target.files?.[0])} />
              </div>
              <div className="flex-1">
                <div className="text-xs opacity-80 mb-1">Name</div>
                <div className="w-full rounded-md px-3 py-2 bg-white/20 text-white/90">{displayName}</div>
                <div className="text-xs opacity-80 mt-3 mb-1">Email</div>
                <div className="w-full rounded-md px-3 py-2 bg-white/20 text-white/90">{email}</div>
              </div>
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Reset MPIN</div>
                <button type="button" className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/20" onClick={()=>setShowMpinModal(true)}>Reset</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* MPIN modal */}
      {showMpinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={()=>setShowMpinModal(false)} />
          <div className="relative z-10 w-[92%] max-w-sm p-5 rounded-xl bg-white/10 backdrop-blur-md ring-1 ring-white/20 text-white">
            <div className="text-base font-semibold mb-2">Reset MPIN</div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs opacity-80">New MPIN</label>
                <input type="password" value={mpin} onChange={(e)=>setMpin(e.target.value)} className="w-full rounded-md px-3 py-2 bg-white/20 text-white" />
              </div>
              <div>
                <label className="block text-xs opacity-80">Confirm MPIN</label>
                <input type="password" value={mpinConfirm} onChange={(e)=>setMpinConfirm(e.target.value)} className="w-full rounded-md px-3 py-2 bg-white/20 text-white" />
              </div>
              <div className="pt-1 flex justify-end gap-2">
                <button type="button" className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/20" onClick={()=>setShowMpinModal(false)}>Cancel</button>
                <button type="button" onClick={handleSaveMpin} className="px-3 py-2 rounded-md bg-black text-white disabled:opacity-60" disabled={mpinSaving}>Update MPIN</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SettingsPage