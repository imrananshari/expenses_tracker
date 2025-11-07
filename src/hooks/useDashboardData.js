"use client"
import React, { createContext, useContext, useMemo, useState } from 'react'

const DashboardDataContext = createContext(null)

export const DashboardDataProvider = ({ children }) => {
  const [categories, setCategories] = useState(null) // [{id,name,slug}]
  const [categoryBudgets, setCategoryBudgets] = useState(null) // [{name,slug,amount}]
  const [recent, setRecent] = useState(null) // raw rows from API
  const [notifications, setNotifications] = useState(null)
  const [lastUpdatedTs, setLastUpdatedTs] = useState(0)

  const loaded = useMemo(() => {
    return Boolean(categories && categoryBudgets && recent && notifications)
  }, [categories, categoryBudgets, recent, notifications])

  const initialize = ({ categories: cats, categoryBudgets: budgets, recent: rec, notifications: notifs }) => {
    setCategories(cats || [])
    setCategoryBudgets(budgets || [])
    setRecent(rec || [])
    setNotifications(notifs || [])
    setLastUpdatedTs(Date.now())
  }

  const addRecentExpense = (row) => {
    if (!row) return
    setRecent(prev => {
      const list = Array.isArray(prev) ? prev : []
      // Avoid duplicates if this expense already exists
      const exists = list.some(r => r.id === row.id)
      const next = exists ? list.map(r => (r.id === row.id ? row : r)) : [row, ...list]
      return next.slice(0, 50) // cap to 50 for sanity
    })
    setLastUpdatedTs(Date.now())
  }

  const updateRecentExpense = (row) => {
    if (!row) return
    setRecent(prev => (Array.isArray(prev) ? prev.map(r => (r.id === row.id ? row : r)) : [row]))
    setLastUpdatedTs(Date.now())
  }

  const value = {
    // data
    categories, categoryBudgets, recent, notifications, loaded, lastUpdatedTs,
    // setters
    setCategories, setCategoryBudgets, setRecent, setNotifications,
    initialize, addRecentExpense, updateRecentExpense,
  }

  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  )
}

export const useDashboardData = () => {
  const ctx = useContext(DashboardDataContext)
  if (!ctx) {
    throw new Error('useDashboardData must be used within DashboardDataProvider')
  }
  return ctx
}