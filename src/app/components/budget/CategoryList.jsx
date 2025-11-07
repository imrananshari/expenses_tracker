"use client"
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { getUserCategories, addCategory, getBudgetForMonth } from '@/api/db'
import { Home, ShoppingCart, Smartphone, User, FileText, IndianRupee } from 'lucide-react'

const PREDEFINED_CATEGORIES = [
  { id: 'grocery', name: 'Monthly Grocery', icon: ShoppingCart },
  { id: 'subscription', name: 'Subscription', icon: Smartphone },
  { id: 'home-building', name: 'Home Building', icon: Home },
  { id: 'personal', name: 'Personal Expenses', icon: User },
  { id: 'other', name: 'Other', icon: FileText }
]

const CategoryList = () => {
  const { user } = useAuth()
  const [categories, setCategories] = useState([])
  const [newCategory, setNewCategory] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [budgets, setBudgets] = useState({}) // slug -> amount
  const router = useRouter()

  useEffect(() => {
    const loadCategories = async () => {
      if (!user) return
      const { data, error } = await getUserCategories(user.id)
      if (error) {
        console.error(error)
        toast.error('Failed to load categories')
        return
      }
      if (data && data.length > 0) {
        setCategories(data.map(c => ({ id: c.slug, name: c.name, icon: FileText, _dbId: c.id })))
      } else {
        // seed initial categories for user in DB
        for (const cat of PREDEFINED_CATEGORIES) {
          await addCategory(user.id, { name: cat.name, slug: cat.id })
        }
        const { data: seeded } = await getUserCategories(user.id)
        setCategories((seeded || []).map(c => ({ id: c.slug, name: c.name, icon: FileText, _dbId: c.id })))
      }
      // fetch current month budgets for each category
      const now = new Date()
      const budgetMap = {}
      const list = (data && data.length > 0) ? data : (await getUserCategories(user.id)).data || []
      for (const c of list) {
        const { data: budgetRow } = await getBudgetForMonth(user.id, c.id, now)
        if (budgetRow?.amount) budgetMap[c.slug] = budgetRow.amount
      }
      setBudgets(budgetMap)
    }
    loadCategories()
  }, [user])

  const handleCategoryClick = (slug) => {
    router.push(`/dashboard/category/${slug}`)
  }

  const handleAddCategory = async (e) => {
    e.preventDefault()
    if (newCategory.trim()) {
      const slug = newCategory.toLowerCase().replace(/\s+/g, '-')
      const name = newCategory.trim()
      if (user) {
        const { data, error } = await addCategory(user.id, { name, slug })
        if (error) {
          console.error(error)
          toast.error(error.message)
        } else {
          setCategories([{ id: data.slug, name: data.name, icon: '📝', _dbId: data.id }, ...categories])
          toast.success('Category added')
        }
      }
      setNewCategory('')
      setShowAddForm(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Budget Categories</h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {categories.map((category) => (
          <div
            key={category.id}
            onClick={() => handleCategoryClick(category.id)}
            className="group flex items-center p-4 card-widget cursor-pointer hover:shadow-md transition-shadow"
          >
            <span className="mr-3 w-8 h-8 rounded-full chip-ring grid place-items-center">
              {(() => { const Icon = (PREDEFINED_CATEGORIES.find(c=>c.id===category.id)?.icon) || FileText; return <Icon className="w-5 h-5 text-white transition-transform group-hover:rotate-12 group-active:-rotate-12"/> })()}
            </span>
            <div>
              <h3 className="font-medium">{category.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Click to manage budget</p>
              <div className="mt-1 flex items-center text-sm">
                <IndianRupee className="w-4 h-4 mr-1 text-[var(--brand-primary)]" />
                {budgets[category.id] ? (
                  <span className="font-medium">Assigned: ₹{Number(budgets[category.id]).toLocaleString()}</span>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400">No budget set</span>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {!showAddForm ? (
          <div
            onClick={() => setShowAddForm(true)}
            className="flex items-center justify-center p-4 card-widget cursor-pointer border-2 border-dashed border-gray-300 dark:border-gray-600"
          >
            <div className="text-center">
              <span className="text-2xl">+</span>
              <p className="text-sm text-gray-500 dark:text-gray-400">Add New Category</p>
            </div>
          </div>
        ) : (
          <div className="p-4 card-widget">
            <form onSubmit={handleAddCategory} className="space-y-3">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Category Name"
                className="w-full px-3 py-2 border rounded-md border-input bg-background"
                required
              />
              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="px-3 py-2 btn-primary"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

export default CategoryList