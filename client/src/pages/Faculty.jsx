import React, { useEffect, useState } from 'react'
import { api, getUser } from '../api.js'
import RequireRole from '../components/RequireRole.jsx'

const EMPTY = { name: '', email: '', password: '', facultyId: '', department: '', designation: '', qualification: '', phone: '', subjects: '' }
const DESIGNATIONS = ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer']
// No minimum-length rule exists in the server User model (read-only
// check: password is `required` only, and the create route defaults an
// empty password to 'password123'), so the client mirrors a 6-character
// floor for newly typed passwords and reports that choice here.
const NEW_PASSWORD_MIN_LENGTH = 6

export default function Faculty() {
  const user = getUser()
  const isAdmin = user && user.role === 'admin'
  const [list, setList] = useState([])
  const [departments, setDepartments] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [deptsLoading, setDeptsLoading] = useState(true)
  const [deptsError, setDeptsError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  // Two-step in-app delete confirmation: first click arms this row's
  // button, second click fires the DELETE call. No native browser confirm dialog, which
  // auto-dismisses (returning false) in automated browsers and silently
  // swallowed deletes. Cancel (or arming another row) resets it.
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  function load() {
    setError('')
    setLoading(true)
    api('/faculty')
      .then(setList)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  function loadDepts() {
    setDeptsError('')
    setDeptsLoading(true)
    api('/departments')
      .then(setDepartments)
      .catch((err) => setDeptsError(err.message))
      .finally(() => setDeptsLoading(false))
  }

  useEffect(() => {
    load()
    loadDepts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startEdit(f) {
    setError('')
    setNotice('')
    setEditingId(f._id)
    setForm({
      name: f.user ? f.user.name : '',
      email: f.user ? f.user.email : '',
      password: '',
      facultyId: f.facultyId || '',
      department: f.department ? f.department._id : '',
      designation: f.designation || '',
      qualification: f.qualification || '',
      phone: f.phone || '',
      subjects: (f.subjects || []).join(', ')
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    // Client-side password floor for NEW faculty only (see constant
    // above). Edits never send a password: the server PUT accepts only
    // designation, qualification, phone, subjects, department and
    // joiningDate, and ignores name/email/facultyId/password.
    if (!editingId && form.password.length < NEW_PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${NEW_PASSWORD_MIN_LENGTH} characters.`)
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await api(`/faculty/${editingId}`, {
          method: 'PUT',
          body: {
            designation: form.designation,
            qualification: form.qualification,
            phone: form.phone,
            subjects: form.subjects.split(',').map((s) => s.trim()).filter(Boolean),
            department: form.department
          }
        })
        setNotice('Faculty member updated.')
        cancelEdit()
      } else {
        await api('/faculty', {
          method: 'POST',
          body: { ...form, subjects: form.subjects.split(',').map((s) => s.trim()).filter(Boolean) }
        })
        setForm(EMPTY)
        setNotice('Faculty member added.')
      }
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    // First click arms, second click deletes (see pendingDelete above).
    if (pendingDelete !== id) {
      setError('')
      setNotice('')
      setPendingDelete(id)
      return
    }
    // Do NOT clear pendingDelete before the await: clearing it first
    // re-arms the button mid-flight, so a second click during the
    // request would arm instead of delete (and a double-click could
    // delete, re-arm and delete again). It is cleared in `finally`.
    setDeletingId(id)
    try {
      await api(`/faculty/${id}`, { method: 'DELETE' })
      setNotice('Faculty member deleted.')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setPendingDelete(null)
      setDeletingId(null)
    }
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? list.filter((f) => (f.user ? f.user.name : '').toLowerCase().includes(q) || (f.facultyId || '').toLowerCase().includes(q))
    : list

  return (
    <div>
      <h1>Faculty</h1>
      <RequireRole roles={['admin']} fallback={<p className="muted small">Only admins can add or edit faculty members.</p>}>
        <form onSubmit={handleSubmit} className="form card">
          <h2>{editingId ? 'Edit Faculty Member' : 'Add Faculty Member'}</h2>
          <div className="form-grid">
            <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required disabled={!!editingId} title={editingId ? 'Name cannot be changed here — the server ignores it on update.' : ''} /></label>
            <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!editingId} title={editingId ? 'Email cannot be changed here — the server ignores it on update.' : ''} /></label>
            {!editingId && <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>}
            <label>Faculty ID<input value={form.facultyId} onChange={(e) => setForm({ ...form, facultyId: e.target.value })} required disabled={!!editingId} title={editingId ? 'Faculty ID cannot be changed here — the server ignores it on update.' : ''} /></label>
            <label>Department
              <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required>
                {deptsLoading
                  ? <option value="" disabled>Loading…</option>
                  : <option value="">Select department</option>}
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name} ({d.code})</option>)}
              </select>
            </label>
            <label>Designation
              <select value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} required>
                <option value="">Select designation</option>
                {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>Qualification<input value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} /></label>
            <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="full">Subjects (comma separated)<input value={form.subjects} onChange={(e) => setForm({ ...form, subjects: e.target.value })} placeholder="Data Structures, DBMS" /></label>
          </div>
          {deptsError && <div className="alert error">Could not load departments: {deptsError} <button type="button" className="btn btn-sm" onClick={loadDepts}>Retry</button></div>}
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Faculty'}</button>
          {editingId && <>{' '}<button type="button" className="btn" onClick={cancelEdit} disabled={saving}>Cancel</button></>}
        </form>
      </RequireRole>
      {!isAdmin && error && <div className="alert error">{error}</div>}
      <div className="filter-row">
        <label>Search faculty
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or faculty ID" />
        </label>
      </div>
      {loading ? <div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><span>Loading…</span></div> : (
        <div>
          <p className="muted small">{filtered.length} faculty {filtered.length === 1 ? 'member' : 'members'}{q ? ` matching "${search.trim()}"` : ''}</p>
          <div className="table-wrap"><table className="table">
            <thead>
              <tr><th>Faculty ID</th><th>Name</th><th>Department</th><th>Designation</th><th>Qualification</th><th>Subjects</th>{isAdmin && <th></th>}</tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f._id}>
                  <td>{f.facultyId}</td>
                  <td>{f.user ? f.user.name : '—'}<div className="small muted">{f.user ? f.user.email : ''}</div></td>
                  <td>{f.department ? `${f.department.name} (${f.department.code})` : '—'}</td>
                  <td>{f.designation || '—'}</td>
                  <td>{f.qualification || '—'}</td>
                  <td>{(f.subjects || []).join(', ') || '—'}</td>
                  {isAdmin && (
                    <td>
                      <button className="btn btn-sm" onClick={() => startEdit(f)}>Edit</button>{' '}
                      {pendingDelete === f._id ? (
                        <>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(f._id)} disabled={deletingId === f._id} aria-label={`Delete ${f.user ? f.user.name : f.facultyId}`}>{deletingId === f._id ? 'Deleting…' : 'Confirm delete?'}</button>{' '}
                          <button className="btn btn-sm" onClick={() => setPendingDelete(null)} disabled={deletingId === f._id}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(f._id)} aria-label={`Delete ${f.user ? f.user.name : f.facultyId}`}>Delete</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  )
}
