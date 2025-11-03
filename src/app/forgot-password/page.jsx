"use client"
import React, { useState } from 'react'
import client from '@/api/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const router = useRouter()

  const simpleEmailPattern = /.+@.+\..+/

  const handleSend = async (e) => {
    e.preventDefault()
    const cleanEmail = email.trim().toLowerCase()
    if (!simpleEmailPattern.test(cleanEmail)) {
      toast.error('Enter a valid email')
      return
    }
    try {
      setLoading(true)
      const origin = typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000')
      const redirectTo = `${origin}/reset-password`
      const { error } = await client.auth.resetPasswordForEmail(cleanEmail, { redirectTo })
      if (error) {
        toast.error(error.message || 'Failed to send reset email')
      } else {
        toast.success('Reset link sent. Check your inbox/spam.')
        setSent(true)
      }
    } catch (err) {
      console.error('reset link exception:', err)
      toast.error('Unexpected error while sending reset link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 space-y-6 bg-white rounded-lg shadow-lg dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => router.push('/')}
        className="text-blue-600 hover:underline flex items-center"
        aria-label="Back to Login"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a1 1 0 01-.707-.293l-7-7a1 1 0 010-1.414l7-7A1 1 0 0111 3v4h6a1 1 0 011 1v4a1 1 0 01-1 1h-6v4a1 1 0 01-1 1z" clipRule="evenodd" />
        </svg>
        Back
      </button>
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Forgot password</h1>
        <p className="text-sm text-muted-foreground mt-1">Reset using a magic link</p>
      </div>

      <form onSubmit={handleSend} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded-md border-input bg-background"
            placeholder="you@example.com"
            required
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          className="w-full btn-primary"
          disabled={loading}
        >
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <div className="text-sm text-muted-foreground">
        <p className="mt-2">How it works:</p>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li>We email you a secure magic link.</li>
          <li>Tap the link from any device; it opens our reset page.</li>
          <li>Set your new password there and you’re done.</li>
        </ul>
        {sent && (
          <p className="mt-2">Didn’t receive it? Check spam/junk and ensure Site URL/redirect is configured in Supabase.</p>
        )}
      </div>
    </div>
  )
}