import React from 'react'
import { getUser } from '../api.js'

// Defence in depth ONLY (auth F14, frontend part): the backend's
// requireRole checks remain the real enforcement — this wrapper just
// keeps an admin-only section from rendering if the stored user object
// somehow disagrees with the server. It is deliberately NOT used to
// gate whole pages: no page in this app is admin-only (Faculty,
// Departments and Timetable lists are viewable by every role, with only
// their add/edit/delete actions restricted), so wrapping a route in it
// would break legitimate navigation for hod/faculty users. It is used
// around the admin-only add/edit forms, where the fallback renders a
// short explanatory note instead of the form.
export default function RequireRole({ roles, fallback = null, children }) {
  const user = getUser()
  if (!user || !roles.includes(user.role)) return fallback
  return children
}
