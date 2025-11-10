"use client"
import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { sanitizeAmount } from '@/lib/sanitize'

const BudgetForm = ({ categoryId, categoryName, onBudgetSet, initialAmount, initialAllocations }) => {
  const [budgetAmount, setBudgetAmount] = useState(
    typeof initialAmount === 'number' ? String(initialAmount) : (initialAmount ?? '')
  )
  const [loading, setLoading] = useState(false)
  const [allocations, setAllocations] = useState(() => {
    const pre = Array.isArray(initialAllocations) ? initialAllocations.map(a => ({ bank: String(a.bank || ''), amount: String(a.amount ?? '') })) : []
    if (pre.length > 0) return pre
    return [
      { bank: 'HDFC', amount: '' },
      { bank: 'SBI', amount: '' },
      { bank: 'ICICI', amount: '' },
    ]
  })

  const totalAllocated = useMemo(() => {
    return allocations.reduce((sum, a) => {
      const val = sanitizeAmount(a.amount)
      return sum + (isNaN(val) ? 0 : val)
    }, 0)
  }, [allocations])

  const remainingToAllocate = useMemo(() => {
    const b = sanitizeAmount(budgetAmount)
    if (isNaN(b)) return 0
    return Math.max(0, b - totalAllocated)
  }, [budgetAmount, totalAllocated])

  const handleSubmit = (e) => {
    e.preventDefault()
    setLoading(true)
    
    // Simulate API call to save budget
    setTimeout(() => {
      // In a real app, you would save this to a database
      const amount = sanitizeAmount(budgetAmount)
      if (isNaN(amount)) {
        toast.error('Invalid budget amount')
        setLoading(false)
        return
      }
      const cleanedAllocations = allocations
        .map(a => ({ bank: String(a.bank || '').trim(), amount: sanitizeAmount(a.amount) }))
        .filter(a => a.bank && !isNaN(a.amount) && a.amount > 0)
      const allocTotal = cleanedAllocations.reduce((s,a)=>s+a.amount,0)
      // New behavior: when allocations are provided, budget will be set to their total
      const amountToSave = cleanedAllocations.length > 0 ? allocTotal : amount

      // Pass structured payload upward; API wiring/migration will follow
      onBudgetSet({ amount: amountToSave, allocations: cleanedAllocations })
      toast.success(`Budget of ₹${amountToSave.toLocaleString()} set for ${categoryName}`)
      setLoading(false)
    }, 500)
  }

  return (
    <div className="p-6 bg-white dark:bg-zinc-800 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">{(initialAmount || (initialAllocations || []).length) ? 'Edit Budget for ' : 'Set Budget for '}{categoryName}</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="budget" className="text-sm font-medium">
            Budget Amount (₹)
          </label>
          <input
            id="budget"
            type="number"
            min="0"
            step="0.01"
            value={budgetAmount}
            onChange={(e) => setBudgetAmount(e.target.value)}
            className="w-full px-3 py-2 border rounded-md border-input bg-background"
            placeholder="e.g. 20,00,000"
            required
            disabled={loading}
          />
        </div>

        {/* Payment Sources (minimal, inline) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Payment Sources (split by bank)</label>
            <span className="text-xs text-gray-500 dark:text-white/60">Remaining to allocate: ₹{remainingToAllocate.toLocaleString()}</span>
          </div>
          <div className="space-y-2">
            {allocations.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1fr,110px,28px] gap-2">
                <input
                  type="text"
                  value={row.bank}
                  onChange={(e)=>setAllocations(prev=>prev.map((r,i)=> i===idx ? ({...r, bank: e.target.value}) : r))}
                  className="px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-sm"
                  placeholder="Bank name (e.g. HDFC)"
                  disabled={loading}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount}
                  onChange={(e)=>setAllocations(prev=>prev.map((r,i)=> i===idx ? ({...r, amount: e.target.value}) : r))}
                  className="px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-sm"
                  placeholder="₹ amount"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="rounded-md bg-gray-100 dark:bg-zinc-700 px-2 text-sm"
                  aria-label="Remove"
                  onClick={()=>setAllocations(prev=> prev.filter((_,i)=> i!==idx))}
                  disabled={loading}
                >×</button>
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500 dark:text-white/60">
            Allocations total: ₹{allocations.reduce((s,a)=> s + Number(a.amount||0), 0).toLocaleString()} • On save, budget equals allocations total.
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-zinc-700"
              onClick={()=>setAllocations(prev=>[...prev, { bank: '', amount: '' }])}
              disabled={loading}
            >Add source</button>
            <span className="text-xs text-gray-500 dark:text-white/60">Allocated: ₹{totalAllocated.toLocaleString()}</span>
          </div>
        </div>
        
        <button
          type="submit"
          className="w-full btn-primary"
          disabled={loading}
        >
          {loading ? (initialAmount ? 'Updating Budget...' : 'Setting Budget...') : (initialAmount ? 'Update Budget' : 'Set Budget')}
        </button>
      </form>
    </div>
  )
}

export default BudgetForm