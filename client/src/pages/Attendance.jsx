import React, { useEffect, useState } from 'react'
import { api, getUser } from '../api.js'
import { exportCSV, exportPDF } from '../utils/export.js'
import { localDateString } from '../utils/time.js'

// Local date, not UTC: toISOString() is a day behind for IST between
// 00:00 and 05:30, so "today" used to show yesterday's attendance.
function todayISO() {
  return localDateString()
}

export default function Attendance() {
  const user = getUser()
  const canMark = user && (user.role === 'admin' || user.role === 'hod')
  const [date, setDate] = useState(todayISO())
  const [rows, setRows] = useState([])
  const [faculty, setFaculty] = useState([])
  const [facultyError, setFacultyError] = useState('')
  const [form, setForm] = useState({ faculty: '', date: todayISO(), status: 'Present', remarks: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [exportError, setExportError] = useState('')

  function load(d) {
    // Guard: never send an empty ?date= — the filter keeps its
    // previous date instead (see changeDate).
    if (!d) return
    setError('')
    setLoading(true)
    api(`/attendance?date=${d}`)
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  function loadFaculty() {
    setFacultyError('')
    api('/faculty')
      .then(setFaculty)
      // Previously silent: a failed faculty fetch left an empty
      // dropdown with no explanation and no way to retry.
      .catch((err) => setFacultyError(err.message))
  }

  useEffect(() => {
    load(date)
    loadFaculty()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function changeDate(d) {
    // Empty filter date: keep the previous date, do not reload and do
    // not send ?date= (clearing a date input fires onChange with "").
    if (!d) return
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

  function handleExport(kind) {
    setExportError('')
    if (rows.length === 0) {
      // Inline notice instead of a download: no more header-only CSV
      // and no more "No rows" PDF.
      setExportError('Nothing to export for this filter.')
      return
    }
    try {
      if (kind === 'csv') exportCSV(`attendance-${date}.csv`, attendanceColumns, attendanceExportRows)
      else exportPDF(`Attendance — ${date}`, `attendance-${date}.pdf`, attendanceColumns, attendanceExportRows)
    } catch (err) {
      setExportError(err.message || 'Export failed. Please try again.')
    }
  }

  async function handleMark(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setMarking(true)
    try {
      await api('/attendance', { method: 'POST', body: form })
      setNotice('Attendance marked.')
      // Reload the MARKED date (not the old filter date) and sync the
      // filter to it, so the just-marked record is visible; clear
      // remarks so a second mark does not carry them over. Re-marking
      // the same faculty/date updates via the server upsert, so no
      // separate attendance edit UI is needed.
      setDate(form.date)
      load(form.date)
      setForm((prev) => ({ ...prev, remarks: '' }))
    } catch (err) {
      setError(err.message)
    } finally {
      setMarking(false)
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
          {facultyError && <div className="alert error">Could not load faculty: {facultyError} <button type="button" className="btn btn-sm" onClick={loadFaculty}>Retry</button></div>}
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}
          <button className="btn btn-primary" disabled={marking}>{marking ? 'Saving…' : 'Mark Attendance'}</button>
        </form>
      )}
      <div className="filter-row">
        <label>Date
          <input type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
        </label>
        <div className="export-row">
          <button className="btn btn-primary" disabled={loading} onClick={() => handleExport('csv')}>Export CSV</button>{' '}
          <button className="btn btn-primary" disabled={loading} onClick={() => handleExport('pdf')}>Export PDF</button>
          <span className="muted small">Exports the rows currently shown (date: {date}).</span>
        </div>
      </div>
      {exportError && <div className="alert error">{exportError}</div>}
      {loading ? <div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><span>Loading…</span></div> : rows.length === 0 ? (
        <div className="empty-state"><p>No attendance records for this date.</p></div>
      ) : (
        <div>
          <p className="muted small">{rows.length} attendance {rows.length === 1 ? 'record' : 'records'} — {date}</p>
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
        </div>
      )}
    </div>
  )
}
