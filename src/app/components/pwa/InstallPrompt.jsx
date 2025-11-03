"use client"
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setVisible(true)
    }
    const onAppInstalled = () => {
      setVisible(false)
      setDeferredPrompt(null)
      toast.success('App installed!')
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      toast.success('Installation accepted')
    } else {
      toast.info('Installation dismissed')
    }
    setVisible(false)
    setDeferredPrompt(null)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 mx-auto max-w-md bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-lg p-4">
      <div className="flex items-center justify-between">
        <div className="mr-3">
          <h2 className="text-sm font-semibold">Install Budget Tracker</h2>
          <p className="text-xs text-muted-foreground">Add to Home Screen for a faster, app-like experience.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            onClick={handleInstall}
          >Add</button>
          <button
            className="px-3 py-2 bg-gray-100 dark:bg-zinc-800 rounded-md hover:bg-gray-200 dark:hover:bg-zinc-700"
            onClick={() => setVisible(false)}
          >Later</button>
        </div>
      </div>
    </div>
  )
}