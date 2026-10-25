import React from 'react'
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

function Layout({ children }) {
  const user = getUser()
  const navigate = useNavigate()
  const location = useLocation()

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
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title">FMS</div>
          <div className="brand-sub">Faculty Management<br />BIAS, Bhimtal</div>
        </div>
        <nav className="nav">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className={location.pathname === l.to ? 'nav-link active' : 'nav-link'}>
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
  const user = getUser()
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
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
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
