import React, { useEffect, useState } from 'react'
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { getUser, clearAuth } from './api.js'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Faculty from './pages/Faculty.jsx'
import Departments from './pages/Departments.jsx'
import Attendance from './pages/Attendance.jsx'
import Leave from './pages/Leave.jsx'
import Timetable from './pages/Timetable.jsx'

function RequireAuth({ children }) {
  const user = getUser()
  if (!user) return <Navigate to="/login" replace />
  return children
}

// LOGIN FIRST-RENDER FIX — do not inline the auth check in App.
// App itself is NOT a router context consumer, so its function body
// only runs on its own renders, not on navigation. The old code read
// getUser() once in App and baked the result into the /login route
// element (`user ? <Navigate to="/" /> : <Login />`). After logout,
// clearAuth() + navigate('/login') never re-ran App, so /login still
// rendered the stale <Navigate to="/" />, while RequireAuth (which
// reads fresh) sent "/" straight back to /login — a redirect loop
// rendering nothing but the fixed aurora glow, until a reload
// re-ran App. Reading getUser() HERE, inside a component that Routes
// renders on every location change, makes the decision fresh on
// every navigation, in both directions, with no spinner involved.
function LoginRoute() {
  const user = getUser()
  if (user) return <Navigate to="/" replace />
  return <Login />
}

function Layout({ children }) {
  const user = getUser()
  const navigate = useNavigate()
  const location = useLocation()
  // Mobile navigation: collapsed behind a hamburger toggle (see CSS:
  // .nav-toggle is hidden on desktop, nav/footer hidden on phones
  // unless the sidebar carries .nav-open). Closed on every route
  // change so a tapped link never leaves the menu covering content.
  const [navOpen, setNavOpen] = useState(false)
  useEffect(() => { setNavOpen(false) }, [location.pathname])

  const links = [
    { to: '/', label: 'Dashboard' },
    { to: '/faculty', label: 'Faculty' },
    { to: '/departments', label: 'Departments' },
    { to: '/attendance', label: 'Attendance' },
    { to: '/leaves', label: 'Leave' },
    { to: '/timetable', label: 'Timetable' }
  ]

  function logout() {
    clearAuth()
    navigate('/login')
  }

  return (
    <div className="layout">
      <aside className={`sidebar${navOpen ? ' nav-open' : ''}`}>
        <div className="sidebar-head">
          <div className="brand">
            <div className="brand-title">FMS</div>
            <div className="brand-sub">Faculty Management<br />BIAS, Bhimtal</div>
          </div>
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={navOpen}
            aria-controls="primary-nav"
            aria-label={navOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? '✕' : '☰'}
          </button>
        </div>
        <nav className="nav" id="primary-nav">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className={location.pathname === l.to ? 'nav-link active' : 'nav-link'} onClick={() => setNavOpen(false)}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-box">
            <strong>{user ? user.name : ''}</strong>
            <span>{user ? `${user.role}${user.department ? ` · ${user.department.code || user.department.name || ''}` : ''}` : ''}</span>
          </div>
          <button className="btn btn-outline" onClick={logout}>Logout</button>
        </div>
      </aside>
      <main className="main">
        <div className="content">{children}</div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <>
      {/* Plasma/aurora backdrop: fixed CSS blobs, animated with transform/opacity only. */}
      <div className="aurora" aria-hidden="true">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
        <div className="aurora-blob aurora-blob-4" />
      </div>
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/" element={<RequireAuth><Layout><Dashboard /></Layout></RequireAuth>} />
      <Route path="/faculty" element={<RequireAuth><Layout><Faculty /></Layout></RequireAuth>} />
      <Route path="/departments" element={<RequireAuth><Layout><Departments /></Layout></RequireAuth>} />
      <Route path="/attendance" element={<RequireAuth><Layout><Attendance /></Layout></RequireAuth>} />
      <Route path="/leaves" element={<RequireAuth><Layout><Leave /></Layout></RequireAuth>} />
      <Route path="/timetable" element={<RequireAuth><Layout><Timetable /></Layout></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
