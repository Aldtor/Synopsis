import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/dashboard/summary')
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <div><h1>Dashboard</h1><div className="alert error">{error}</div></div>
  if (!data) return <div><h1>Dashboard</h1><div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><span>Loading dashboard…</span></div></div>

  const cards = [
    { label: 'Faculty Members', value: data.facultyCount },
    { label: 'Departments', value: data.deptCount },
    { label: 'Timetable Entries', value: data.timetableCount },
    { label: 'Pending Leave Requests', value: data.pendingLeaves },
    { label: 'Conflicts Prevented', value: data.conflictsPrevented },
    { label: 'Present Today', value: data.todayPresent }
  ]

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="muted">Overview of faculty administration and scheduling.</p>
      <div className="stat-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <div className="stat-value">{c.value ?? 0}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>
      <h2>Recently Blocked Conflicts</h2>
      {!data.recentConflicts || data.recentConflicts.length === 0 ? (
        <div className="empty-state"><p>No blocked conflicts recorded.</p><p className="muted small">Conflicts blocked by timetable validation will appear here.</p></div>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Day</th><th>Subject</th><th>Faculty</th><th>Classroom</th><th>Time</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {data.recentConflicts.map((c, i) => (
              <tr key={i}>
                <td>{c.day}</td>
                <td>{c.subject}</td>
                <td>{c.faculty && c.faculty.user ? c.faculty.user.name : '—'}</td>
                <td>{c.classroom}</td>
                <td>{c.startTime} – {c.endTime}</td>
                <td>{c.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
