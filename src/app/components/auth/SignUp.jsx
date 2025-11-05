"use client"
import React, { useRef, useState, useEffect } from 'react'
import client from '@/api/client'
import { upsertMpinForEmail, uploadAvatarDataUrl, upsertProfileByEmail } from '@/api/db'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, EyeOff, Upload, Pencil } from 'lucide-react'

const SignUp = ({ onBack }) => {
  const [step, setStep] = useState(1) // 1: avatar+name+email, 2: passwords+mpin
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mpin, setMpin] = useState('')
  const [confirmMpin, setConfirmMpin] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showMpin, setShowMpin] = useState(false)
  const [showConfirmMpin, setShowConfirmMpin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [justSignedUp, setJustSignedUp] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const router = useRouter()

  // Avatar upload & crop state
  const [fileError, setFileError] = useState('')
  const [rawUrl, setRawUrl] = useState('')
  const imgRef = useRef(null)
  const fileInputRef = useRef(null)
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })
  const previewSize = 200 // px square crop box
  const [scale, setScale] = useState(1) // user scale multiplier
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const [avatarDataUrl, setAvatarDataUrl] = useState('')

  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const onLoad = () => {
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
      // center image by default
      setOffset({ x: 0, y: 0 })
      setScale(1)
    }
    img.addEventListener('load', onLoad)
    return () => img.removeEventListener('load', onLoad)
  }, [rawUrl])

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setFileError('File too large. Max 5MB.')
      return
    }
    setFileError('')
    const reader = new FileReader()
    reader.onload = () => setRawUrl(reader.result)
    reader.readAsDataURL(file)
  }

  const onDragStart = (e) => {
    setDragging(true)
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    dragStart.current = { x: clientX - offset.x, y: clientY - offset.y }
  }
  const onDragMove = (e) => {
    if (!dragging) return
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    setOffset({ x: clientX - dragStart.current.x, y: clientY - dragStart.current.y })
  }
  const onDragEnd = () => setDragging(false)

  const baseScale = (() => {
    const { w, h } = naturalSize
    if (!w || !h) return 1
    return Math.max(previewSize / w, previewSize / h)
  })()

  const drawCroppedAvatar = () => {
    try {
      const img = imgRef.current
      if (!img || !rawUrl) return ''
      const cvs = document.createElement('canvas')
      cvs.width = previewSize
      cvs.height = previewSize
      const ctx = cvs.getContext('2d')
      const finalScale = baseScale * scale
      const drawW = naturalSize.w * finalScale
      const drawH = naturalSize.h * finalScale
      const dx = offset.x
      const dy = offset.y
      ctx.clearRect(0, 0, previewSize, previewSize)
      ctx.drawImage(img, dx, dy, drawW, drawH)
      return cvs.toDataURL('image/png')
    } catch (err) {
      console.warn('Crop failed', err)
      return ''
    }
  }

  const handleNext = () => {
    // Basic validations for step 1
    const cleanEmail = email.trim().toLowerCase()
    const simpleEmailPattern = /.+@.+\..+/
    if (!name.trim()) {
      toast.error('Please enter your name')
      return
    }
    if (!simpleEmailPattern.test(cleanEmail)) {
      toast.error('Please enter a valid email address')
      return
    }
    // Generate avatar data URL (optional)
    const url = drawCroppedAvatar()
    setAvatarDataUrl(url)
    setStep(2)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const cleanEmail = email.trim().toLowerCase()
      const simpleEmailPattern = /.+@.+\..+/
      if (!simpleEmailPattern.test(cleanEmail)) {
        toast.error('Please enter a valid email address')
        setLoading(false)
        return
      }

      if (!password || password.length < 6) {
        toast.error('Password must be at least 6 characters')
        setLoading(false)
        return
      }
      if (password !== confirmPassword) {
        toast.error('Passwords do not match')
        setLoading(false)
        return
      }
      if (mpin && !/^\d{4}$/.test(mpin.trim())) {
        toast.error('M-PIN must be 4 digits')
        setLoading(false)
        return
      }
      if (mpin && mpin.trim() !== confirmMpin.trim()) {
        toast.error('M-PIN does not match')
        setLoading(false)
        return
      }

      // Ensure the verification link redirects back to the current site
      const origin = typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000')

      // Sign up with Supabase
      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            name,
            avatar: avatarDataUrl || undefined
          },
          emailRedirectTo: origin
        }
      })
      
      if (error) {
        toast.error(error.message)
        console.error('SignUp error:', error)
      } else {
        toast.success('Account created! Please check your email to confirm your account.')
        console.log('SignUp successful:', data)
        // Upload avatar to Supabase Storage via server API (independent of auth session)
        if (avatarDataUrl) {
          try {
            const { url, error: upErr } = await uploadAvatarDataUrl(cleanEmail, avatarDataUrl)
            if (upErr) {
              console.warn('Avatar upload failed:', upErr)
            } else if (url) {
              console.log('Avatar stored at:', url)
              // Upsert profile row with name, email, and avatar URL
              try {
                await upsertProfileByEmail(cleanEmail, { name, avatarUrl: url })
              } catch (profErr) {
                console.warn('Profile upsert failed:', profErr)
              }
            }
          } catch (err) {
            console.warn('Avatar upload exception:', err)
          }
        }
        // If user entered a valid 4-digit M-PIN, store it server-side
        if (/^\d{4}$/.test(mpin.trim())) {
          const { error: mpErr } = await upsertMpinForEmail(cleanEmail, mpin.trim())
          if (mpErr) {
            console.warn('M-PIN upsert failed:', mpErr)
          } else {
            toast.success('M-PIN saved. Use it to login after confirming email.')
          }
        }
        setJustSignedUp(true)
      }
    } catch (err) {
      toast.error('An unexpected error occurred. Please try again.')
      console.error('SignUp exception:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    const cleanEmail = email.trim().toLowerCase()
    const simpleEmailPattern = /.+@.+\..+/
    if (!simpleEmailPattern.test(cleanEmail)) {
      toast.error('Enter a valid email to resend verification')
      return
    }
    try {
      setResendLoading(true)
      const { error } = await client.auth.resend({ type: 'signup', email: cleanEmail })
      if (error) {
        toast.error(error.message || 'Failed to resend verification email')
      } else {
        toast.success('Verification email resent. Check inbox/spam.')
      }
    } catch (err) {
      console.error('Resend exception:', err)
      toast.error('Unexpected error while resending email')
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      {step === 1 && (
        <div className="space-y-2">
          {/* Avatar upload and crop */}
          <div className="space-y-2">
            <div className="relative mx-auto w-[200px]">
              <div
                className="relative w-[200px] h-[200px] rounded-full overflow-hidden bg-white cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                onMouseDown={rawUrl ? onDragStart : undefined}
                onMouseMove={rawUrl ? onDragMove : undefined}
                onMouseUp={rawUrl ? onDragEnd : undefined}
                onMouseLeave={rawUrl ? onDragEnd : undefined}
                onTouchStart={rawUrl ? onDragStart : undefined}
                onTouchMove={rawUrl ? onDragMove : undefined}
                onTouchEnd={rawUrl ? onDragEnd : undefined}
                style={{ border: '1px solid rgba(0,0,0,0.08)' }}
                aria-label="Upload avatar"
              >
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
                {rawUrl ? (
                  <img
                    ref={imgRef}
                    src={rawUrl}
                    alt="Avatar"
                    style={{
                      position: 'absolute',
                      left: `${offset.x}px`,
                      top: `${offset.y}px`,
                      width: `${naturalSize.w * baseScale * scale}px`,
                      height: `${naturalSize.h * baseScale * scale}px`,
                      userSelect: 'none',
                    }}
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                    <Upload className="w-5 h-5 opacity-70" />
                    <span className="mt-1 text-xs opacity-70">Tap to upload</span>
                  </div>
                )}
              </div>
              {rawUrl && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -top-2 -right-2 px-2 py-1 rounded-full bg-white border text-xs flex items-center gap-1 shadow-sm"
                  title="Change image"
                  aria-label="Change image"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}
            </div>
            {fileError && <p className="text-center text-xs text-red-600">{fileError}</p>}
          </div>

          {/* Name and Email */}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-md border-input bg-background"
              placeholder="John Doe"
              disabled={loading}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-md border-input bg-background"
              placeholder="you@example.com"
              disabled={loading}
              required
            />
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => (onBack ? onBack() : router.back())}>Back</button>
            <button type="button" className="btn-primary flex-1" onClick={handleNext}>Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Password + confirm with eye toggles */}
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">Create Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-md border-input bg-background pr-10"
                placeholder="••••••••"
                disabled={loading}
                required
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1" onClick={() => setShowPassword(v => !v)} aria-label="Toggle password visibility">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-md border-input bg-background pr-10"
                placeholder="••••••••"
                disabled={loading}
                required
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1" onClick={() => setShowConfirmPassword(v => !v)} aria-label="Toggle confirm password visibility">
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* M-PIN + confirm with eye toggles */}
          <div className="space-y-2">
            <label htmlFor="mpin" className="text-sm font-medium">Set 4-digit M-PIN (optional)</label>
            <div className="relative">
              <input
                id="mpin"
                type={showMpin ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={mpin}
                onChange={(e) => setMpin(e.target.value.replace(/\D/g, '').slice(0,4))}
                className="w-full px-3 py-2 border rounded-md border-input bg-background pr-10"
                placeholder="••••"
                disabled={loading}
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1" onClick={() => setShowMpin(v => !v)} aria-label="Toggle M-PIN visibility">
                {showMpin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Any 4-digit code is allowed (e.g., 1234, 0000).</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmMpin" className="text-sm font-medium">Confirm M-PIN</label>
            <div className="relative">
              <input
                id="confirmMpin"
                type={showConfirmMpin ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={confirmMpin}
                onChange={(e) => setConfirmMpin(e.target.value.replace(/\D/g, '').slice(0,4))}
                className="w-full px-3 py-2 border rounded-md border-input bg-background pr-10"
                placeholder="••••"
                disabled={loading}
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1" onClick={() => setShowConfirmMpin(v => !v)} aria-label="Toggle confirm M-PIN visibility">
                {showConfirmMpin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setStep(1)}>Back</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? 'Creating Account…' : 'Create Account'}
            </button>
          </div>
        </form>
      )}

      <div className="text-center text-sm text-muted-foreground">
        By signing up, you agree to our <a href="#" className="text-[var(--brand-primary)] hover:underline">Terms of Service</a> and <a href="#" className="text-[var(--brand-primary)] hover:underline">Privacy Policy</a>
      </div>
      {justSignedUp && (
        <div className="mt-3 text-center text-sm">
          <p className="mb-2">We sent a confirmation link to your email. You must confirm before logging in.</p>
          <button
            type="button"
            onClick={handleResend}
            className="px-3 py-2 bg-gray-100 border rounded-md hover:bg-gray-200"
            disabled={resendLoading}
          >
            {resendLoading ? 'Resending…' : 'Resend verification email'}
          </button>
        </div>
      )}
    </div>
  )
}

export default SignUp
