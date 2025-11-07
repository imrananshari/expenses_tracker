"use client"
import React, { useMemo, useState } from 'react'

const modes = [
  { key: '10days', label: '10d' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
]

const MiniSpendChart = ({ buyingExpenses = [], labourExpenses = [] }) => {
  const [mode, setMode] = useState('10days')
  const [monthValue, setMonthValue] = useState(() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,'0')
    return `${y}-${m}`
  })
  const monthInputRef = React.useRef(null)

  const currentMonthValue = () => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,'0')
    return `${y}-${m}`
  }

  const formatMonthShort = (yyyyMm) => {
    const [yStr, mStr] = String(yyyyMm || '').split('-')
    const y = Number(yStr) || today.getFullYear()
    const m = Number(mStr) || (today.getMonth()+1)
    const date = new Date(y, m-1, 1)
    const mon = date.toLocaleDateString(undefined, { month: 'short' })
    const yy = String(y).slice(-2)
    return `${mon} '${yy}`
  }

  const today = new Date()
  today.setHours(0,0,0,0)

  const startOfWeek = (d) => {
    const dt = new Date(d)
    const day = dt.getDay() // 0=Sun
    const diff = (day + 6) % 7 // convert to Mon=0
    dt.setDate(dt.getDate() - diff)
    dt.setHours(0,0,0,0)
    return dt
  }

  const startOfMonth = (d) => {
    const dt = new Date(d.getFullYear(), d.getMonth(), 1)
    dt.setHours(0,0,0,0)
    return dt
  }

  const endOfMonth = (d) => {
    const dt = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    dt.setHours(0,0,0,0)
    return dt
  }

  const makeKeyDay = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,'0')
    const dd = String(d.getDate()).padStart(2,'0')
    return `${y}-${m}-${dd}`
  }

  const makeKeyMonth = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,'0')
    return `${y}-${m}`
  }

  const buckets = useMemo(() => {
    if (mode === '10days') {
      const DAYS = 10
      return Array.from({ length: DAYS }, (_, i) => {
        const d = new Date(today)
        d.setDate(today.getDate() - (DAYS - 1 - i))
        const next = new Date(d)
        next.setDate(d.getDate() + 1)
        return { key: makeKeyDay(d), start: d, end: next, label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }
      })
    }
    if (mode === 'week') {
      const start = startOfWeek(today)
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        const next = new Date(d)
        next.setDate(d.getDate() + 1)
        return { key: makeKeyDay(d), start: d, end: next, label: d.toLocaleDateString(undefined, { weekday: 'short' }) }
      })
    }
    if (mode === 'month') {
      // Use selected month from monthValue
      const [yStr, mStr] = (monthValue || '').split('-')
      const y = Number(yStr) || today.getFullYear()
      const m0 = (Number(mStr) || (today.getMonth()+1)) - 1
      const start = new Date(y, m0, 1)
      const end = new Date(y, m0 + 1, 1)
      const days = Math.round((end - start) / (24*60*60*1000))
      return Array.from({ length: days }, (_, i) => {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        const next = new Date(d)
        next.setDate(d.getDate() + 1)
        return { key: makeKeyDay(d), start: d, end: next, label: d.toLocaleDateString(undefined, { day: 'numeric' }) }
      })
    }
    // year: current calendar year, monthly buckets
    const yearStart = new Date(today.getFullYear(), 0, 1)
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(today.getFullYear(), i, 1)
      const next = new Date(today.getFullYear(), i + 1, 1)
      return { key: makeKeyMonth(d), start: d, end: next, label: d.toLocaleDateString(undefined, { month: 'short' }) }
    })
    return months
  }, [mode, monthValue])

  const sumByRange = (items, start, end) => {
    let sum = 0
    for (const e of items) {
      const d = e.date ? new Date(e.date) : null
      if (!d) continue
      if (d >= start && d < end) {
        sum += Number(e.amount || 0)
      }
    }
    return sum
  }

  const buyTotals = buckets.map(b => sumByRange(buyingExpenses, b.start, b.end))
  const labTotals = buckets.map(b => sumByRange(labourExpenses, b.start, b.end))
  const maxVal = Math.max(1, ...buyTotals, ...labTotals)

  return (
    <div className="mt-3 p-3 bg-white/10 rounded-xl">
      <div className="flex items-center justify-between mb-2 text-[11px] text-white/80">
        <div className="flex items-center gap-2">
          {modes.map(m => (
            m.key === 'month' ? (
              <div key={m.key} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('month')
                    setTimeout(() => monthInputRef.current?.showPicker?.(), 0)
                  }}
                  className={`px-2 py-1 rounded-md leading-none ${mode === 'month' ? 'bg-black text-white' : 'bg-white/10 hover:bg-white/20'}`}
                  title="Select month"
                >{mode === 'month' ? formatMonthShort(monthValue) : m.label}</button>
                {mode === 'month' && (
                  <button
                    type="button"
                    onClick={() => setMonthValue(currentMonthValue())}
                    className="px-1 py-1 rounded-sm leading-none bg-white/10 hover:bg-white/20 text-white/80"
                    aria-label="Clear month"
                    title="Reset to current month"
                  >×</button>
                )}
              </div>
            ) : (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`px-2 py-1 rounded-md leading-none ${mode === m.key ? 'bg-black text-white' : 'bg-white/10 hover:bg-white/20'}`}
              >{m.label}</button>
            )
          ))}
          <input
            ref={monthInputRef}
            type="month"
            value={monthValue}
            onChange={(e) => setMonthValue(e.target.value)}
            className="absolute w-0 h-0 opacity-0 pointer-events-none"
          />
      </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400"></span> Buying</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-pink-300"></span> Labour</span>
        </div>
      </div>
      <div className="h-28 flex items-end gap-2 overflow-x-auto no-scrollbar">
        {buckets.map((b, i) => {
          const buy = buyTotals[i] || 0
          const lab = labTotals[i] || 0
          const buyH = Math.round((buy / maxVal) * 100)
          const labH = Math.round((lab / maxVal) * 100)
          return (
            <div key={b.key} className="flex flex-col items-center w-8 h-full flex-shrink-0">
              <div className="flex items-end gap-1 w-full h-full">
                <div className="flex-1 bg-blue-400 rounded-sm" style={{ height: `${buyH}%` }} title={`Buying: ₹${buy.toLocaleString()}`}></div>
                <div className="flex-1 bg-pink-300 rounded-sm" style={{ height: `${labH}%` }} title={`Labour: ₹${lab.toLocaleString()}`}></div>
              </div>
              <div className="mt-1 text-[10px] text-white/70 whitespace-nowrap">{b.label}</div>
            </div>
          )
        })}
      </div>
      {mode === 'month' && (buyTotals.reduce((s,v)=>s+v,0) + labTotals.reduce((s,v)=>s+v,0)) === 0 && (
        <div className="mt-2 text-center text-[11px] text-white/70">No expenses in {formatMonthShort(monthValue)}</div>
      )}
    </div>
  )
}

export default MiniSpendChart