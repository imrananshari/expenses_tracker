"use client"
import React, { useState, Suspense } from 'react'
import client from '@/api/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

function ResetPasswordContent() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const type = searchParams.get('type')
  const hasRecoverySession = type === 'recovery'

  const handleUpdate = async (e) => {
    e.preventDefault()
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const { error } = await client.auth.updateUser({ password })
      if (error) {
        toast.error(error.message || 'Failed to update password')
      } else {
        toast.success('Password updated. You can now log in.')
        router.push('/')
      }
    } catch (err) {
      console.error('Password update exception:', err)
      toast.error('Unexpected error while updating password')
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
        <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground mt-1">Enter a new password below.</p>
      </div>

      {!hasRecoverySession && (
        <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md p-3">
          Open this page using the link from the password reset email. If you visited directly, go back to Login and use "Forgot password?" to get a valid link.
        </div>
      )}

      <form onSubmit={handleUpdate} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">New Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded-md border-input bg-background"
            placeholder="••••••••"
            required
            disabled={loading}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm New Password</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded-md border-input bg-background"
            placeholder="••••••••"
            required
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          className="w-full btn-primary"
          disabled={loading}
        >
          {loading ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  )
}