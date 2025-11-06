"use client"
import React, { useState } from 'react'
import { ShoppingCart, Hammer } from 'lucide-react'
import { toast } from 'sonner'

const ExpenseForm = ({ categoryId, onExpenseAdded, onExpenseEdited, initialExpense, mode = 'add', kind = 'buying', payeeLabel = 'Where/Who (shop or receiver)' }) => {
  const [expenseName, setExpenseName] = useState(initialExpense?.name || '')
  const [payee, setPayee] = useState(initialExpense?.payee || '')
  const [expenseAmount, setExpenseAmount] = useState(initialExpense?.amount ? String(initialExpense.amount) : '')
  const [expenseDate, setExpenseDate] = useState(() => {
    if (initialExpense?.date) {
      try {
        const d = new Date(initialExpense.date)
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      } catch { return '' }
    }
    return ''
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setLoading(true)
    const when = expenseDate ? new Date(expenseDate) : new Date()
    const payload = {
      id: initialExpense?.id,
      name: expenseName,
      payee: payee || undefined,
      amount: parseFloat(expenseAmount),
      date: when.toISOString(),
      kind
    }
    if (mode === 'edit' && typeof onExpenseEdited === 'function') {
      onExpenseEdited(payload)
      toast.success('Expense updated')
      setLoading(false)
    } else {
      onExpenseAdded(payload)
      toast.success(`Added expense: ${expenseName}`)
      // Reset form
      setExpenseName('')
      setExpenseAmount('')
      setPayee('')
      setExpenseDate('')
      setLoading(false)
    }
  }

  return (
    <div className="p-6 bg-white dark:bg-zinc-800 rounded-lg shadow">
      <div className="flex items-center gap-2 mb-4">
        {(kind === 'labour') ? (
          <Hammer className="w-5 h-5 text-[var(--brand-primary)]" />
        ) : (
          <ShoppingCart className="w-5 h-5 text-[var(--brand-primary)]" />
        )}
        <h2 className="text-xl font-semibold">{mode === 'edit' ? 'Edit Expense' : (kind === 'labour' ? 'Add Labour Expense' : 'Add New Expense')}</h2>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="expenseName" className="text-sm font-medium">
            Expense Name
          </label>
          <input
            id="expenseName"
            type="text"
            value={expenseName}
            onChange={(e) => setExpenseName(e.target.value)}
            className="w-full px-3 py-2 border rounded-md border-input bg-background"
            placeholder="e.g. Bricks, Cement, Labor"
            required
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="payee" className="text-sm font-medium">
            {kind === 'labour' ? 'Labour Name' : payeeLabel}
          </label>
          <input
            id="payee"
            type="text"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            className="w-full px-3 py-2 border rounded-md border-input bg-background"
            placeholder="e.g. Star Hardware or John Doe"
            disabled={loading}
          />
        </div>
        
        <div className="space-y-2">
          <label htmlFor="expenseAmount" className="text-sm font-medium">
            Amount (₹)
          </label>
          <input
            id="expenseAmount"
            type="number"
            min="0"
            step="0.01"
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value)}
            className="w-full px-3 py-2 border rounded-md border-input bg-background"
            placeholder="e.g. 5,000"
            required
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="expenseDate" className="text-sm font-medium">
            Spent Date
          </label>
          <input
            id="expenseDate"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-md border-input bg-background"
            disabled={loading}
          />
          <p className="text-xs text-gray-500">Leave empty to use today’s date.</p>
        </div>
        
        <button
          type="submit"
          className="w-full btn-primary"
          disabled={loading}
        >
          {loading ? (mode === 'edit' ? 'Saving...' : 'Adding...') : (mode === 'edit' ? 'Save Changes' : 'Add Expense')}
        </button>
      </form>
    </div>
  )
}

export default ExpenseForm