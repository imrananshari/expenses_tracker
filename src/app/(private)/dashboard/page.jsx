"use client"
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import client from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

// Import budget components
import CategoryList from '@/app/components/budget/CategoryList'

const Dashboard = () => {
  const router = useRouter()
  const { user, loading } = useAuth()
  
  const handleSignOut = async () => {
    try {
      const { error } = await client.auth.signOut()
      if (error) {
        toast.error(error.message)
      } else {
        toast.success('Signed out successfully')
        router.push('/')
      }
    } catch (err) {
      toast.error('Error signing out')
      console.error(err)
    }
  }

  // Protect the dashboard route
  if (!loading && !user) {
    router.push('/')
    return null
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold">Budget Tracker</h1>
          <p className="text-gray-600 dark:text-gray-400">Select a category to manage your budget</p>
        </div>
        <button 
          onClick={handleSignOut}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        >
          Sign Out
        </button>
      </div>

      <CategoryList />
    </div>
  )
}

export default Dashboard