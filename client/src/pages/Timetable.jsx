import React, { useEffect, useState } from 'react'
import { api, getUser } from '../api.js'
import { exportCSV, exportPDF, fileStamp } from '../utils/export.js'
import { normalizeTime, timeToMinutes } from '../utils/time.js'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const EMPTY = { day: 'Monday', subject: '', faculty: '', classroom: '', startTime: '', endTime: '', department: '', semester: '', section: '' }

// Semester must be a whole number from 1 to 8. Plain message, checked
// client-side before either the manual add/edit or the generator
// preview, and always sent to the server as a number, never a string.
function semesterError(value) {
  if (!/^\d+$/.test(String(value).trim())) return 'Semester must be a whole number between 1 and 8.'
  const n = Number(value)
  if (n < 1 || n > 8) return 'Semester must be a whole number between 1 and 8.'
  return ''
}

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
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [exportError, setExportError] = useState('')
  // Two-step in-app delete confirmation (see Faculty.jsx): first click
  // arms the row's button, second click fires the DELETE call. No
  // native browser confirm dialog, which auto-dismisses in automated browsers.
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  // Auto timetable generation: preview first (no writes), then confirm.
  const [genDept, setGenDept] = useState('')
  const [genSem, setGenSem] = useState('')
  const [genSection, setGenSection] = useState('A')
  const [preview, setPreview] = useState(null)
  const [genError, setGenError] = useState('')
  const [genNotice, setGenNotice] = useState('')
  const [genBusy, setGenBusy] = useState(false)
  // Leave warnings returned by the generator (preview + confirm).
  // Display-only: warning-only per the backend — nobody is excluded
  // from generation on the basis of a warning. Absent/empty = no UI.
  const [confirmWarnings, setConfirmWarnings] = useState([])

  function formatLeaveWarning(w) {
    const who = `${w.name || '—'}${w.facultyId ? ` (${w.facultyId})` : ''}`
    const fmt = (d) => {
      if (!d) return ''
      const parsed = new Date(d)
      return Number.isNaN(parsed.getTime()) ? String(d) : parsed.toLocaleDateString()
    }
    const range = w.fromDate || w.toDate ? ` — ${fmt(w.fromDate)} to ${fmt(w.toDate)}` : ''
    return `${who} — ${w.type || 'leave'}${range}`
  }

  function LeaveWarnings({ warnings }) {
    if (!Array.isArray(warnings) || warnings.length === 0) return null
    return (
      <div className="alert warning">
        <strong>Leave warnings (warning only — these faculty are not excluded from generation):</strong>
        <ul>
          {warnings.map((w, i) => <li key={i}>{formatLeaveWarning(w)}</li>)}
        </ul>
      </div>
    )
  }

  const timetableColumns = [
    { key: 'day', label: 'Day', width: 1 },
    { key: 'subject', label: 'Subject', width: 2 },
    { key: 'faculty', label: 'Faculty', width: 2 },
    { key: 'classroom', label: 'Classroom', width: 1 },
    { key: 'time', label: 'Time', width: 1 },
    { key: 'department', label: 'Department', width: 2 },
    { key: 'semester', label: 'Sem / Sec', width: 1 },
  ]

  const q = search.trim().toLowerCase()
  const filteredRows = q
    ? rows.filter((r) =>
        (r.subject || '').toLowerCase().includes(q)
        || (r.faculty && r.faculty.user ? r.faculty.user.name : '').toLowerCase().includes(q)
        || (r.faculty ? r.faculty.facultyId || '' : '').toLowerCase().includes(q)
        || (r.classroom || '').toLowerCase().includes(q))
    : rows
  const timetableExportRows = filteredRows.map((r) => ({
    day: r.day,
    subject: r.subject,
    faculty: r.faculty && r.faculty.user ? `${r.faculty.user.name} (${r.faculty.facultyId})` : '—',
    classroom: r.classroom,
    time: `${r.startTime} – ${r.endTime}`,
    department: r.department ? `${r.department.name} (${r.department.code})` : '—',
    semester: `${r.semester ?? '—'}${r.section ? ` / ${r.section}` : ''}`,
  }))

  function handleExport(kind) {
    setExportError('')
    if (filteredRows.length === 0) {
      // Inline notice instead of a download: no more header-only CSV
      // and no more "No rows" PDF.
      setExportError('Nothing to export for this filter.')
      return
    }
    try {
      if (kind === 'csv') exportCSV(`timetable-${fileStamp()}.csv`, timetableColumns, timetableExportRows)
      else exportPDF('Timetable', `timetable-${fileStamp()}.pdf`, timetableColumns, timetableExportRows)
    } catch (err) {
      setExportError(err.message || 'Export failed. Please try again.')
    }
  }

  async function handlePreview(e) {
    e.preventDefault()
    setGenError('')
    setGenNotice('')
    setPreview(null)
    setConfirmWarnings([])
    const semErr = semesterError(genSem)
    if (semErr) {
      setGenError(semErr)
      return
    }
    setGenBusy(true)
    try {
      const data = await api('/timetable/generate-preview', {
        method: 'POST',
        body: { department: genDept, semester: Number(genSem), section: genSection || 'A' },
      })
      setPreview(data)
    } catch (err) {
      setGenError(err.message)
    } finally {
      setGenBusy(false)
    }
  }

  async function handleConfirm() {
    if (!preview || preview.entries.length === 0) return
    setGenError('')
    setGenNotice('')
    setGenBusy(true)
    try {
      const data = await api('/timetable/generate-confirm', {
        method: 'POST',
        body: { department: preview.department, semester: preview.semester, section: preview.section, entries: preview.entries },
      })
      setGenNotice(`Saved ${data.savedCount} timetable entries.${data.skippedCount > 0 ? ` ${data.skippedCount} previewed entries were skipped at confirm time because they now conflict.` : ''}`)
      setConfirmWarnings(Array.isArray(data.leaveWarnings) ? data.leaveWarnings : [])
      setPreview(null)
      load(day)
      loadBlocked()
    } catch (err) {
      setGenError(err.message)
    } finally {
      setGenBusy(false)
    }
  }

  function load(d) {
    setError('')
    setLoadError('')
    setLoading(true)
    const q2 = d ? `?day=${d}` : ''
    api(`/timetable${q2}`)
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  function loadBlocked() {
    if (!canManage) return
    api('/timetable/conflicts-log').then(setBlocked).catch(() => {})
  }

  function loadDropdowns() {
    setLoadError('')
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
  }

  useEffect(() => {
    load('')
    loadBlocked()
    loadDropdowns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function changeDay(d) {
    setDay(d)
    load(d)
  }

  // Normalise a time field on blur only. Never on change: reformatting
  // mid-typing is what used to move the caret / wipe partial input.
  // If the value is not yet a complete valid time it is left untouched
  // so the user can keep editing it.
  function blurTime(field) {
    const normalised = normalizeTime(form[field])
    if (normalised && normalised !== form[field]) {
      setForm({ ...form, [field]: normalised })
    }
  }

  function startEdit(r) {
    setError('')
    setConflicts([])
    setNotice('')
    setEditingId(r._id)
    setForm({
      day: r.day || 'Monday',
      subject: r.subject || '',
      faculty: r.faculty ? r.faculty._id : '',
      classroom: r.classroom || '',
      startTime: r.startTime || '',
      endTime: r.endTime || '',
      department: r.department ? r.department._id : '',
      semester: r.semester === null || r.semester === undefined ? '' : String(r.semester),
      section: r.section || ''
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY)
    setError('')
    setConflicts([])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setConflicts([])
    setNotice('')
    // Validate times client-side BEFORE the API call, with the form
    // left intact (same as the conflict path below). The server also
    // enforces HH:MM and end-after-start; this only surfaces the same
    // failures without a round trip and without clearing typed input.
    const startTime = normalizeTime(form.startTime)
    const endTime = normalizeTime(form.endTime)
    if (!startTime || !endTime) {
      setError('Enter valid start and end times like 09:30 (hours 00–23, minutes 00–59).')
      return
    }
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      setError('End time must be after start time.')
      return
    }
    const semErr = semesterError(form.semester)
    if (semErr) {
      setError(semErr)
      return
    }
    setSaving(true)
    try {
      const payload = { ...form, startTime, endTime, semester: Number(form.semester) }
      if (editingId) {
        await api(`/timetable/${editingId}`, { method: 'PUT', body: payload })
        setNotice('Timetable entry updated.')
        cancelEdit()
      } else {
        await api('/timetable', { method: 'POST', body: payload })
        setNotice('Timetable entry added.')
        setForm(EMPTY)
      }
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
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (pendingDelete !== id) {
      setError('')
      setNotice('')
      setPendingDelete(id)
      return
    }
    // Do NOT clear pendingDelete before the await (see Faculty.jsx).
    setDeletingId(id)
    try {
      await api(`/timetable/${id}`, { method: 'DELETE' })
      setNotice('Timetable entry deleted.')
      load(day)
    } catch (err) {
      setError(err.message)
    } finally {
      setPendingDelete(null)
      setDeletingId(null)
    }
  }

  return (
    <div>
      <h1>Timetable</h1>
      {canManage && (
        <form onSubmit={handleSubmit} className="form card">
          <h2>{editingId ? 'Edit Timetable Entry' : 'Add Timetable Entry'}</h2>
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
            {/* Plain text time fields, NOT native type="time": a native
                time picker's DOM value is "" while a segment is still
                incomplete, so the old controlled binding wiped each
                partial keystroke and forced segment-by-segment entry.
                onChange stores keystrokes verbatim (no reformatting,
                so the caret never jumps); blur normalises "9:30" /
                "0930" to "09:30"; submit validates (see handleSubmit). */}
            <label>Start time<input type="text" inputMode="numeric" autoComplete="off" placeholder="09:30" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} onBlur={() => blurTime('startTime')} required /></label>
            <label>End time<input type="text" inputMode="numeric" autoComplete="off" placeholder="09:30" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} onBlur={() => blurTime('endTime')} required /></label>
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
          {loadError && <div className="alert error">{loadError} <button type="button" className="btn btn-sm" onClick={loadDropdowns}>Retry</button></div>}
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
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Entry'}</button>
          {editingId && <>{' '}<button type="button" className="btn" onClick={cancelEdit} disabled={saving}>Cancel</button></>}
        </form>
      )}
      {canManage && (
        <form onSubmit={handlePreview} className="form card">
          <h2>Auto-Generate Timetable</h2>
          <p className="muted small">Pick one department and semester, preview a week with no conflicts at preview time (Monday–Friday, 09:00–13:00 and 14:00–16:00), then confirm to save. Preview never saves anything; slots that cannot be filled without a conflict are listed as skipped, never forced.</p>
          <div className="form-grid">
            <label>Department
              <select value={genDept} onChange={(e) => setGenDept(e.target.value)} required>
                <option value="">Select department</option>
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name} ({d.code})</option>)}
              </select>
            </label>
            <label>Semester<input value={genSem} onChange={(e) => setGenSem(e.target.value)} required placeholder="5" type="number" min="1" max="8" /></label>
            <label>Section<input value={genSection} onChange={(e) => setGenSection(e.target.value)} placeholder="A" /></label>
          </div>
          {loadError && <div className="alert error">{loadError} <button type="button" className="btn btn-sm" onClick={loadDropdowns}>Retry</button></div>}
          {genError && <div className="alert error">{genError}</div>}
          {genNotice && <div className="alert success">{genNotice}</div>}
          <LeaveWarnings warnings={confirmWarnings} />
          <button className="btn btn-primary" disabled={genBusy}>{genBusy ? 'Working…' : 'Preview'}</button>
          {preview && (
            <div>
              <p><strong>{preview.generatedCount} entries generated</strong> for {preview.departmentName} — semester {preview.semester}, section {preview.section}. {preview.skippedCount > 0 && `${preview.skippedCount} slot(s) skipped (see below).`}</p>
              {preview.entries.length > 0 && (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Day</th><th>Subject</th><th>Faculty</th><th>Classroom</th><th>Time</th></tr></thead>
                  <tbody>
                    {preview.entries.map((r, i) => (
                      <tr key={i}>
                        <td>{r.day}</td><td>{r.subject}</td>
                        <td>{r.facultyName ? `${r.facultyName} (${r.facultyId})` : '—'}</td>
                        <td>{r.classroom}</td><td>{r.startTime} – {r.endTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
              <LeaveWarnings warnings={preview.leaveWarnings} />
              {preview.skipped.length > 0 && (
                <div className="alert warning">
                  <strong>Skipped slots (not saved):</strong>
                  <ul>
                    {preview.skipped.map((s, i) => <li key={i}>{s.day} {s.startTime}–{s.endTime}: {s.reason}</li>)}
                  </ul>
                </div>
              )}
              <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={genBusy || preview.entries.length === 0}>
                Confirm Save ({preview.entries.length} entries)
              </button>{' '}
              <button type="button" className="btn" onClick={() => setPreview(null)}>Discard preview</button>
            </div>
          )}
        </form>
      )}
      <div className="filter-row">
        <label>Day filter
          <select value={day} onChange={(e) => changeDay(e.target.value)}>
            <option value="">All days</option>
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label>Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subject, faculty or classroom" />
        </label>
        <div className="export-row">
          <button className="btn btn-primary" disabled={loading} onClick={() => handleExport('csv')}>Export CSV</button>{' '}
          <button className="btn btn-primary" disabled={loading} onClick={() => handleExport('pdf')}>Export PDF</button>
          <span className="muted small">Exports the rows currently shown{day ? ` (day: ${day})` : ' (all days)'}{q ? ` matching "${search.trim()}"` : ''}.</span>
        </div>
      </div>
      {exportError && <div className="alert error">{exportError}</div>}
      {loading ? <div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><span>Loading…</span></div> : filteredRows.length === 0 ? (
        <div className="empty-state"><p>No timetable entries found.</p></div>
      ) : (
        <div>
          <p className="muted small">{filteredRows.length} {filteredRows.length === 1 ? 'entry' : 'entries'}{day ? ` — ${day}` : ' — all days'}{q ? ` matching "${search.trim()}"` : ''}</p>
          <div className="table-wrap"><table className="table">
            <thead>
              <tr><th>Day</th><th>Subject</th><th>Faculty</th><th>Classroom</th><th>Time</th><th>Department</th><th>Sem / Sec</th>{canManage && <th></th>}</tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r._id}>
                  <td>{r.day}</td>
                  <td>{r.subject}</td>
                  <td>{r.faculty && r.faculty.user ? `${r.faculty.user.name} (${r.faculty.facultyId})` : '—'}</td>
                  <td>{r.classroom}</td>
                  <td>{r.startTime} – {r.endTime}</td>
                  <td>{r.department ? `${r.department.name} (${r.department.code})` : '—'}</td>
                  <td>{r.semester ?? '—'}{r.section ? ` / ${r.section}` : ''}</td>
                  {canManage && (
                    <td>
                      <button className="btn btn-sm" onClick={() => startEdit(r)}>Edit</button>{' '}
                      {pendingDelete === r._id ? (
                        <>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r._id)} disabled={deletingId === r._id} aria-label={`Delete ${r.subject}`}>{deletingId === r._id ? 'Deleting…' : 'Confirm delete?'}</button>{' '}
                          <button className="btn btn-sm" onClick={() => setPendingDelete(null)} disabled={deletingId === r._id}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r._id)} aria-label={`Delete ${r.subject}`}>Delete</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
      {canManage && (
        <div>
          <h2>Blocked Attempts</h2>
          {blocked.length === 0 ? (
            <div className="empty-state"><p>No blocked timetable attempts recorded.</p></div>
          ) : (
            <div>
              <p className="muted small">{blocked.length} blocked {blocked.length === 1 ? 'attempt' : 'attempts'}</p>
              <p className="muted small">Includes test/audit entries.</p>
              <div className="table-wrap"><table className="table">
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
              </table></div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
