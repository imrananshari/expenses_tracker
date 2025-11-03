"use client"
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { getUserCategories, addCategory } from '@/api/db'

const PREDEFINED_CATEGORIES = [
  { id: 'grocery', name: 'Monthly Grocery', icon: '🛒' },
  { id: 'subscription', name: 'Subscription', icon: '📱' },
  { id: 'home-building', name: 'Home Building', icon: '🏠' },
  { id: 'personal', name: 'Personal Expenses', icon: '👤' },
  { id: 'other', name: 'Other', icon: '📝' }
]

const CategoryList = () => {
  const { user } = useAuth()
  const [categories, setCategories] = useState([])
  const [newCategory, setNewCategory] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
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
        setCategories(data.map(c => ({ id: c.slug, name: c.name, icon: '📝', _dbId: c.id })))
      } else {
        // seed initial categories for user in DB
        for (const cat of PREDEFINED_CATEGORIES) {
          await addCategory(user.id, { name: cat.name, slug: cat.id })
        }
        const { data: seeded } = await getUserCategories(user.id)
        setCategories((seeded || []).map(c => ({ id: c.slug, name: c.name, icon: '📝', _dbId: c.id })))
      }
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
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map((category) => (
          <div
            key={category.id}
            onClick={() => handleCategoryClick(category.id)}
            className="flex items-center p-4 bg-white dark:bg-zinc-800 rounded-lg shadow cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
          >
            <div className="text-2xl mr-3">{category.icon}</div>
            <div>
              <h3 className="font-medium">{category.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Click to manage budget</p>
            </div>
          </div>
        ))}
        
        {!showAddForm ? (
          <div
            onClick={() => setShowAddForm(true)}
            className="flex items-center justify-center p-4 bg-white dark:bg-zinc-800 rounded-lg shadow cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700 border-2 border-dashed border-gray-300 dark:border-gray-600"
          >
            <div className="text-center">
              <span className="text-2xl">+</span>
              <p className="text-sm text-gray-500 dark:text-gray-400">Add New Category</p>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-white dark:bg-zinc-800 rounded-lg shadow">
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
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
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