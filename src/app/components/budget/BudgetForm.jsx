"use client"
import React, { useState } from 'react'
import { toast } from 'sonner'

const BudgetForm = ({ categoryId, categoryName, onBudgetSet }) => {
  const [budgetAmount, setBudgetAmount] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setLoading(true)
    
    // Simulate API call to save budget
    setTimeout(() => {
      // In a real app, you would save this to a database
      const amount = parseFloat(budgetAmount)
      onBudgetSet(amount)
      toast.success(`Budget of ₹${amount.toLocaleString()} set for ${categoryName}`)
      setLoading(false)
    }, 500)
  }

  return (
    <div className="p-6 bg-white dark:bg-zinc-800 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">Set Budget for {categoryName}</h2>
      
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
        
        <button
          type="submit"
          className="w-full btn-primary"
          disabled={loading}
        >
          {loading ? 'Setting Budget...' : 'Set Budget'}
        </button>
      </form>
    </div>
  )
}

export default BudgetForm