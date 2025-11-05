"use client"
import React, { useState } from 'react'
import client from '@/api/client'
import { loginWithMpin } from '@/api/db'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mpin, setMpin] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [method, setMethod] = useState('password') // 'password' | 'mpin'
  const router = useRouter()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const cleanEmail = email.trim().toLowerCase()
      // Basic client-side validation to catch obvious issues
      const simpleEmailPattern = /.+@.+\..+/
      if (!simpleEmailPattern.test(cleanEmail)) {
        toast.error('Please enter a valid email address')
        setLoading(false)
        return
      }
      // Wait for session helper to avoid race with Private layout redirect
      const waitForSession = async (timeoutMs = 3000) => {
        const start = Date.now()
        // quick check first
        const first = await client.auth.getSession()
        if (first?.data?.session?.user) return true
        return new Promise((resolve) => {
          const unsub = client.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
              unsub?.data?.subscription?.unsubscribe?.()
              resolve(true)
            }
          })
          const id = setInterval(async () => {
            const { data } = await client.auth.getSession()
            if (data?.session?.user || Date.now() - start > timeoutMs) {
              clearInterval(id)
              unsub?.data?.subscription?.unsubscribe?.()
              resolve(Boolean(data?.session?.user))
            }
          }, 150)
        })
      }
      if (method === 'password') {
        const { data, error } = await client.auth.signInWithPassword({
          email: cleanEmail,
          password,
        })
        if (error) {
          const msg = (error?.message || '').toLowerCase()
          const looksUnconfirmed = msg.includes('confirm') || msg.includes('not confirmed')
          setNeedsVerification(looksUnconfirmed || msg.includes('invalid'))
          toast.error(looksUnconfirmed
            ? 'Email not confirmed. Please confirm your email.'
            : 'Invalid login credentials. If you just signed up, confirm your email first.')
        } else {
          toast.success('Logged in successfully')
          await waitForSession()
          router.replace('/dashboard')
        }
      } else {
        if (!/^\d{4}$/.test(mpin.trim())) {
          toast.error('Enter a valid 4-digit M-PIN')
        } else {
          const { error } = await loginWithMpin(cleanEmail, mpin.trim())
          if (error) {
            const msg = (error?.message || '').toLowerCase()
            const looksUnconfirmed = msg.includes('confirm') || msg.includes('not confirmed')
            setNeedsVerification(looksUnconfirmed || msg.includes('invalid'))
            toast.error(looksUnconfirmed ? 'Email not confirmed. Please confirm your email.' : 'Invalid M-PIN or login failed')
          } else {
            toast.success('Logged in with M-PIN')
            await waitForSession()
            router.replace('/dashboard')
          }
        }
      }
    } catch (err) {
      console.error('Login exception:', err)
      toast.error('Unexpected error while logging in')
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
        toast.success('Verification email sent. Please check your inbox/spam.')
      }
    } catch (err) {
      console.error('Resend exception:', err)
      toast.error('Unexpected error while resending email')
    } finally {
      setResendLoading(false)
    }
  }

  const handleResetPasswordEmail = async (e) => {
    e?.preventDefault?.()
    const cleanEmail = email.trim().toLowerCase()
    const simpleEmailPattern = /.+@.+\..+/
    if (!simpleEmailPattern.test(cleanEmail)) {
      toast.error('Enter a valid email to reset password')
      return
    }
    try {
      setResetLoading(true)
      const origin = typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000')
      const redirectTo = `${origin}/reset-password`
      const { error } = await client.auth.resetPasswordForEmail(cleanEmail, { redirectTo })
      if (error) {
        toast.error(error.message || 'Failed to send reset email')
      } else {
        toast.success('Password reset email sent. Check inbox/spam.')
        setShowReset(false)
      }
    } catch (err) {
      console.error('Reset email exception:', err)
      toast.error('Unexpected error while sending reset email')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Method toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMethod('password')}
          className={`px-3 py-2 rounded-md text-sm ${method === 'password' ? 'btn-primary' : 'btn-secondary'}`}
        >Password</button>
        <button
          type="button"
          onClick={() => setMethod('mpin')}
          className={`px-3 py-2 rounded-md text-sm ${method === 'mpin' ? 'btn-primary' : 'btn-secondary'}`}
        >M-PIN</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded-md border-input bg-background"
            placeholder="you@example.com"
            required
          />
        </div>
        {method === 'password' ? (
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-md border-input bg-background"
              placeholder="••••••••"
              required
            />
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="mpin" className="text-sm font-medium">4-digit M-PIN</label>
            <input
              id="mpin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={mpin}
              onChange={(e) => setMpin(e.target.value.replace(/\D/g, '').slice(0,4))}
              className="w-full px-3 py-2 border rounded-md border-input bg-background"
              placeholder="••••"
              required
            />
            <p className="text-xs text-muted-foreground">Login using email + M-PIN (no password). Any 4-digit code works.</p>
          </div>
        )}
        <button
          type="submit"
          className="w-full btn-primary"
          disabled={loading}
        >
          {loading ? (method === 'mpin' ? 'Logging in with M-PIN…' : 'Logging in…') : (method === 'mpin' ? 'Login with M-PIN' : 'Login')}
        </button>
      </form>
      <div className="text-center text-sm">
        <a href="/forgot-password" className="text-[var(--brand-primary)] hover:underline">Forgot password?</a>
      </div>
      {needsVerification && (
        <div className="mt-3 text-center text-sm">
          <p className="mb-2">Haven't confirmed your email yet?</p>
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

export default Login