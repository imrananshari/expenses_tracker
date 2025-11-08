// Simple sanitization and validation utilities for form inputs
// Prevent HTML tags, URLs, and obvious harmful link patterns from being saved

// Strip any HTML tags
export function stripTags(input) {
  if (typeof input !== 'string') return ''
  return input.replace(/<[^>]*>/g, '')
}

// Detect URLs and common link patterns
export function containsUrl(input) {
  if (typeof input !== 'string') return false
  const s = input.toLowerCase()
  const urlLike = /(https?:\/\/|www\.)\S+/i
  const domainLike = /([a-z0-9][-a-z0-9]*\.)+[a-z]{2,}/i
  return urlLike.test(s) || domainLike.test(s)
}

// Normalize whitespace and trim
export function normalize(input) {
  if (typeof input !== 'string') return ''
  return input.replace(/\s+/g, ' ').trim()
}

// Strict text sanitization: strips tags, trims, rejects URLs/domains
export function sanitizeTextStrict(input, { maxLen = 120 } = {}) {
  let clean = normalize(stripTags(String(input || '')))
  if (!clean) return { valid: false, clean: '', reason: 'Empty value' }
  if (containsUrl(clean)) return { valid: false, clean: '', reason: 'Links are not allowed' }
  if (clean.length > maxLen) clean = clean.slice(0, maxLen)
  return { valid: true, clean }
}

// Sanitize numeric amount; returns NaN on invalid
export function sanitizeAmount(input) {
  const num = typeof input === 'number' ? input : parseFloat(String(input || '').replace(/,/g, ''))
  if (!isFinite(num) || num < 0) return NaN
  return Math.round(num * 100) / 100
}