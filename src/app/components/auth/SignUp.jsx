"use client"
import React, { useState } from 'react'
import client from '@/api/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

const SignUp = () => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [justSignedUp, setJustSignedUp] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const router = useRouter()

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
            name
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
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border rounded-md border-input bg-background"
            placeholder="John Doe"
            required
            disabled={loading}
          />
        </div>
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
            disabled={loading}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Create Password
          </label>
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
        <button
          type="submit"
          className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          disabled={loading}
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>
      <div className="text-center text-sm text-muted-foreground">
        By signing up, you agree to our <a href="#" className="text-blue-600 hover:underline">Terms of Service</a> and <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>
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
