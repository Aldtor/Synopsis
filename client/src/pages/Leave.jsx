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
  const [applying, setApplying] = useState(false)
  // Review in flight, by leave id: both buttons for that row disable
  // while the PUT runs.
  const [reviewingId, setReviewingId] = useState(null)
  // Two-step reject confirmation, mirroring the delete pattern: first
  // click arms ("Confirm reject?" + Cancel), second click fires the
  // PUT. Reject is irreversible, so it no longer fires on one click.
  const [pendingReject, setPendingReject] = useState(null)

  function load(status) {
    setError('')
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
    // Client-side date-order check (the server also enforces it).
    if (form.fromDate && form.toDate && form.toDate < form.fromDate) {
      setError('To date must be on or after the from date.')
      return
    }
    setApplying(true)
    try {
      await api('/leaves', { method: 'POST', body: form })
      setForm(EMPTY)
      setNotice('Leave application submitted.')
      // Reset the filter to "All" and reload under it: a new
      // application is Pending, so under an "Approved"/"Rejected"
      // filter it would otherwise be invisible after submitting.
      setFilter('')
      load('')
    } catch (err) {
      setError(err.message)
    } finally {
      setApplying(false)
    }
  }

  async function handleReview(id, status) {
    setError('')
    setReviewingId(id)
    try {
      await api(`/leaves/${id}/review`, { method: 'PUT', body: { status, remarks: remarks[id] || '' } })
      setNotice(`Leave ${status.toLowerCase()}.`)
      setPendingReject(null)
      load(filter)
    } catch (err) {
      setError(err.message)
    } finally {
      setReviewingId(null)
    }
  }

  function handleRejectClick(id) {
    if (pendingReject !== id) {
      setPendingReject(id)
      return
    }
    handleReview(id, 'Rejected')
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
          <button className="btn btn-primary" disabled={applying}>{applying ? 'Saving…' : 'Submit Application'}</button>
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
      {loading ? <div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><span>Loading…</span></div> : rows.length === 0 ? (
        <div className="empty-state"><p>No leave requests found.</p></div>
      ) : (
        <div>
          <p className="muted small">{rows.length} leave {rows.length === 1 ? 'request' : 'requests'}{filter ? ` — ${filter}` : ' — all statuses'}</p>
          <div className="table-wrap"><table className="table">
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
                          <button className="btn btn-primary btn-sm" disabled={reviewingId === r._id} onClick={() => handleReview(r._id, 'Approved')}>{reviewingId === r._id ? 'Working…' : 'Approve'}</button>
                          {pendingReject === r._id ? (
                            <>
                              <button className="btn btn-danger btn-sm" disabled={reviewingId === r._id} onClick={() => handleRejectClick(r._id)}>{reviewingId === r._id ? 'Working…' : 'Confirm reject?'}</button>
                              <button className="btn btn-sm" disabled={reviewingId === r._id} onClick={() => setPendingReject(null)}>Cancel</button>
                            </>
                          ) : (
                            <button className="btn btn-danger btn-sm" disabled={reviewingId === r._id} onClick={() => handleRejectClick(r._id)}>Reject</button>
                          )}
                        </div>
                      ) : '—'}
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
