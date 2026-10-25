import Timetable from '../models/Timetable.js';
import ConflictLog from '../models/ConflictLog.js';
import { normalizeClassroom, normalizeFacultyId } from './validation.js';

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
 * Classroom comparison is normalised (trim + uppercase) on both sides;
 * existing rows are NOT migrated, so a stored lowercase room still clashes.
 * Entries whose faculty reference is orphaned (populate returns null,
 * e.g. a faculty row deleted before delete-blocking existed) are NOT
 * allowed to throw: the faculty comparison is skipped for that row
 * (with a logged warning) but the classroom comparison still applies.
 * Returns the list of conflicting entries (empty = safe to save).
 */
export async function findConflicts(entry, excludeId = null) {
  const sameDay = await Timetable.find({ day: entry.day, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
    .populate('faculty', 'facultyId')
    .lean();
  const entryFaculty = normalizeFacultyId(entry.faculty);
  const entryRoom = normalizeClassroom(entry.classroom);
  return sameDay.filter((e) => {
    if (!e.faculty) {
      console.warn(`findConflicts: skipping faculty comparison for orphaned timetable entry ${e._id} (faculty reference is null)`);
    }
    const sharedFaculty = Boolean(e.faculty) && String(e.faculty._id) === entryFaculty;
    const sharedRoom = normalizeClassroom(e.classroom) === entryRoom;
    return overlaps(entry.startTime, entry.endTime, e.startTime, e.endTime) && (sharedFaculty || sharedRoom);
  });
}

export function describeConflict(entry, conflict) {
  const entryFaculty = normalizeFacultyId(entry.faculty);
  const entryRoom = normalizeClassroom(entry.classroom);
  const sharedFaculty = Boolean(conflict.faculty) && String(conflict.faculty._id) === entryFaculty;
  const sharedRoom = normalizeClassroom(conflict.classroom) === entryRoom;
  if (!conflict.faculty) {
    console.warn(`describeConflict: conflict entry ${conflict._id} has a null faculty reference`);
  }
  const why = [
    sharedFaculty ? `faculty ${conflict.faculty.facultyId} is already teaching` : null,
    sharedRoom ? `classroom ${conflict.classroom} is already booked` : null,
  ]
    .filter(Boolean)
    .join(' and ');
  if (!why) return `conflicts with an existing entry on ${conflict.day} ${conflict.startTime}-${conflict.endTime} (${conflict.subject})`;
  return `${why} on ${conflict.day} ${conflict.startTime}-${conflict.endTime} (${conflict.subject})`;
}

export async function logBlockedAttempt(entry, conflicts, attemptedBy, source = 'manual') {
  await ConflictLog.create({
    day: entry.day,
    subject: entry.subject,
    faculty: entry.faculty,
    classroom: normalizeClassroom(entry.classroom),
    startTime: entry.startTime,
    endTime: entry.endTime,
    conflictsWith: conflicts.map((c) => c._id).filter(Boolean),
    reason: conflicts.map((c) => describeConflict(entry, c)).join(' | '),
    attemptedBy: attemptedBy || null,
    source,
  });
}
