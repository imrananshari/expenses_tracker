"use client"
import React, { useState } from 'react'
import { ShoppingCart, Hammer } from 'lucide-react'
import { toast } from 'sonner'
import { sanitizeTextStrict, sanitizeAmount } from '@/lib/sanitize'

const ExpenseForm = ({ categoryId, onExpenseAdded, onExpenseEdited, initialExpense, mode = 'add', kind = 'buying', payeeLabel = 'Where/Who (shop or receiver)', categoryName = '', allocatedBanks = [] }) => {
  // Extract existing bank tag from the initial name, e.g. "[Bank: HDFC]"
  const bankTagMatch = (initialExpense?.name || '').match(/\[Bank:\s*([^\]]+)\]/)
  const initialBankName = bankTagMatch ? bankTagMatch[1].trim() : ''
  const nameWithoutBankTag = (initialExpense?.name || '').replace(/\s*\[Bank:\s*[^\]]+\]\s*/,'').trim()

  const [expenseName, setExpenseName] = useState(nameWithoutBankTag)
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
  // Prefill bank selection for edit mode
  const prefillChoice = initialBankName
    ? (['HDFC','SBI','ICICI','Central','BOI','BOB'].includes(initialBankName) ? initialBankName : 'Other')
    : ''
  const prefillCustom = initialBankName && !['HDFC','SBI','ICICI','Central','BOI','BOB'].includes(initialBankName) ? initialBankName : ''
  const [bankChoice, setBankChoice] = useState(prefillChoice) // '', 'HDFC', 'SBI', 'ICICI', 'Other'
  const [customBank, setCustomBank] = useState(prefillCustom)

  // Optional multi-bank split for this expense
  const parseSplitsFromName = (note) => {
    const s = String(note || '')
    const m = s.match(/\[Split:\s*([^\]]+)\]/i)
    if (!m) return []
    const body = m[1]
    return body.split(';').map(tok => tok.trim()).filter(Boolean).map(tok => {
      const [bank, amtStr] = tok.split('=')
      const amt = Number(amtStr || 0)
      return { bank: (bank || '').trim(), amount: isNaN(amt) ? '' : String(amt) }
    }).filter(x => x.bank && Number(x.amount) > 0)
  }
  const [bankSplits, setBankSplits] = useState(parseSplitsFromName(initialExpense?.name))

  // Bank icon resolver for preview (uses public/banks images)
  const bankIconSrc = (name) => {
    const n = (name || '').toLowerCase().trim()
    if (!n) return null
    if (n.includes('hdfc')) return '/banks/hdfc.png'
    if (n.includes('sbi')) return '/banks/sbi.png'
    if (n.includes('icici')) return '/banks/icici.png'
    if (n.includes('central')) return '/banks/central.png'
    if (n.includes('bank of india') || n === 'boi') return '/banks/boi.png'
    if (n.includes('bank of baroda') || n === 'bob') return '/banks/bob.png'
    return null
  }

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
    const chosenBank = bankChoice === 'Other' ? customBank.trim() : bankChoice
    // Validate optional splits if provided
    const splitsClean = (bankSplits || []).map((r) => ({ bank: String(r.bank||'').trim(), amount: Number(r.amount||0) }))
      .filter(r => r.bank && !isNaN(r.amount) && r.amount > 0)
    const sumSplits = splitsClean.reduce((s,r)=> s + Number(r.amount||0), 0)
    if (splitsClean.length > 0 && sumSplits !== amt) {
      toast.error(`Split amounts (₹${sumSplits.toLocaleString()}) must equal total (₹${amt.toLocaleString()})`)
      setLoading(false)
      return
    }
  const payload = {
      id: initialExpense?.id,
      name: nameSan.clean,
      payee: payeeSan.clean,
      amount: amt,
      date: when.toISOString(),
      kind,
      bankName: splitsClean.length > 0 ? undefined : (chosenBank || undefined),
      bankSplits: splitsClean.length > 0 ? splitsClean : undefined
    }
    // Validate banks against allocated payment sources
    const allocatedLower = (allocatedBanks || []).map(b => String(b || '').toLowerCase().trim()).filter(Boolean)
    if (splitsClean.length > 0) {
      const unknown = splitsClean.filter(s => !allocatedLower.includes(String(s.bank || '').toLowerCase().trim()))
      if (unknown.length > 0) {
        const names = unknown.map(u => u.bank).join(', ')
        toast.error(`Split includes bank(s) not in Payment Sources: ${names}. Add them in Budget > Payment Sources first.`)
        setLoading(false)
        return
      }
    } else if (chosenBank) {
      const exists = allocatedLower.includes(String(chosenBank).toLowerCase().trim())
      if (!exists) {
        toast.error(`Selected bank "${chosenBank}" is not in Payment Sources. Add it in Budget > Payment Sources first.`)
        setLoading(false)
        return
      }
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
      setBankChoice('')
      setCustomBank('')
      setBankSplits([])
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

        {/* Payment Sources */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-black dark:text-white">Payment Sources</label>
        {/* Single source selector for quick entry */}
        <div className="grid grid-cols-[1fr,1fr] gap-2">
            <select
              value={bankChoice}
              onChange={(e)=>setBankChoice(e.target.value)}
              className="px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white"
              disabled={loading || (bankSplits && bankSplits.length > 0)}
            >
              <option value="">Select bank</option>
              <option value="HDFC">HDFC</option>
              <option value="SBI">SBI</option>
              <option value="ICICI">ICICI</option>
              <option value="Central">Central</option>
              <option value="BOI">BOI</option>
              <option value="BOB">BOB</option>
              <option value="Other">Other…</option>
            </select>
            <input
              type="text"
              value={customBank}
              onChange={(e)=>setCustomBank(e.target.value)}
              className="px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white"
              placeholder="Custom bank name"
              disabled={loading || bankChoice !== 'Other' || (bankSplits && bankSplits.length > 0)}
            />
          </div>
          {/* Multi-source split rows */}
          <div className="space-y-2">
            <div className="text-xs text-gray-600 dark:text-white/70">Or split this amount across banks</div>
            {(bankSplits || []).map((row, idx) => (
              <div key={`split-${idx}`} className="grid grid-cols-[1fr,90px,30px] gap-2 items-center">
                <select
                  value={row.bank}
                  onChange={(e)=>setBankSplits(prev=>prev.map((r,i)=> i===idx ? ({...r, bank: e.target.value}) : r))}
                  className="px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white"
                  disabled={loading}
                >
                  <option value="">Select bank</option>
                  <option value="HDFC">HDFC</option>
                  <option value="SBI">SBI</option>
                  <option value="ICICI">ICICI</option>
                  <option value="Central">Central</option>
                  <option value="BOI">BOI</option>
                  <option value="BOB">BOB</option>
                  <option value="Other">Other…</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount}
                  onChange={(e)=>setBankSplits(prev=>prev.map((r,i)=> i===idx ? ({...r, amount: e.target.value}) : r))}
                  className="px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-700 text-black dark:text-white"
                  placeholder="₹ amt"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="rounded-md bg-gray-100 dark:bg-zinc-700 px-2 text-sm"
                  aria-label="Remove"
                  onClick={()=>setBankSplits(prev=> prev.filter((_,i)=> i!==idx))}
                  disabled={loading}
                >×</button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-zinc-700"
                onClick={()=>setBankSplits(prev=>[...prev, { bank: '', amount: '' }])}
                disabled={loading}
              >Add split source</button>
              <div className="text-xs text-gray-700 dark:text-white/70">
                Allocated ₹{(bankSplits||[]).reduce((s,r)=> s + Number(r.amount||0), 0).toLocaleString()} of ₹{Number(expenseAmount||0).toLocaleString()}
              </div>
            </div>
            </div>
          <p className="text-xs text-gray-500 dark:text-white/60">When split is used, the total must equal Amount, and each bank will be shown with icon and amount in the list.</p>
          {/* Inline warning if chosen banks not in allocated payment sources */}
          {(() => {
            const allocatedLower = (allocatedBanks || []).map(b => String(b || '').toLowerCase().trim()).filter(Boolean)
            const splitsClean = (bankSplits || []).map(r => ({ bank: String(r.bank||'').trim(), amount: Number(r.amount||0) }))
              .filter(r => r.bank && !isNaN(r.amount) && r.amount > 0)
            const unknownSplits = splitsClean.filter(s => !allocatedLower.includes(String(s.bank || '').toLowerCase().trim()))
            const warnSingle = (!splitsClean.length && bankChoice) && !allocatedLower.includes(String(bankChoice === 'Other' ? customBank.trim() : bankChoice).toLowerCase().trim())
            if (unknownSplits.length > 0 || warnSingle) {
              const names = unknownSplits.map(u => u.bank)
              const singleName = warnSingle ? (bankChoice === 'Other' ? customBank.trim() : bankChoice) : null
              const msg = names.length ? `Banks not in Payment Sources: ${names.join(', ')}` : `Bank not in Payment Sources: ${singleName}`
              return <div className="text-xs mt-1 p-2 rounded-md bg-yellow-100 text-yellow-800 dark:bg-yellow-700/20 dark:text-yellow-200">{msg}. Add in Budget › Payment Sources first.</div>
            }
            return null
          })()}
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