"use client"
import React, { useState } from 'react'
import client from '@/api/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
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

      const { data, error } = await client.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })
      if (error) {
        // Many Supabase deployments return invalid_credentials until email is confirmed.
        const msg = (error?.message || '').toLowerCase()
        const looksUnconfirmed = msg.includes('confirm') || msg.includes('not confirmed')
        setNeedsVerification(looksUnconfirmed || msg.includes('invalid'))
        toast.error(looksUnconfirmed
          ? 'Email not confirmed. Please confirm your email.'
          : 'Invalid login credentials. If you just signed up, confirm your email first.')
      } else {
        toast.success('Logged in successfully')
        // Navigate to dashboard; Home page also auto-redirects
        router.push('/dashboard')
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
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
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
        <button
          type="submit"
          className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      <div className="text-center text-sm">
        <a href="/forgot-password" className="text-blue-600 hover:underline">Forgot password?</a>
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