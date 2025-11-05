"use client"
import Image from "next/image";
import { useAuth } from "../hooks/useAuth";
import { useRouter } from "next/navigation";
import Auth from "./components/auth/Auth";
import { useEffect } from "react";
import client from "@/api/client";


export default function Home() {
 const {user,loading}=useAuth()
 const router = useRouter()

 useEffect(()=>{
  if(!loading && user){
    router.replace("/dashboard")
    return
  }
  // Fallback: if session exists but context hasn't updated yet, redirect
  if (!loading && !user) {
    client.auth.getSession().then(({ data }) => {
      if (data?.session?.user) {
        router.replace('/dashboard')
      }
    })
  }
 },[user,loading,router])
 



  return (
    <div className="flex min-h-screen items-center justify-center font-sans dark:bg-black bg-[#eef1f6]">
    {loading ? <h1>Loading...</h1> : <Auth />}
    </div>
  );
}
