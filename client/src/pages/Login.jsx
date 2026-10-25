import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, saveAuth } from '../api.js'

const DEMO = [
  { label: 'Admin', email: 'admin@bias.ac.in' },
  { label: 'HOD (CSE)', email: 'hod.cse@bias.ac.in' },
  { label: 'Faculty', email: 'faculty01@bias.ac.in' }
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api('/auth/login', { method: 'POST', body: { email, password } })
      saveAuth(data.token, data.user)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-mark" aria-hidden="true">FMS</div>
        <h1>Faculty Management System</h1>
        <p className="muted login-subtitle">Birla Institute of Applied Sciences, Bhimtal</p>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="alert error">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? (<><span className="spinner spinner-sm" aria-hidden="true" /> Signing in…</>) : 'Sign in'}
          </button>
        </form>
        <div className="demo-box">
          <strong>Demo accounts</strong>
          <p className="muted small">Password for all: <code>password123</code></p>
          <div className="demo-list">
            {DEMO.map((d) => (
              <button key={d.email} type="button" className="demo-btn" onClick={() => { setEmail(d.email); setPassword('password123') }}>
                {d.label} — {d.email}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
