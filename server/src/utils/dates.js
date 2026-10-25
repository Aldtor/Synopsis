// IST day boundaries. Asia/Kolkata is UTC+5:30 year-round (no DST),
// so IST midnight is a fixed UTC instant: 18:30 UTC on the previous day.
// Stored dates are UTC instants; these helpers convert between a stored
// instant and the IST calendar date it falls on, so "today", attendance
// day windows and chart buckets are consistent no matter what timezone
// the server process runs in (Vercel runs on UTC).
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** IST calendar parts { year, month (1-12), day } for a stored instant. */
export function istParts(date = new Date()) {
  const shifted = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** 'YYYY-MM-DD' key of the IST calendar date an instant falls on. */
export function istDateKey(date = new Date()) {
  const p = istParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** UTC instant of IST midnight at the start of the IST date containing `date`. */
export function istDayStart(date = new Date()) {
  const p = istParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - IST_OFFSET_MS);
}

/** Half-open IST day window [start, end) for the IST date containing `date`. */
export function istDayWindow(date = new Date()) {
  const start = istDayStart(date);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Half-open window for "today" in IST. */
export function istTodayWindow() {
  return istDayWindow(new Date());
}

/**
 * Last `n` IST calendar days ending today (IST), oldest first.
 * Each item: { key ('YYYY-MM-DD'), label ('25 Oct'), start, end } where
 * start/end are the half-open UTC instants of that IST day.
 */
export function istLastNDays(n = 14) {
  const today = istParts(new Date());
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const utc = new Date(todayUtc - i * 24 * 60 * 60 * 1000);
    const p = { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
    const start = new Date(Date.UTC(p.year, p.month - 1, p.day) - IST_OFFSET_MS);
    days.push({
      key: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
      label: `${String(p.day).padStart(2, '0')} ${MONTH_SHORT[p.month - 1]}`,
      start,
      end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
    });
  }
  return days;
}

/**
 * Overlap window for generation leave warnings: [IST today, IST today+14 days].
 * Returns { start, end } where end is the end of the 14th day (inclusive
 * window, for $lte comparisons against stored leave dates).
 */
export function istNext14DaysWindow() {
  const { start } = istTodayWindow();
  const endDayStart = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  return { start, end: new Date(endDayStart.getTime() + 24 * 60 * 60 * 1000 - 1) };
}
