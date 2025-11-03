"use client"
import React,{useEffect} from 'react'
import { useRouter } from 'next/navigation'
import {useAuth} from '@/hooks/useAuth'

const PrivatePagesLayout=({children})=>{
  const {user,loading}=useAuth()
  const router = useRouter()
  useEffect(()=>{
    if(loading){
      return
    } 
    if(!user){
      router.push('/')
    }
  },[user,loading,router]) 

  if(loading){
    return null
  }
  if(!user){
    return null
  }
  return (
    <div>
      {children}
    </div>
  )
}

export default PrivatePagesLayout
