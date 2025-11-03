"use client"
import React from 'react'

const MiniSpendChart = ({ buyingExpenses = [], labourExpenses = [] }) => {
  const DAYS = 9
  const today = new Date()
  today.setHours(0,0,0,0)

  const makeKey = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,'0')
    const dd = String(d.getDate()).padStart(2,'0')
    return `${y}-${m}-${dd}`
  }
  const makeLabel = (d) => {
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  }

  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (DAYS - 1 - i))
    return { date: d, key: makeKey(d), label: makeLabel(d) }
  })

  const sumByDay = (items) => {
    const acc = {}
    for (const e of items) {
      const d = e.date ? new Date(e.date) : null
      if (!d) continue
      d.setHours(0,0,0,0)
      const k = makeKey(d)
      acc[k] = (acc[k] || 0) + Number(e.amount || 0)
    }
    return acc
  }

  const buyTotals = sumByDay(buyingExpenses)
  const labTotals = sumByDay(labourExpenses)
  const maxVal = Math.max(
    1,
    ...days.map(d => (buyTotals[d.key] || 0)),
    ...days.map(d => (labTotals[d.key] || 0))
  )

  return (
    <div className="mt-3 p-3 bg-white/10 rounded-xl">
      <div className="flex items-center justify-between mb-2 text-xs text-white/80">
        <span>Last {DAYS} days</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400"></span> Buying</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-pink-300"></span> Labour</span>
        </div>
      </div>
      <div className="h-28 flex items-end gap-2">
        {days.map(d => {
          const buy = buyTotals[d.key] || 0
          const lab = labTotals[d.key] || 0
          const buyH = Math.round((buy / maxVal) * 100)
          const labH = Math.round((lab / maxVal) * 100)
          return (
            <div key={d.key} className="flex flex-col items-center w-8 h-full">
              <div className="flex items-end gap-1 w-full h-full">
                <div className="flex-1 bg-blue-400 rounded-sm" style={{ height: `${buyH}%` }} title={`Buying: ₹${buy.toLocaleString()}`}></div>
                <div className="flex-1 bg-pink-300 rounded-sm" style={{ height: `${labH}%` }} title={`Labour: ₹${lab.toLocaleString()}`}></div>
              </div>
              <div className="mt-1 text-[10px] text-white/70 whitespace-nowrap">{d.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MiniSpendChart