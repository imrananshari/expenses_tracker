"use client"
import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import client from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { getCategoryBySlug, getBudgetForMonth, upsertBudget, listExpenses, addExpense } from '@/api/db'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// Import budget components
import BudgetForm from '@/app/components/budget/BudgetForm'
import ExpenseForm from '@/app/components/budget/ExpenseForm'
import ExpenseList from '@/app/components/budget/ExpenseList'
import BudgetSummary from '@/app/components/budget/BudgetSummary'

const CategoryPage = () => {
  const router = useRouter()
  const params = useParams()
  const { user, loading } = useAuth()
  const slug = params.slug
  const [category, setCategory] = useState(null) // { id: dbId, name, slug }

  // Budget state
  const [budget, setBudget] = useState(0)
  const [budgetId, setBudgetId] = useState(null)
  const [expensesBuying, setExpensesBuying] = useState([])
  const [expensesLabour, setExpensesLabour] = useState([])
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [budgetLoading, setBudgetLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setBudgetLoading(true)
      try {
        if (!user) return
        // Load category by slug
        const { data: cat, error: catErr } = await getCategoryBySlug(user.id, slug)
        if (catErr) {
          console.error(catErr)
          toast.error('Category not found')
          setBudgetLoading(false)
          return
        }
        setCategory(cat)

        // Load budget for current month
        const { data: budgetRow, error: budgetErr } = await getBudgetForMonth(user.id, cat.id)
        if (budgetErr) {
          console.error(budgetErr)
        }
        if (budgetRow) {
          setBudget(budgetRow.amount)
          setBudgetId(budgetRow.id)
          setShowBudgetForm(false)
        } else {
          setBudget(0)
          setBudgetId(null)
          setShowBudgetForm(true)
        }

        // Load expenses by kind for this category
        const [{ data: buyRows, error: buyErr }, { data: labRows, error: labErr }] = await Promise.all([
          listExpenses(user.id, cat.id, 'buying'),
          listExpenses(user.id, cat.id, 'labour')
        ])
        if (buyErr) console.error(buyErr)
        if (labErr) console.error(labErr)
        const buyMapped = (buyRows || []).map(e => ({ id: e.id, name: e.note || 'Expense', payee: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'buying' }))
        const labMapped = (labRows || []).map(e => ({ id: e.id, name: e.note || 'Expense', payee: e.payee || null, amount: e.amount, date: e.spent_at, kind: 'labour' }))
        setExpensesBuying(buyMapped)
        setExpensesLabour(labMapped)
      } finally {
        setBudgetLoading(false)
      }
    }
    if (slug && user) {
      loadData()
    }
  }, [slug, user])

  const handleSignOut = async () => {
    try {
      const { error } = await client.auth.signOut()
      if (error) {
        toast.error(error.message)
      } else {
        toast.success('Signed out successfully')
        router.push('/')
      }
    } catch (err) {
      toast.error('Error signing out')
      console.error(err)
    }
  }

  const handleBudgetSet = async (amount) => {
    if (!category || !user) return
    const { data, error } = await upsertBudget(user.id, category.id, amount)
    if (error) {
      console.error(error)
      toast.error(error.message)
      return
    }
    setBudget(data.amount)
    setBudgetId(data.id)
    setShowBudgetForm(false)
  }

  const handleExpenseAdded = async (expense) => {
    if (!category || !user) return
    const { data, error } = await addExpense(user.id, { categoryId: category.id, budgetId, amount: expense.amount, note: expense.name, payee: expense.payee, kind: expense.kind, spentAt: expense.date })
    if (error) {
      console.error(error)
      toast.error(error.message)
      return
    }
    const mapped = { id: data.id, name: data.note || 'Expense', payee: data.payee || null, amount: data.amount, date: data.spent_at, kind: data.kind }
    if (mapped.kind === 'labour') {
      setExpensesLabour([mapped, ...expensesLabour])
    } else {
      setExpensesBuying([mapped, ...expensesBuying])
    }
  }

  const handleBackToDashboard = () => {
    router.push('/dashboard')
  }

  // Protect the route
  if (!loading && !user) {
    router.push('/')
    return null
  }

  if (loading || budgetLoading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  // Handle invalid category
  if (!category && !budgetLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Category Not Found</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            The category you're looking for doesn't exist.
          </p>
          <button 
            onClick={handleBackToDashboard}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <div className="flex items-center mb-2">
            <button 
              onClick={handleBackToDashboard}
              className="text-blue-600 dark:text-blue-400 hover:underline flex items-center mr-4"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              Back to Dashboard
            </button>
          </div>
          <h1 className="text-2xl font-bold flex items-center">
            <span className="text-3xl mr-3">{category.icon}</span>
            {category?.name}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Manage your budget and expenses for this category</p>
        </div>
        <button 
          onClick={handleSignOut}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        >
          Sign Out
        </button>
      </div>

      <div className="space-y-6">
        {showBudgetForm ? (
            // Show budget form if no budget is set
          <BudgetForm 
            categoryId={category.id} 
            categoryName={category.name} 
            onBudgetSet={handleBudgetSet} 
          />
        ) : (
          // Show budget summary and expense tracking if budget is set
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <BudgetSummary budget={budget} expenses={[...expensesBuying, ...expensesLabour]} />
              {category.slug === 'home-building' ? (
                <Tabs defaultValue="buying" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="buying">Buying Expenses</TabsTrigger>
                    <TabsTrigger value="labour">Labour Expenses</TabsTrigger>
                  </TabsList>
                  <TabsContent value="buying" className="mt-4">
                    <ExpenseForm 
                      categoryId={category.id} 
                      onExpenseAdded={handleExpenseAdded} 
                      kind="buying"
                      payeeLabel="Where/Who (shop)"
                    />
                  </TabsContent>
                  <TabsContent value="labour" className="mt-4">
                    <ExpenseForm 
                      categoryId={category.id} 
                      onExpenseAdded={handleExpenseAdded} 
                      kind="labour"
                      payeeLabel="Labour Name"
                    />
                  </TabsContent>
                </Tabs>
              ) : (
                <ExpenseForm 
                  categoryId={category.id} 
                  onExpenseAdded={handleExpenseAdded} 
                />
              )}
            </div>
            {category.slug === 'home-building' ? (
              <div className="space-y-6">
                <ExpenseList expenses={expensesBuying} title="Buying Expense History" />
                <ExpenseList expenses={expensesLabour} title="Labour Expense History" />
              </div>
            ) : (
              <ExpenseList expenses={expensesBuying} title="Expense History" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CategoryPage