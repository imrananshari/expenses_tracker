"use client"
import React, { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Login from './Login'
import SignUp from './SignUp'

const Auth = () => {
  const [activeTab, setActiveTab] = useState("login")
  
  return (
    <div className="w-full max-w-md mx-auto p-6 space-y-6 bg-white rounded-lg shadow-lg dark:bg-zinc-900">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Welcome to Budget Tracker</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your finances with ease</p>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="login">Login</TabsTrigger>
          <TabsTrigger value="signup">Sign Up</TabsTrigger>
        </TabsList>
        <TabsContent value="login" className="mt-4">
          <Login />
        </TabsContent>
        <TabsContent value="signup" className="mt-4">
          <SignUp onSignupSuccess={() => {
            setTimeout(() => {
              setActiveTab("login");
            }, 2000);
          }} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default Auth