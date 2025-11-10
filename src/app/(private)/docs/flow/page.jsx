"use client"
import React, { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { exportProjectFlowPdf } from '@/lib/pdf'

const ProjectFlowDocsPage = () => {
  const { user } = useAuth()
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    try {
      setGenerating(true)
      await exportProjectFlowPdf({ user })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col p-4">
      <h1 className="text-xl font-semibold mb-3">Project Flow – PDF Guide</h1>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
        Generates a PDF explaining the app architecture, data flow, caching, rendering, and security.
      </p>
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="px-3 py-2 rounded-md bg-black text-white disabled:opacity-60"
      >{generating ? 'Generating…' : 'Generate PDF'}</button>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">The PDF downloads in your browser.</p>
    </div>
  )
}

export default ProjectFlowDocsPage