"use client"
import "./globals.css";
import {AuthProvider} from "@/app/components/context/AuthProvider"
import { Toaster } from 'sonner'
import React, { useEffect } from 'react'
import InstallPrompt from '@/app/components/pwa/InstallPrompt'

export default function RootLayout({ children }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.log('SW registration failed:', err)
        })
      })
    }
  }, [])
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="Budget Tracker" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster position="top-right" richColors />
        <InstallPrompt />
      </body>
    </html>
  );
}
