import React, { useEffect, useState } from 'react'
import { api, getUser } from '../api.js'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const EMPTY = { day: 'Monday', subject: '', faculty: '', classroom: '', startTime: '', endTime: '', department: '', semester: '', section: '' }

export default function Timetable() {
  const user = getUser()
  const canManage = user && (user.role === 'admin' || user.role === 'hod')
  const [day, setDay] = useState('')
  const [rows, setRows] = useState([])
  const [blocked, setBlocked] = useState([])
  const [faculty, setFaculty] = useState([])
  const [departments, setDepartments] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [conflicts, setConflicts] = useState([])
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [facultyLoading, setFacultyLoading] = useState(true)
  const [deptsLoading, setDeptsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // Two-step in-app delete confirmation (see Faculty.jsx): first click
  // arms the row's button, second click fires the DELETE call. No
  // native browser confirm dialog, which auto-dismisses in automated browsers.
  const [pendingDelete, setPendingDelete] = useState(null)

  function load(d) {
    setLoading(true)
    const q = d ? `?day=${d}` : ''
    api(`/timetable${q}`)
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  function loadBlocked() {
    if (!canManage) return
    api('/timetable/conflicts-log').then(setBlocked).catch(() => {})
  }

  useEffect(() => {
    load('')
    loadBlocked()
    setFacultyLoading(true)
    api('/faculty')
      .then(setFaculty)
      .catch((err) => setLoadError((prev) => prev || `Could not load faculty: ${err.message}`))
      .finally(() => setFacultyLoading(false))
    setDeptsLoading(true)
    api('/departments')
      .then(setDepartments)
      .catch((err) => setLoadError((prev) => prev || `Could not load departments: ${err.message}`))
      .finally(() => setDeptsLoading(false))
  }, [])

  function changeDay(d) {
    setDay(d)
    load(d)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError('')
    setConflicts([])
    setNotice('')
    try {
      await api('/timetable', { method: 'POST', body: form })
      setNotice('Timetable entry added.')
      setForm(EMPTY)
      load(day)
    } catch (err) {
      if (err.status === 409 && err.data && Array.isArray(err.data.conflicts)) {
        // Deliberately do NOT clear the form here, so the user can fix
        // the conflicting fields and resubmit.
        setConflicts(err.data.conflicts)
        setError(err.data.message || 'Timetable conflict detected — entry was not saved.')
        loadBlocked()
      } else {
        setError(err.message)
      }
    }
  }

  async function handleDelete(id) {
    if (pendingDelete !== id) {
      setError('')
      setNotice('')
      setPendingDelete(id)
      return
    }
    setPendingDelete(null)
    try {
      await api(`/timetable/${id}`, { method: 'DELETE' })
      setNotice('Timetable entry deleted.')
      load(day)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>Timetable</h1>
      {canManage && (
        <form onSubmit={handleAdd} className="form card">
          <h2>Add Timetable Entry</h2>
          <div className="form-grid">
            <label>Day
              <select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>Subject<input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required /></label>
            <label>Faculty
              <select value={form.faculty} onChange={(e) => setForm({ ...form, faculty: e.target.value })} required>
                {facultyLoading
                  ? <option value="" disabled>Loading…</option>
                  : <option value="">Select faculty</option>}
                {faculty.map((f) => (
                  <option key={f._id} value={f._id}>{f.facultyId} — {f.user ? f.user.name : ''}</option>
                ))}
              </select>
            </label>
            <label>Classroom<input value={form.classroom} onChange={(e) => setForm({ ...form, classroom: e.target.value })} required placeholder="LT-1" /></label>
            <label>Start time<input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required /></label>
            <label>End time<input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required /></label>
            <label>Department
              <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required>
                {deptsLoading
                  ? <option value="" disabled>Loading…</option>
                  : <option value="">Select department</option>}
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name} ({d.code})</option>)}
              </select>
            </label>
            <label>Semester<input value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} required placeholder="5" /></label>
            <label>Section<input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="A" /></label>
          </div>
          {loadError && <div className="alert error">{loadError}</div>}
          {error && <div className="alert error">{error}</div>}
          {conflicts.length > 0 && (
            <div className="conflict-box">
              <strong>Conflicts detected — entry was not saved:</strong>
              <ul>
                {conflicts.map((c, i) => (
                  <li key={i}>
                    {c.detail || `${c.subject || 'Entry'} — ${c.day || ''} ${c.startTime || ''}–${c.endTime || ''}${c.classroom ? ` in ${c.classroom}` : ''}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {notice && <div className="alert success">{notice}</div>}
          <button className="btn btn-primary">Add Entry</button>
        </form>
      )}
      <div className="filter-row">
        <label>Day filter
          <select value={day} onChange={(e) => changeDay(e.target.value)}>
            <option value="">All days</option>
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      </div>
      {loading ? <div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><span>Loading…</span></div> : rows.length === 0 ? (
        <div className="empty-state"><p>No timetable entries found.</p></div>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Day</th><th>Subject</th><th>Faculty</th><th>Classroom</th><th>Time</th><th>Department</th><th>Sem / Sec</th>{canManage && <th></th>}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td>{r.day}</td>
                <td>{r.subject}</td>
                <td>{r.faculty && r.faculty.user ? `${r.faculty.user.name} (${r.faculty.facultyId})` : '—'}</td>
                <td>{r.classroom}</td>
                <td>{r.startTime} – {r.endTime}</td>
                <td>{r.department ? `${r.department.name} (${r.department.code})` : '—'}</td>
                <td>{r.semester}{r.section ? ` / ${r.section}` : ''}</td>
                {canManage && (
                  <td>
                    {pendingDelete === r._id ? (
                      <>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r._id)}>Confirm delete?</button>{' '}
                        <button className="btn btn-sm" onClick={() => setPendingDelete(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r._id)}>Delete</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canManage && (
        <div>
          <h2>Blocked Attempts</h2>
          {blocked.length === 0 ? (
            <div className="empty-state"><p>No blocked timetable attempts recorded.</p></div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Day</th><th>Subject</th><th>Faculty</th><th>Classroom</th><th>Time</th><th>Reason</th><th>Blocked At</th></tr>
              </thead>
              <tbody>
                {blocked.map((b, i) => (
                  <tr key={i}>
                    <td>{b.day}</td>
                    <td>{b.subject}</td>
                    <td>{b.faculty && b.faculty.user ? b.faculty.user.name : '—'}</td>
                    <td>{b.classroom}</td>
                    <td>{b.startTime} – {b.endTime}</td>
                    <td>{b.reason}</td>
                    <td>{b.createdAt ? new Date(b.createdAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
