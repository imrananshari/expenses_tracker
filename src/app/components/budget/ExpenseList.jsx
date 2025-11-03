"use client"
import React from 'react'

const ExpenseList = ({ expenses, title = 'Expense History' }) => {
  if (expenses.length === 0) {
    return (
      <div className="p-6 bg-white dark:bg-zinc-800 rounded-lg shadow text-center">
        <p className="text-gray-500 dark:text-gray-400">No expenses added yet</p>
      </div>
    )
  }

  return (
    <div className="p-6 bg-white dark:bg-zinc-800 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b dark:border-gray-700">
              <th className="py-2 text-left">Item</th>
              <th className="py-2 text-left">Where/Who</th>
              <th className="py-2 text-right">Amount</th>
              <th className="py-2 text-right">Date</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => (
              <tr key={expense.id} className="border-b dark:border-gray-700">
                <td className="py-3">{expense.name}</td>
                <td className="py-3">{expense.payee || '-'}</td>
                <td className="py-3 text-right">₹{expense.amount.toLocaleString()}</td>
                <td className="py-3 text-right text-sm text-gray-500">
                  {new Date(expense.date).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ExpenseList