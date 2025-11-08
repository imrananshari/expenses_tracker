"use client"
import React, { useState } from 'react'
import { ShoppingCart, Hammer } from 'lucide-react'
import { toast } from 'sonner'
import { sanitizeTextStrict, sanitizeAmount } from '@/lib/sanitize'

const ExpenseForm = ({ categoryId, onExpenseAdded, onExpenseEdited, initialExpense, mode = 'add', kind = 'buying', payeeLabel = 'Where/Who (shop or receiver)', categoryName = '' }) => {
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

  // Today string for max date (disable future dates)
  const todayStr = (() => {
    const t = new Date()
    const yyyy = t.getFullYear()
    const mm = String(t.getMonth() + 1).padStart(2, '0')
    const dd = String(t.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  })()

  // Dynamic UI strings based on kind and category
  const titleText = mode === 'edit'
    ? 'Edit Expense'
    : (kind === 'labour' ? 'Add Labour Expense' : (kind === 'sale' ? 'Add New Sales' : 'Add New Purchase'))

  const normalizedCat = (categoryName || '').toLowerCase()
  const isGarments = normalizedCat.includes('cloth') || normalizedCat.includes('garment')
  const isGrocery = normalizedCat.includes('grocery') || normalizedCat.includes('general store')
  const isAuto = normalizedCat.includes('auto') || normalizedCat.includes('spare')
  const isRestaurant = normalizedCat.includes('restaurant') || normalizedCat.includes('cafe')
  const isFoodShop = normalizedCat.includes('food shop') || normalizedCat.includes('food')
  const isHome = normalizedCat.includes('home')
  const isSubscription = normalizedCat.includes('subscription')
  const isPersonal = normalizedCat.includes('personal')
  const isOther = normalizedCat.includes('other')

  const placeholdersByCategory = () => {
    if (kind === 'sale') {
      if (isGarments) return { name: 'e.g. T-shirt, Saree, Jeans', who: 'e.g. Customer Name' }
      if (isGrocery) return { name: 'e.g. Rice, Oil, Sugar', who: 'e.g. Customer Name' }
      if (isAuto) return { name: 'e.g. Brake Pads, Filters, Tyres', who: 'e.g. Customer Name' }
      if (isRestaurant) return { name: 'e.g. Burger, Tea, Soda', who: 'e.g. Customer Name' }
      if (isFoodShop) return { name: 'e.g. Bread, Cakes, Snacks', who: 'e.g. Customer Name' }
      return { name: 'e.g. Item name', who: 'e.g. Customer Name' }
    } else if (kind === 'labour') {
      return { name: 'e.g. Masonry, Plastering, Carpentry', who: 'e.g. Labour Name' }
    } else {
      // purchase
      if (isGarments) return { name: 'e.g. Fabric Roll, Buttons, Zippers', who: 'e.g. ABC Fabrics or Fashion House' }
      if (isGrocery) return { name: 'e.g. Wheat Flour, Oil, Sugar', who: 'e.g. Fresh Mart or Balaji Grocery' }
      if (isAuto) return { name: 'e.g. Tyres, Engine Oil, Bolts', who: 'e.g. Star Hardware or Auto Hub' }
      if (isRestaurant) return { name: 'e.g. Vegetables, Meat, Beverages', who: 'e.g. Wholesale Market or Chef Supply' }
      if (isFoodShop) return { name: 'e.g. Bread Flour, Dairy, Packaging', who: 'e.g. Bakery Supplier or Dairy Depot' }
      if (isHome) return { name: 'e.g. Bricks, Cement, Labor', who: 'e.g. Star Hardware or John Doe' }
      if (isSubscription) return { name: 'e.g. Netflix, Internet, Insurance', who: 'e.g. Provider or Vendor' }
      if (isPersonal) return { name: 'e.g. Coffee, Taxi, Gift', who: 'e.g. Store or Person' }
      if (isOther) return { name: 'e.g. Misc, Travel, Repairs', who: 'e.g. Vendor or Person' }
      return { name: 'e.g. Item name', who: 'e.g. Store or Person' }
    }
  }

  const { name: namePlaceholder, who: payeePlaceholder } = placeholdersByCategory()
  const submitText = loading
    ? (mode === 'edit' ? 'Saving...' : 'Adding...')
    : (mode === 'edit' ? 'Save Changes' : (kind === 'sale' ? 'Add Sales' : (kind === 'labour' ? 'Add Labour Expense' : 'Add Purchase')))

  const handleSubmit = (e) => {
    e.preventDefault()
    setLoading(true)
    const when = expenseDate ? new Date(expenseDate) : new Date()

    // Sanitize text inputs
    const nameSan = sanitizeTextStrict(expenseName, { maxLen: 120 })
    if (!nameSan.valid) {
      toast.error('Invalid item name: ' + nameSan.reason)
      setLoading(false)
      return
    }
    const payeeSan = payee ? sanitizeTextStrict(payee, { maxLen: 120 }) : { valid: true, clean: undefined }
    if (payee && !payeeSan.valid) {
      toast.error('Invalid payee: ' + payeeSan.reason)
      setLoading(false)
      return
    }

    // Validate amount
    const amt = sanitizeAmount(expenseAmount)
    if (isNaN(amt)) {
      toast.error('Invalid amount')
      setLoading(false)
      return
    }
    const payload = {
      id: initialExpense?.id,
      name: nameSan.clean,
      payee: payeeSan.clean,
      amount: amt,
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
    <div className="p-6 bg-white dark:bg-zinc-800 rounded-lg shadow text-black dark:text-white">
      <div className="flex items-center gap-2 mb-4">
        {(kind === 'labour') ? (
          <Hammer className="w-5 h-5 text-[var(--brand-primary)]" />
        ) : (
          <ShoppingCart className="w-5 h-5 text-[var(--brand-primary)]" />
        )}
        <h2 className="text-xl font-semibold text-black dark:text-white">{titleText}</h2>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="expenseName" className="text-sm font-medium text-black dark:text-white">
            Expense Name
          </label>
          <input
            id="expenseName"
            type="text"
            value={expenseName}
            onChange={(e) => setExpenseName(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white placeholder:text-black/70 dark:placeholder:text-black/70 caret-black"
            placeholder={namePlaceholder}
            required
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="payee" className="text-sm font-medium text-black dark:text-white">
            {kind === 'labour' ? 'Labour Name' : payeeLabel}
          </label>
          <input
            id="payee"
            type="text"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white placeholder:text-black/70 dark:placeholder:text-black/70 caret-black"
            placeholder={payeePlaceholder}
            disabled={loading}
          />
        </div>
        
        <div className="space-y-2">
          <label htmlFor="expenseAmount" className="text-sm font-medium text-black dark:text-white">
            Amount (₹)
          </label>
          <input
            id="expenseAmount"
            type="number"
            min="0"
            step="0.01"
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white placeholder:text-black/70 dark:placeholder:text-black/70 caret-black"
            placeholder="e.g. 5,000"
            required
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="expenseDate" className="text-sm font-medium text-black dark:text-white">
            Spent Date
          </label>
          <input
            id="expenseDate"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white"
            max={todayStr}
            disabled={loading}
          />
          <p className="text-xs text-gray-500 dark:text-white/60">Leave empty to use today’s date.</p>
        </div>
        
        <button
          type="submit"
          className="w-full btn-primary"
          disabled={loading}
        >
          {submitText}
        </button>
      </form>
    </div>
  )
}

export default ExpenseForm