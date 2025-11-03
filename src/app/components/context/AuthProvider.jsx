"use client"
import {createContext,useState,useEffect} from "react"
import client from "@/api/client"

const AuthContext = createContext(null);

const AuthProvider = ({children}) => {
    const [user,setUser] = useState(null)
    const [loading,setLoading] = useState(true)

 useEffect(()=>{
    client.auth.getSession().then (({data})=>{
        setUser(data?.session?.user || null)
        setLoading(false)
    })
   const {data:listner} = client.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user || null)
    setLoading(false)
  })
  return ()=>{
    listner?.subscription?.unsubscribe()
  }
 },[])
 return (
    <AuthContext.Provider value={{user,loading}}>
        {children}
    </AuthContext.Provider>
 ) 
}

export {AuthContext,AuthProvider}  