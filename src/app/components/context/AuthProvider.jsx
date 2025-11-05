"use client"
import {createContext,useState,useEffect, useRef} from "react"
import client from "@/api/client"

const AuthContext = createContext(null);

const AuthProvider = ({children}) => {
    const [user,setUser] = useState(null)
    const [loading,setLoading] = useState(true)
    const userIdRef = useRef(null)

    useEffect(()=>{
        client.auth.getSession().then (({data})=>{
            const next = data?.session?.user || null
            userIdRef.current = next?.id || null
            setUser(next)
            setLoading(false)
        })
        const {data:listner} = client.auth.onAuthStateChange((event, session) => {
            const next = session?.user || null
            const nextId = next?.id || null
            if (event === 'SIGNED_OUT') {
                if (userIdRef.current !== null) {
                    setUser(null)
                    userIdRef.current = null
                }
                setLoading(false)
                return
            }
            if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                if (userIdRef.current !== nextId) {
                    setUser(next)
                    userIdRef.current = nextId
                }
                setLoading(false)
                return
            }
            if (event === 'TOKEN_REFRESHED') {
                // Avoid triggering re-renders on background token refreshes
                if (userIdRef.current !== nextId) {
                    setUser(next)
                    userIdRef.current = nextId
                }
                setLoading(false)
                return
            }
            setLoading(false)
        })
        return ()=>{
            listner?.subscription?.unsubscribe()
        }
    },[])

    const signOut = async (scope = 'local') => {
        try {
            if (scope === 'local') {
                // Perform a purely local sign-out to avoid network requests (and 431)
                try {
                    if (typeof window !== 'undefined' && window.localStorage) {
                        const keys = Object.keys(window.localStorage)
                        keys.forEach((k) => {
                            if (k.startsWith('sb-') || k.toLowerCase().includes('supabase')) {
                                window.localStorage.removeItem(k)
                            }
                        })
                    }
                } catch {}
                setUser(null)
            } else {
                const { error } = await client.auth.signOut({ scope })
                if (error) throw error
                setUser(null)
            }
        } catch (err) {
            // Ensure local sign-out even if SDK/network fails
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    const keys = Object.keys(window.localStorage)
                    keys.forEach((k) => {
                        if (k.startsWith('sb-') || k.toLowerCase().includes('supabase')) {
                            window.localStorage.removeItem(k)
                        }
                    })
                }
            } catch {}
            setUser(null)
        }
    }

    return (
        <AuthContext.Provider value={{user,loading,signOut}}>
            {children}
        </AuthContext.Provider>
    ) 
}

export {AuthContext,AuthProvider}