import client from './client'

// Categories
export async function getUserCategories(userId) {
  try {
    const res = await fetch(`/api/categories?userId=${encodeURIComponent(userId)}`)
    const json = await res.json()
    if (!res.ok || json?.error) {
      return { data: null, error: new Error(json?.error || 'Failed to load categories') }
    }
    return { data: json.data || [], error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function getCategoryBySlug(userId, slug) {
  try {
    const res = await fetch(`/api/categories?userId=${encodeURIComponent(userId)}&slug=${encodeURIComponent(slug)}`)
    const json = await res.json()
    if (!res.ok || json?.error) {
      return { data: null, error: new Error(json?.error || 'Category not found') }
    }
    return { data: json.data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function addCategory(userId, { name, slug }) {
  try {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, name, slug }),
    })
    const json = await res.json()
    if (!res.ok || json?.error) {
      return { data: null, error: new Error(json?.error || 'Failed to add category') }
    }
    return { data: json, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// M-PIN helpers (client-side wrappers for server APIs)
export async function upsertMpinForEmail(email, mpin) {
  try {
    const res = await fetch('/api/mpin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, mpin }),
    })
    const json = await res.json()
    if (!res.ok || json?.error) throw new Error(json?.error || 'Failed to set M-PIN')
    return { data: json, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function loginWithMpin(email, mpin) {
  try {
    const res = await fetch('/api/mpin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, mpin }),
    })
    const json = await res.json()
    if (!res.ok || !json?.ok || (!json?.tokenHash && !json?.otp)) {
      const msg = json?.error || 'Invalid M-PIN'
      return { data: null, error: new Error(msg) }
    }
    // Prefer token_hash flow when provided (server returns hashed_token)
    let data, error
    if (json.tokenHash) {
      // With token_hash, Supabase requires only type and token_hash (no email)
      ;({ data, error } = await client.auth.verifyOtp({ type: 'magiclink', token_hash: json.tokenHash }))
    } else {
      // Fallback to OTP code flow for email
      ;({ data, error } = await client.auth.verifyOtp({ type: 'email', email, token: json.otp }))
    }
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// Budgets
export async function getBudgetForMonth(userId, categoryId, periodDate) {
  try {
    const d = new Date(periodDate || Date.now())
    const iso = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
    const res = await fetch(`/api/budgets?userId=${encodeURIComponent(userId)}&categoryId=${encodeURIComponent(categoryId)}&period=${encodeURIComponent(iso)}`)
    const json = await res.json()
    if (!res.ok || json?.error) return { data: null, error: new Error(json?.error || 'Failed to load budget') }
    return { data: json.data || null, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function upsertBudget(userId, categoryId, amount, periodDate) {
  try {
    const d = new Date(periodDate || Date.now())
    const iso = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
    const res = await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, categoryId, amount, period: iso }),
    })
    const json = await res.json()
    if (!res.ok || json?.error) return { data: null, error: new Error(json?.error || 'Failed to save budget') }
    return { data: json, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// Bulk budgets for a set of categories for the current month
export async function getBudgetsForMonthBulk(userId, categoryIds = [], periodDate) {
  try {
    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return { data: [], error: null }
    }
    const d = new Date(periodDate || Date.now())
    const iso = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
    const params = new URLSearchParams({ userId, categoryIds: categoryIds.join(','), period: iso })
    const res = await fetch(`/api/budgets?${params.toString()}`)
    const json = await res.json()
    if (!res.ok || json?.error) return { data: [], error: new Error(json?.error || 'Failed to load budgets') }
    return { data: json.data || [], error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

// Expenses
export async function listExpenses(userId, categoryId, kind) {
  try {
    const params = new URLSearchParams({ userId })
    if (categoryId) params.set('categoryId', categoryId)
    if (kind) params.set('kind', kind)
    const res = await fetch(`/api/expenses?${params.toString()}`)
    const json = await res.json()
    if (!res.ok || json?.error) return { data: [], error: new Error(json?.error || 'Failed to load expenses') }
    return { data: json.data || [], error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

export async function addExpense(userId, { categoryId, budgetId, amount, note, payee, kind, spentAt }) {
  try {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, categoryId, budgetId, amount, note, payee, kind, spentAt }),
    })
    const json = await res.json()
    if (!res.ok || json?.error) return { data: null, error: new Error(json?.error || 'Failed to add expense') }
    return { data: json, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// Avatar helpers
export async function uploadAvatarDataUrl(email, dataUrl) {
  try {
    const res = await fetch('/api/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, dataUrl }),
    })
    const json = await res.json()
    if (!res.ok || json?.error) throw new Error(json?.error || 'Avatar upload failed')
    return { url: json.url }
  } catch (err) {
    return { url: null, error: err }
  }
}

export function getAvatarUrlForEmail(email) {
  try {
    const path = String(email || '').trim().toLowerCase() + '.png'
    const { data } = client.storage.from('avatars').getPublicUrl(path)
    return data.publicUrl
  } catch (err) {
    console.warn('getAvatarUrlForEmail failed', err)
    return ''
  }
}

// Try to resolve an avatar URL only if the file actually exists.
// Uses a short-lived signed URL to verify presence; returns empty string when missing.
export async function maybeGetAvatarUrlForEmail(email) {
  try {
    const baseRaw = String(email || '').trim().toLowerCase()
    const baseEnc = encodeURIComponent(baseRaw)
    const exts = ['.png', '.jpg', '.webp']
    for (const ext of exts) {
      // Try raw path first
      let path = baseRaw + ext
      const { data, error } = await client.storage.from('avatars').createSignedUrl(path, 60)
      if (!error && data?.signedUrl) {
        return { url: data.signedUrl }
      }
      // Fallback to previously encoded key form
      path = baseEnc + ext
      const { data: data2, error: error2 } = await client.storage.from('avatars').createSignedUrl(path, 60)
      if (!error2 && data2?.signedUrl) {
        return { url: data2.signedUrl }
      }
    }
    return { url: '' }
  } catch (err) {
    return { url: '' }
  }
}

// Build a public URL for a given email and extension (.jpg/.png/.webp)
export function getPublicAvatarUrl(email, ext) {
  try {
    const path = String(email || '').trim().toLowerCase() + ext
    const { data } = client.storage.from('avatars').getPublicUrl(path)
    return data.publicUrl
  } catch (err) {
    return ''
  }
}

// Profiles helpers
export async function getProfileForUser(userId) {
  try {
    const { data, error } = await client
      .from('profiles')
      .select('user_id, name, avatar_url')
      .eq('user_id', userId)
      .maybeSingle()
    return { data: data || null, error }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function upsertProfileByEmail(email, { name, avatarUrl, userId }) {
  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, avatarUrl, userId }),
    })
    const json = await res.json()
    if (!res.ok || json?.error) throw new Error(json?.error || 'Profile upsert failed')
    return { data: json, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// Recent expenses across all categories for a user
export async function listRecentExpenses(userId, limit) {
  try {
    const params = new URLSearchParams({ userId })
    if (typeof limit === 'number' && limit > 0) params.set('limit', String(limit))
    const res = await fetch(`/api/expenses?${params.toString()}`)
    const json = await res.json()
    if (!res.ok || json?.error) return { data: [], error: new Error(json?.error || 'Failed to load recent expenses') }
    return { data: json.data || [], error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

// Build notifications from current API data for a user
// Local computation fallback (used if RPC is unavailable)
export async function listNotificationsLocal(userId) {
  try {
    const { data: categories, error: catErr } = await getUserCategories(userId)
    if (catErr) return { data: [], error: catErr }

    const notifications = []
    for (const c of (categories || [])) {
      const { data: budgetRow } = await getBudgetForMonth(userId, c.id)
      const amt = Number(budgetRow?.amount || 0)

      const [ { data: buyRows }, { data: labRows }, { data: topRows } ] = await Promise.all([
        listExpenses(userId, c.id, 'buying'),
        listExpenses(userId, c.id, 'labour'),
        listExpenses(userId, c.id, 'topup'),
      ])

      const totalSpent = (buyRows||[]).reduce((s,e)=>s+Number(e.amount||0),0) + (labRows||[]).reduce((s,e)=>s+Number(e.amount||0),0)
      const overspent = Math.max(0, totalSpent - amt)
      if (overspent > 0) {
        notifications.push({
          id: `overspend-${c.slug}`,
          type: 'overspend',
          title: `Overspent in ${c.name}`,
          message: `Exceeded budget by ₹${overspent.toLocaleString()}. Spent ₹${totalSpent.toLocaleString()} of ₹${amt.toLocaleString()}.`,
          categorySlug: c.slug,
          severity: 'danger',
          date: new Date().toISOString(),
        })
      }

      const sevenDaysAgoTs = Date.now() - 7 * 24 * 60 * 60 * 1000
      const recentCount = ([...(buyRows||[]), ...(labRows||[])]).filter(e => {
        const dTs = e.spent_at ? new Date(e.spent_at).getTime() : null
        return dTs && dTs >= sevenDaysAgoTs
      }).length
      if (recentCount >= 5) {
        notifications.push({
          id: `freq-${c.slug}`,
          type: 'frequent',
          title: `Frequent spending in ${c.name}`,
          message: `${recentCount} expenses in the last 7 days. Consider reviewing.`,
          categorySlug: c.slug,
          severity: 'warning',
          date: new Date().toISOString(),
        })
      }

      const twoDaysAgoTs = Date.now() - 2 * 24 * 60 * 60 * 1000
      (topRows || []).filter(t => {
        const dTs = t.spent_at ? new Date(t.spent_at).getTime() : null
        return dTs && dTs >= twoDaysAgoTs
      }).forEach(t => {
        notifications.push({
          id: `topup-${t.id}`,
          type: 'topup',
          title: `Budget increased in ${c.name}`,
          message: `Added ₹${Number(t.amount).toLocaleString()} • ${t.note || 'Top-up'}`,
          categorySlug: c.slug,
          severity: 'info',
          date: t.spent_at || new Date().toISOString(),
        })
      })
    }
    return { data: notifications, error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

// Preferred: RPC-based notifications; falls back to local computation on error
export async function listNotifications(userId) {
  try {
    const res = await fetch(`/api/notifications?userId=${encodeURIComponent(userId)}`)
    const json = await res.json()
    if (!res.ok || json?.error) return await listNotificationsLocal(userId)
    return { data: json.data || [], error: null }
  } catch (err) {
    return await listNotificationsLocal(userId)
  }
}