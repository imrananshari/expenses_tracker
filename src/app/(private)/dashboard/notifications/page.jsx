"use client"
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { listNotifications } from '@/api/db'
import { Bell, LogOut, AlertCircle, AlertTriangle, PlusCircle } from 'lucide-react'
import { toast } from 'sonner'

const NotificationsPage = () => {
  const router = useRouter()
  const { user, loading, signOut } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [notifications, setNotifications] = useState([])
  const [activeFilter, setActiveFilter] = useState('all') // all | overspend | frequent | topup
  const [shuffleTick, setShuffleTick] = useState(0)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/')
    }
  }, [loading, user, router])

  useEffect(() => {
    if (!user) return
    const loadData = async () => {
      try {
        // Prefer actual profile name over email for display
        const preferredName = user.fullName || user.name || ''
        setDisplayName(preferredName || (user.email ? (user.email.split('@')[0]) : ''))
        const { data: notifs } = await listNotifications(user.id)
        setNotifications(notifs || [])
      } catch (err) {
        console.error('Failed to load notifications', err)
      }
    }
    loadData()
  }, [user])

  // Note: count now comes from API; dashboard reads same source

  const handleBack = () => router.push('/dashboard')
  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  // Apply filter
  const filtered = notifications.filter(n => {
    if (activeFilter === 'all') return true
    return n.type === activeFilter
  })

  // Simple shuffle to add a playful interaction
  const shuffleNotifications = () => {
    setShuffleTick(t => t + 1)
    setNotifications(prev => {
      const arr = [...prev]
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    })
    toast.success('Shuffled notifications ✨')
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col">
      <div className="bg-brand-dark text-white p-4 flex flex-col min-h-screen rounded-b-xl shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Profile chip instead of back icon */}
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
              {(displayName || (user?.email||'U')).split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm opacity-80">Notifications</p>
              <p className="text-base font-semibold capitalize">{displayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Notifications">
              <Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[1rem] px-1 grid place-items-center rounded-full bg-red-600 text-white text-[10px] leading-none">
                  {notifications.length}
                </span>
              )}
            </button>
            <button onClick={handleSignOut} className="p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Sign out">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Back button placed below header, above list */}
        <div className="mt-3">
          <button onClick={handleBack} className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-sm" aria-label="Back to Dashboard">← Back</button>
        </div>

        {/* Notifications list (compact, scrollable within content) */}
        <div className="mt-3 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-3 rounded-xl bg-white/10 text-white/80 text-sm">No notifications</div>
          ) : (
            <div className="space-y-2">
              {filtered.map(n => {
                const Icon = n.type==='overspend' ? AlertCircle : n.type==='frequent' ? AlertTriangle : PlusCircle
                const cls = n.severity==='danger' ? 'bg-red-600/20 border-red-500/40 text-red-100' : n.severity==='warning' ? 'bg-yellow-600/20 border-yellow-500/40 text-yellow-100' : 'bg-white/10 border-white/20 text-white/90'
                return (
                  <div key={n.id} className={`flex items-center gap-3 p-3 rounded-xl border ${cls} w-full`}>
                    <span className="w-8 h-8 rounded-full bg-white/20 grid place-items-center flex-shrink-0">
                      <Icon className="w-5 h-5" />
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{n.title}</div>
                      <div className="text-xs opacity-80">{n.message}</div>
                    </div>
                    <div className="text-[11px] opacity-60 text-right flex-shrink-0">
                      {new Date(n.date).toLocaleString()}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {/* Footer actions sticky at bottom */}
        <div className="mt-4 border-t border-white/10 pt-3 sticky bottom-0 bg-brand-dark/30 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <button
              className={`text-xs px-2 py-1 rounded-md ${activeFilter==='all' ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'}`}
              onClick={()=>setActiveFilter('all')}
            >All</button>
            <button
              className={`text-xs px-2 py-1 rounded-md ${activeFilter==='overspend' ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'}`}
              onClick={()=>setActiveFilter('overspend')}
            >Overspend</button>
            <button
              className={`text-xs px-2 py-1 rounded-md ${activeFilter==='frequent' ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'}`}
              onClick={()=>setActiveFilter('frequent')}
            >Frequent</button>
            <button
              className={`text-xs px-2 py-1 rounded-md ${activeFilter==='topup' ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'}`}
              onClick={()=>setActiveFilter('topup')}
            >Top-ups</button>
            <div className="ml-auto flex items-center gap-2">
              <button className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/20" onClick={()=>{ setNotifications([]); toast.success('Cleared notifications') }}>Clear</button>
              <button className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/20" onClick={shuffleNotifications}>Shuffle ✨</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default NotificationsPage