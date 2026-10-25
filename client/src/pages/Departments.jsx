import React, { useEffect, useState } from 'react'
import { api, getUser } from '../api.js'
import RequireRole from '../components/RequireRole.jsx'

export default function Departments() {
  const user = getUser()
  const isAdmin = user && user.role === 'admin'
  const [list, setList] = useState([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  // Two-step in-app delete confirmation (see Faculty.jsx): first click
  // arms the row's button, second click fires the DELETE call. No
  // native browser confirm dialog anywhere in the client.
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  function load() {
    setError('')
    setLoading(true)
    api('/departments')
      .then(setList)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  function startEdit(d) {
    setError('')
    setNotice('')
    setEditingId(d._id)
    setName(d.name || '')
    setCode(d.code || '')
  }

  function cancelEdit() {
    setEditingId(null)
    setName('')
    setCode('')
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    // Normalise the code: trimmed and uppercased, so " cse " and "cse"
    // do not become distinct codes.
    const payload = { name: name.trim(), code: code.trim().toUpperCase() }
    setSaving(true)
    try {
      if (editingId) {
        await api(`/departments/${editingId}`, { method: 'PUT', body: payload })
        setNotice('Department updated.')
        cancelEdit()
      } else {
        await api('/departments', { method: 'POST', body: payload })
        setName('')
        setCode('')
        setNotice('Department added.')
      }
      load()
    } catch (err) {
      setError(err.message)
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
      await api(`/departments/${id}`, { method: 'DELETE' })
      setNotice('Department deleted.')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setPendingDelete(null)
      setDeletingId(null)
    }
  }

  return (
    <div>
      <h1>Departments</h1>
      <RequireRole roles={['admin']} fallback={<p className="muted small">Only admins can add or edit departments.</p>}>
        <form onSubmit={handleSubmit} className="form card">
          <h2>{editingId ? 'Edit Department' : 'Add Department'}</h2>
          <div className="form-grid">
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label>Code<input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="CSE" /></label>
          </div>
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Department'}</button>
          {editingId && <>{' '}<button type="button" className="btn" onClick={cancelEdit} disabled={saving}>Cancel</button></>}
        </form>
      </RequireRole>
      {/* Non-admin load error sits ABOVE the table, as Faculty does —
          previously it rendered below the table where it was missed. */}
      {!isAdmin && error && <div className="alert error">{error}</div>}
      {loading ? <div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><span>Loading…</span></div> : (
        <div>
          <p className="muted small">{list.length} {list.length === 1 ? 'department' : 'departments'}</p>
          <div className="table-wrap"><table className="table">
            <thead>
              <tr><th>Name</th><th>Code</th><th>HOD</th><th>Faculty Count</th>{isAdmin && <th></th>}</tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d._id}>
                  <td>{d.name}</td>
                  <td>{d.code}</td>
                  <td>{d.hod ? `${d.hod.name} (${d.hod.email})` : '—'}</td>
                  <td>{d.facultyCount ?? 0}</td>
                  {isAdmin && (
                    <td>
                      <button className="btn btn-sm" onClick={() => startEdit(d)}>Edit</button>{' '}
                      {pendingDelete === d._id ? (
                        <>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d._id)} disabled={deletingId === d._id} aria-label={`Delete ${d.name}`}>{deletingId === d._id ? 'Deleting…' : 'Confirm delete?'}</button>{' '}
                          <button className="btn btn-sm" onClick={() => setPendingDelete(null)} disabled={deletingId === d._id}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d._id)} aria-label={`Delete ${d.name}`}>Delete</button>
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
