"use client"
import React from 'react'
import { IndianRupee } from 'lucide-react'

const LoadingOverlay = ({ visible = false, text = 'Loading...' }) => {
  if (!visible) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 px-6 py-5 rounded-2xl bg-white dark:bg-zinc-800 shadow">
        <div className="relative w-28 h-28">
          {/* Dotted circular ring around rupee */}
          <svg className="absolute inset-0" viewBox="0 0 120 120">
            <g className="dot-ring-group">
              <circle
                cx="60" cy="60" r="42"
                fill="none"
                stroke="var(--brand-primary)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray="2 12"
                className="dot-ring"
              />
              {/* secondary offset ring for "connecting" effect */}
              <circle
                cx="60" cy="60" r="42"
                fill="none"
                stroke="var(--brand-primary)"
                strokeOpacity="0.5"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray="2 12"
                className="dot-ring dot-ring--offset"
              />
            </g>
          </svg>
          {/* Animated rupee icon */}
          <div className="absolute inset-0 grid place-items-center">
            <IndianRupee className="w-12 h-12 rupee-icon" />
          </div>
        </div>
        <span className="text-sm text-gray-700 dark:text-gray-200">{text}</span>
      </div>

      {/* Component-scoped animation styles */}
      <style jsx>{`
        .dot-ring-group { transform-origin: 60px 60px; }
        .dot-ring-group { animation: ring-rotate 1.6s linear infinite; }
        .dot-ring { opacity: 0.9; }
        .dot-ring--offset { animation: ring-offset 1.6s ease-in-out infinite; }
        .rupee-icon {
          color: var(--brand-primary);
          filter: drop-shadow(0 2px 6px rgba(0,0,0,0.15));
          animation: rupee-pulse 1.2s ease-in-out infinite, rupee-float 2.4s ease-in-out infinite;
        }
        @keyframes ring-rotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes ring-offset {
          0% { stroke-dashoffset: 0; }
          50% { stroke-dashoffset: 7; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes rupee-pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        @keyframes rupee-float {
          0% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
          100% { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default LoadingOverlay