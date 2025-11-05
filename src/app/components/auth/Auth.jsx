"use client"
import React, { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Login from './Login'
import SignUp from './SignUp'

const Auth = () => {
  const [mode, setMode] = useState('idle') // 'idle' | 'login' | 'signup'

  return (
    <div className="w-full max-w-sm mx-auto p-3 min-h-[85vh] flex items-center justify-center">
      {/* Gradient border card */}
      <div className="rounded-2xl p-[3px] brand-gradient w-full">
        <div className="relative rounded-2xl bg-[#eef1f6] dark:bg-zinc-900 px-6 py-8 overflow-hidden min-h-[420px]">
          {/* subtle diagonal background pattern */}
          <div className="absolute inset-0 bg-diagonal-pattern opacity-50 pointer-events-none" />
          {/* Hero image with position animation */}
          <div className={`relative flex items-center justify-center transition-all duration-300 ${mode === 'idle' ? 'min-h-[180px]' : 'min-h-[130px]'}`}>
            <img
              src="/budgzyx.svg"
              alt="Budget"
              className={`z-10 transition-transform duration-300 ${mode === 'idle' ? 'w-40 h-40 translate-y-0' : 'w-32 h-32 -translate-y-3'}`}
            />
          </div>

          {mode === 'idle' && (
            <div className="relative z-10 space-y-3 mt-2 mb-8">
              <button className="w-full btn-primary" onClick={() => setMode('login')}>Login</button>
              <button className="w-full btn-secondary" onClick={() => setMode('signup')}>Sign Up</button>
            </div>
          )}

          {/* Back button removed for a cleaner, minimal auth header */}

          {mode === 'login' && (
            <div className="relative z-10 mt-4">
              <Tabs value={'login'} className="w-full">
                <TabsContent value="login" className="mt-1">
                  <Login />
                </TabsContent>
              </Tabs>
            </div>
          )}

          {mode === 'signup' && (
            <div className="relative z-10 mt-0">
              <Tabs value={'signup'} className="w-full">
                <TabsContent value="signup" className="mt-1">
                   <SignUp onBack={() => setMode('idle')} onSignupSuccess={() => setMode('login')} />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Auth