// Configurable API base URL for deployment: set VITE_API_URL to the hosted
// backend origin (e.g. https://your-backend.example.com/api) when deploying
// the frontend to Vercel. Falls back to the local Vite /api proxy.
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

function getToken() {
  return localStorage.getItem('fms_token')
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('fms_user') || 'null')
  } catch {
    return null
  }
}

export function saveAuth(token, user) {
  localStorage.setItem('fms_token', token)
  localStorage.setItem('fms_user', JSON.stringify(user))
}

export function clearAuth() {
  localStorage.removeItem('fms_token')
  localStorage.removeItem('fms_user')
}

// Client-side fallback: if a raw Mongoose validation message ever reaches
// the UI (the server now maps these, but belt-and-braces), rewrite it in
// plain language instead of showing Mongoose wording to the user.
export function friendlyErrorMessage(message) {
  const msg = String(message || '')
  if (!/valid enum value|Validation failed|Path `|is not a valid/i.test(msg)) return msg
  const enumMatch = msg.match(/`(\w+)` is not a valid enum value for path `(\w+)`/)
  if (enumMatch) {
    const field = enumMatch[2] === 'designation' ? 'Designation' : enumMatch[2]
    return `${field} must be one of: Professor, Associate Professor, Assistant Professor, Lecturer.`
  }
  if (/designation/i.test(msg)) return 'Designation must be one of: Professor, Associate Professor, Assistant Professor, Lecturer.'
  return 'Please check your input and try again.'
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const t = token !== undefined ? token : getToken()
  if (t) headers.Authorization = `Bearer ${t}`
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })
  } catch {
    // Network/DNS/server-down: fetch rejects, so there is no response
    // to read. Surface one plain message instead of a TypeError.
    throw new Error('Could not reach the server. Check your connection and try again.')
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) {
    if (res.status === 401) {
      // Expired/invalid token recovery (auth F14, frontend part): the
      // stored session is no longer valid, so drop it and send the
      // user back to /login. window.location.assign is used
      // deliberately here instead of react-router navigation: api.js
      // is imported by every page, and importing the router (or a
      // navigate hook, which cannot run outside a component) would
      // create a circular import. A full navigation also guarantees
      // no component keeps rendering with the stale stored user.
      // Two exceptions: the login call itself (a 401 there means
      // "invalid email or password" and must surface as a form error,
      // not a redirect that would wipe it), and when already on
      // /login (avoids a reload loop).
      const isLoginCall = path.startsWith('/auth/login')
      const alreadyOnLogin = typeof window !== 'undefined' && window.location.pathname === '/login'
      if (!isLoginCall && !alreadyOnLogin) {
        clearAuth()
        window.location.assign('/login')
      }
    }
    const err = new Error(friendlyErrorMessage((data && data.message) || `Request failed (${res.status})`))
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}
