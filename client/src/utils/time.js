// Time-field helpers (Phase A polish).
//
// WHY THIS FILE EXISTS — the old time fields were native
// `<input type="time">` elements driven by React controlled state
// (`value={form.startTime}` + `onChange` writing `e.target.value` back).
// A native time picker holds a *partial* value while the user is still
// typing (e.g. hour typed, minutes still blank), but its DOM `value`
// property is "" until a complete, valid time exists. So every
// keystroke stored "" in state, React wrote "" back into the control,
// and the in-progress segment was wiped — the user could only get a
// value in by clicking each segment and completing it separately, and
// typing "09:30" straight through never survived.
//
// The fix is to stop fighting the native control: the fields are now
// plain text inputs whose onChange stores the keystrokes VERBATIM
// (no reformatting, no filtering on change, so React always writes
// back exactly what was typed and the caret never jumps). The string
// is only interpreted at two safe moments — on blur (normalise a
// complete value like "9:30" or "0930" to "09:30") and on submit
// (reject anything that is not a real time, without clearing the form).

// Normalise a user-typed time to strict "HH:MM" (24-hour), or null if
// it is not a complete, valid time. Accepted shapes:
//   "09:30", "9:30"  (1-2 digit hour, exactly 2 digit minutes)
//   "0930", "930"    (compact, no colon: last two digits are minutes)
// Deliberately rejected (ambiguous or out of range, never guessed):
//   "9:3" (09:03 or 09:30?), "24:00", "09:60", "9:30:00", letters,
//   empty / partial strings such as "09", "09:" — the user is still
//   typing those, so blur/submit leave them alone or report them.
export function normalizeTime(raw) {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  let hour
  let minute
  const colon = value.match(/^(\d{1,2}):(\d{2})$/)
  if (colon) {
    hour = Number(colon[1])
    minute = Number(colon[2])
  } else {
    const compact = value.match(/^(\d{3,4})$/)
    if (!compact) return null
    const digits = compact[1]
    hour = Number(digits.slice(0, -2))
    minute = Number(digits.slice(-2))
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function isValidTime(raw) {
  return normalizeTime(raw) !== null
}

// Minutes since midnight for a normalised "HH:MM" string. Used only
// for the client-side end-after-start check, mirroring the server.
export function timeToMinutes(normalised) {
  const [h, m] = normalised.split(':').map(Number)
  return h * 60 + m
}
