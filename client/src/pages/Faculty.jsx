import React, { useEffect, useState } from 'react'
import { api, getUser } from '../api.js'

const EMPTY = { name: '', email: '', password: '', facultyId: '', department: '', designation: '', qualification: '', phone: '', subjects: '' }

export default function Faculty() {
  const user = getUser()
  const isAdmin = user && user.role === 'admin'
  const [list, setList] = useState([])
  const [departments, setDepartments] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    api('/faculty')
      .then(setList)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    api('/departments').then(setDepartments).catch(() => {})
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    const payload = {
      ...form,
      subjects: form.subjects.split(',').map((s) => s.trim()).filter(Boolean)
    }
    try {
      await api('/faculty', { method: 'POST', body: payload })
      setForm(EMPTY)
      setNotice('Faculty member added.')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this faculty member?')) return
    try {
      await api(`/faculty/${id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>Faculty</h1>
      {isAdmin && (
        <form onSubmit={handleAdd} className="form card">
          <h2>Add Faculty Member</h2>
          <div className="form-grid">
            <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
            <label>Faculty ID<input value={form.facultyId} onChange={(e) => setForm({ ...form, facultyId: e.target.value })} required /></label>
            <label>Department
              <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required>
                <option value="">Select department</option>
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name} ({d.code})</option>)}
              </select>
            </label>
            <label>Designation<input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></label>
            <label>Qualification<input value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} /></label>
            <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="full">Subjects (comma separated)<input value={form.subjects} onChange={(e) => setForm({ ...form, subjects: e.target.value })} placeholder="Data Structures, DBMS" /></label>
          </div>
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}
          <button className="btn btn-primary">Add Faculty</button>
        </form>
      )}
      {loading ? <div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><span>Loading…</span></div> : (
        <table className="table">
          <thead>
            <tr><th>Faculty ID</th><th>Name</th><th>Department</th><th>Designation</th><th>Qualification</th><th>Subjects</th>{isAdmin && <th></th>}</tr>
          </thead>
          <tbody>
            {list.map((f) => (
              <tr key={f._id}>
                <td>{f.facultyId}</td>
                <td>{f.user ? f.user.name : '—'}<div className="small muted">{f.user ? f.user.email : ''}</div></td>
                <td>{f.department ? `${f.department.name} (${f.department.code})` : '—'}</td>
                <td>{f.designation || '—'}</td>
                <td>{f.qualification || '—'}</td>
                <td>{(f.subjects || []).join(', ') || '—'}</td>
                {isAdmin && <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(f._id)}>Delete</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!isAdmin && error && <div className="alert error">{error}</div>}
    </div>
  )
}
