"use client"
import React,{useEffect, useState} from 'react'
import { useRouter } from 'next/navigation'
import {useAuth} from '@/hooks/useAuth'
import client from '@/api/client'
import { DashboardDataProvider } from '@/hooks/useDashboardData'

const PrivatePagesLayout=({children})=>{
  const {user,loading}=useAuth()
  const router = useRouter()
  const [allowRender, setAllowRender] = useState(false)
  useEffect(()=>{
    if (user) { setAllowRender(true); return }
    if(loading){ return }
    let cancelled = false
    const check = async () => {
      if (user) return
      const { data } = await client.auth.getSession()
      if (cancelled) return
      if (data?.session?.user) {
        // Session exists; allow rendering while AuthContext catches up
        setAllowRender(true)
        return
      }
      router.replace('/')
    }
    check()
    return () => { cancelled = true }
  },[user,loading,router]) 

  if (!allowRender && (loading || !user)) return null
  return (
    <DashboardDataProvider>
      <div>
        {children}
      </div>
    </DashboardDataProvider>
  )
}

export default PrivatePagesLayout
