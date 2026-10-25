import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { BarChart, AttendanceTrendChart } from '../components/Charts.jsx'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Format a trend point's label at the Dashboard/API boundary. The API
// returns both an ISO `date` ("2026-10-25") and a display `label`
// ("25 Oct"); if the label is ever ISO-shaped (or missing), format it
// from the date parts — never by slicing the string, so a format change
// upstream cannot silently produce a wrong label like "2026-1".
function formatTrendLabel(point) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(point.date || '')
  if (iso) {
    const day = Number(iso[3])
    const month = MONTHS_SHORT[Number(iso[2]) - 1]
    if (month) return `${day} ${month}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(point.label || '')) {
    const [, , month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(point.label)
    return `${Number(day)} ${MONTHS_SHORT[Number(month) - 1] || ''}`.trim()
  }
  return point.label
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [charts, setCharts] = useState(null)
  const [error, setError] = useState('')
  const [chartsLoading, setChartsLoading] = useState(true)
  const [chartsError, setChartsError] = useState('')

  function loadCharts() {
    setChartsError('')
    setChartsLoading(true)
    api('/dashboard/charts')
      .then((c) => setCharts({
        ...c,
        attendanceTrend: (c.attendanceTrend || []).map((d) => ({ ...d, label: formatTrendLabel(d) }))
      }))
      .catch((err) => setChartsError(err.message))
      .finally(() => setChartsLoading(false))
  }

  useEffect(() => {
    api('/dashboard/summary')
      .then(setData)
      .catch((err) => setError(err.message))
    loadCharts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {chartsLoading ? (
        <div className="chart-grid"><div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><span>Loading charts…</span></div></div>
      ) : chartsError ? (
        <div>
          <div className="alert error">Could not load charts: {chartsError}</div>
          <button className="btn btn-primary" onClick={loadCharts}>Retry</button>
        </div>
      ) : charts ? (
        <div className="chart-grid">
          <AttendanceTrendChart data={charts.attendanceTrend || []} />
          <BarChart title="Faculty per department" subtitle="Headcount by department." data={charts.facultyByDepartment || []} />
          <BarChart title="Timetable entries per department" subtitle="Scheduled classes by department." data={charts.timetableByDepartment || []} />
        </div>
      ) : null}
      <h2>Recently Blocked Conflicts</h2>
      {!data.recentConflicts || data.recentConflicts.length === 0 ? (
        <div className="empty-state"><p>No blocked conflicts recorded.</p><p className="muted small">Conflicts blocked by timetable validation will appear here.</p></div>
      ) : (
        <div>
          <p className="muted small">{data.recentConflicts.length} blocked {data.recentConflicts.length === 1 ? 'conflict' : 'conflicts'}</p>
          <div className="table-wrap"><table className="table">
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
          </table></div>
        </div>
      )}
    </div>
  )
}
