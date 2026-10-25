import Timetable from '../models/Timetable.js';
import ConflictLog from '../models/ConflictLog.js';

/** "HH:MM" -> minutes since midnight. */
export function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Half-open interval overlap: [startA, endA) overlaps [startB, endB). */
export function overlaps(startA, endA, startB, endB) {
  return toMinutes(startA) < toMinutes(endB) && toMinutes(startB) < toMinutes(endA);
}

/**
 * Rule-based conflict detection (the project's key feature).
 * A new entry conflicts with an existing entry on the same day when their
 * time intervals overlap AND they share the faculty member OR the classroom.
 * Returns the list of conflicting entries (empty = safe to save).
 */
export async function findConflicts(entry, excludeId = null) {
  const sameDay = await Timetable.find({ day: entry.day, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
    .populate('faculty', 'facultyId')
    .lean();
  return sameDay.filter(
    (e) =>
      overlaps(entry.startTime, entry.endTime, e.startTime, e.endTime) &&
      (String(e.faculty._id) === String(entry.faculty) || e.classroom === entry.classroom)
  );
}

export function describeConflict(entry, conflict) {
  const sharedFaculty = String(conflict.faculty._id) === String(entry.faculty);
  const sharedRoom = conflict.classroom === entry.classroom;
  const why = [
    sharedFaculty ? `faculty ${conflict.faculty.facultyId} is already teaching` : null,
    sharedRoom ? `classroom ${conflict.classroom} is already booked` : null,
  ]
    .filter(Boolean)
    .join(' and ');
  return `${why} on ${conflict.day} ${conflict.startTime}-${conflict.endTime} (${conflict.subject})`;
}

export async function logBlockedAttempt(entry, conflicts, attemptedBy) {
  await ConflictLog.create({
    day: entry.day,
    subject: entry.subject,
    faculty: entry.faculty,
    classroom: entry.classroom,
    startTime: entry.startTime,
    endTime: entry.endTime,
    conflictsWith: conflicts.map((c) => c._id),
    reason: conflicts.map((c) => describeConflict(entry, c)).join(' | '),
    attemptedBy: attemptedBy || null,
  });
}
