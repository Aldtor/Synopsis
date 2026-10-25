import React, { useEffect, useState } from 'react'
import { api, getUser } from '../api.js'

export default function Departments() {
  const user = getUser()
  const isAdmin = user && user.role === 'admin'
  const [list, setList] = useState([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    api('/departments')
      .then(setList)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleAdd(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    try {
      await api('/departments', { method: 'POST', body: { name, code } })
      setName('')
      setCode('')
      setNotice('Department added.')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this department?')) return
    try {
      await api(`/departments/${id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>Departments</h1>
      {isAdmin && (
        <form onSubmit={handleAdd} className="form card">
          <h2>Add Department</h2>
          <div className="form-grid">
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label>Code<input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="CSE" /></label>
          </div>
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}
          <button className="btn btn-primary">Add Department</button>
        </form>
      )}
      {loading ? <div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><span>Loading…</span></div> : (
        <table className="table">
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
                {isAdmin && <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(d._id)}>Delete</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!isAdmin && error && <div className="alert error">{error}</div>}
    </div>
  )
}
