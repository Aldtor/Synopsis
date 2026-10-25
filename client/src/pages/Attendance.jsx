import React, { useEffect, useState } from 'react'
import { api, getUser } from '../api.js'
import { exportCSV, exportPDF } from '../utils/export.js'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function Attendance() {
  const user = getUser()
  const canMark = user && (user.role === 'admin' || user.role === 'hod')
  const [date, setDate] = useState(todayISO())
  const [rows, setRows] = useState([])
  const [faculty, setFaculty] = useState([])
  const [form, setForm] = useState({ faculty: '', date: todayISO(), status: 'Present', remarks: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  function load(d) {
    setLoading(true)
    api(`/attendance?date=${d}`)
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(date)
    api('/faculty').then(setFaculty).catch(() => {})
  }, [])

  function changeDate(d) {
    setDate(d)
    load(d)
  }

  const attendanceColumns = [
    { key: 'facultyId', label: 'Faculty ID', width: 1 },
    { key: 'name', label: 'Name', width: 2 },
    { key: 'date', label: 'Date', width: 1 },
    { key: 'status', label: 'Status', width: 1 },
    { key: 'remarks', label: 'Remarks', width: 2 },
  ]
  const attendanceExportRows = rows.map((r) => ({
    facultyId: r.faculty ? r.faculty.facultyId : '—',
    name: r.faculty && r.faculty.user ? r.faculty.user.name : '—',
    date: r.date ? r.date.slice(0, 10) : '—',
    status: r.status,
    remarks: r.remarks || '',
  }))

  async function handleMark(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    try {
      await api('/attendance', { method: 'POST', body: form })
      setNotice('Attendance marked.')
      load(date)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>Attendance</h1>
      {canMark && (
        <form onSubmit={handleMark} className="form card">
          <h2>Mark Attendance</h2>
          <div className="form-grid">
            <label>Faculty
              <select value={form.faculty} onChange={(e) => setForm({ ...form, faculty: e.target.value })} required>
                <option value="">Select faculty</option>
                {faculty.map((f) => (
                  <option key={f._id} value={f._id}>{f.facultyId} — {f.user ? f.user.name : ''}</option>
                ))}
              </select>
            </label>
            <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
            <label>Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="Present">Present</option>
                <option value="Absent">Absent</option>
                <option value="Leave">Leave</option>
                <option value="Half-Day">Half-Day</option>
              </select>
            </label>
            <label>Remarks<input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></label>
          </div>
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}
          <button className="btn btn-primary">Mark Attendance</button>
        </form>
      )}
      <div className="filter-row">
        <label>Date
          <input type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
        </label>
        <div className="export-row">
          <button className="btn btn-primary" onClick={() => exportCSV(`attendance-${date}.csv`, attendanceColumns, attendanceExportRows)}>Export CSV</button>{' '}
          <button className="btn btn-primary" onClick={() => exportPDF(`Attendance — ${date}`, `attendance-${date}.pdf`, attendanceColumns, attendanceExportRows)}>Export PDF</button>
          <span className="muted small">Exports the rows currently shown (date: {date}).</span>
        </div>
      </div>
      {loading ? <div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><span>Loading…</span></div> : rows.length === 0 ? (
        <div className="empty-state"><p>No attendance records for this date.</p></div>
      ) : (
        <div className="table-wrap"><table className="table">
          <thead>
            <tr><th>Faculty ID</th><th>Name</th><th>Date</th><th>Status</th><th>Remarks</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td>{r.faculty ? r.faculty.facultyId : '—'}</td>
                <td>{r.faculty && r.faculty.user ? r.faculty.user.name : '—'}</td>
                <td>{r.date ? r.date.slice(0, 10) : '—'}</td>
                <td><span className={`badge badge-${(r.status || '').toLowerCase()}`}>{r.status}</span></td>
                <td>{r.remarks || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  )
}
