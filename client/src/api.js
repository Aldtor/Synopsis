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

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const t = token !== undefined ? token : getToken()
  if (t) headers.Authorization = `Bearer ${t}`
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) {
    const err = new Error((data && data.message) || `Request failed (${res.status})`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}
