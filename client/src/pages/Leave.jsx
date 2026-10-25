import React, { useEffect, useState } from 'react'
import { api, getUser } from '../api.js'

const EMPTY = { type: 'Casual', fromDate: '', toDate: '', reason: '' }

export default function Leave() {
  const user = getUser()
  const isFaculty = user && user.role === 'faculty'
  const canReview = user && (user.role === 'admin' || user.role === 'hod')
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [remarks, setRemarks] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  function load(status) {
    setLoading(true)
    const q = status ? `?status=${status}` : ''
    api(`/leaves${q}`)
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load('') }, [])

  function changeFilter(s) {
    setFilter(s)
    load(s)
  }

  async function handleApply(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    try {
      await api('/leaves', { method: 'POST', body: form })
      setForm(EMPTY)
      setNotice('Leave application submitted.')
      load(filter)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleReview(id, status) {
    setError('')
    try {
      await api(`/leaves/${id}/review`, { method: 'PUT', body: { status, remarks: remarks[id] || '' } })
      setNotice(`Leave ${status.toLowerCase()}.`)
      load(filter)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>Leave Management</h1>
      {isFaculty && (
        <form onSubmit={handleApply} className="form card">
          <h2>Apply for Leave</h2>
          <div className="form-grid">
            <label>Type
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="Casual">Casual</option>
                <option value="Sick">Sick</option>
                <option value="Earned">Earned</option>
                <option value="Maternity">Maternity</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label>From<input type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} required /></label>
            <label>To<input type="date" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} required /></label>
            <label className="full">Reason<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required /></label>
          </div>
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}
          <button className="btn btn-primary">Submit Application</button>
        </form>
      )}
      <div className="filter-row">
        <label>Status filter
          <select value={filter} onChange={(e) => changeFilter(e.target.value)}>
            <option value="">All</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </label>
      </div>
      {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? (
        <p className="muted">No leave requests found.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Faculty</th><th>Type</th><th>From</th><th>To</th><th>Reason</th><th>Status</th><th>Remarks</th>{canReview && <th>Review</th>}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td>{r.faculty && r.faculty.user ? `${r.faculty.user.name} (${r.faculty.facultyId})` : '—'}</td>
                <td>{r.type}</td>
                <td>{r.fromDate ? r.fromDate.slice(0, 10) : '—'}</td>
                <td>{r.toDate ? r.toDate.slice(0, 10) : '—'}</td>
                <td>{r.reason}</td>
                <td><span className={`badge badge-${(r.status || '').toLowerCase()}`}>{r.status}</span></td>
                <td>{r.remarks || '—'}</td>
                {canReview && (
                  <td>
                    {r.status === 'Pending' ? (
                      <div className="review-box">
                        <input
                          placeholder="Remarks"
                          value={remarks[r._id] || ''}
                          onChange={(e) => setRemarks({ ...remarks, [r._id]: e.target.value })}
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => handleReview(r._id, 'Approved')}>Approve</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleReview(r._id, 'Rejected')}>Reject</button>
                      </div>
                    ) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
