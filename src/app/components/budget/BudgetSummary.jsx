"use client"
import React from 'react'

const BudgetSummary = ({ budget, expenses }) => {
  // Calculate total spent
  const totalSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  
  // Calculate remaining budget
  const remaining = budget - totalSpent
  
  // Calculate percentage spent
  const percentageSpent = budget > 0 ? (totalSpent / budget) * 100 : 0
  
  // Determine status color based on spending
  const getStatusColor = () => {
    if (percentageSpent >= 100) return 'text-red-600 dark:text-red-400'
    if (percentageSpent >= 80) return 'text-orange-600 dark:text-orange-400'
    if (percentageSpent >= 60) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-green-600 dark:text-green-400'
  }

  const getProgressBarColor = () => {
    if (percentageSpent >= 100) return 'bg-red-500'
    if (percentageSpent >= 80) return 'bg-orange-500'
    if (percentageSpent >= 60) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  return (
    <div className="p-6 bg-white dark:bg-zinc-800 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">Budget Overview</h2>
      
      <div className="space-y-4">
        {/* Budget Amount */}
        <div className="flex justify-between items-center">
          <span className="text-gray-600 dark:text-gray-400">Total Budget:</span>
          <span className="font-semibold text-lg">₹{budget.toLocaleString()}</span>
        </div>
        
        {/* Total Spent */}
        <div className="flex justify-between items-center">
          <span className="text-gray-600 dark:text-gray-400">Total Spent:</span>
          <span className={`font-semibold text-lg ${getStatusColor()}`}>
            ₹{totalSpent.toLocaleString()}
          </span>
        </div>
        
        {/* Remaining Budget */}
        <div className="flex justify-between items-center">
          <span className="text-gray-600 dark:text-gray-400">Remaining:</span>
          <span className={`font-semibold text-lg ${remaining >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            ₹{remaining.toLocaleString()}
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Progress</span>
            <span className={getStatusColor()}>
              {percentageSpent.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div 
              className={`h-3 rounded-full transition-all duration-300 ${getProgressBarColor()}`}
              style={{ width: `${Math.min(percentageSpent, 100)}%` }}
            ></div>
          </div>
        </div>
        
        {/* Status Message */}
        <div className="mt-4 p-3 rounded-md bg-gray-50 dark:bg-gray-700">
          {percentageSpent >= 100 ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              ⚠️ Budget exceeded by ₹{Math.abs(remaining).toLocaleString()}
            </p>
          ) : percentageSpent >= 80 ? (
            <p className="text-sm text-orange-600 dark:text-orange-400">
              ⚡ Approaching budget limit. ₹{remaining.toLocaleString()} remaining
            </p>
          ) : (
            <p className="text-sm text-green-600 dark:text-green-400">
              ✅ Budget on track. ₹{remaining.toLocaleString()} remaining
            </p>
          )}
        </div>
        
        {/* Expense Count */}
        <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400 pt-2 border-t dark:border-gray-600">
          <span>Total Expenses:</span>
          <span>{expenses.length} {expenses.length === 1 ? 'item' : 'items'}</span>
        </div>
      </div>
    </div>
  )
}

export default BudgetSummary