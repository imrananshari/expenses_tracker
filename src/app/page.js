"use client"
import Image from "next/image";
import { useAuth } from "../hooks/useAuth";
import { useRouter } from "next/navigation";
import Auth from "./components/auth/Auth";
import { useEffect } from "react";


export default function Home() {
 const {user,loading}=useAuth()
 const router = useRouter()

 useEffect(()=>{
  if(!loading && user){
    router.push("/dashboard")
  }
 },[user,loading,router])
 



  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
    {loading ? <h1>Loading...</h1> : <Auth />}
    </div>
  );
}
