// Auto timetable generation — PURE functions (no database, no Mongoose).
// Both the preview endpoint and the confirm endpoint reuse this logic,
// and it is directly unit-testable against fixture data (see the logic
// test evidence in the Phase A report).
//
// Conflict rule (identical to utils/conflict.js): two entries conflict
// when they are on the same day, their half-open time intervals overlap,
// AND they share the faculty member OR the classroom. A candidate is
// checked against (a) existing timetable entries and (b) candidates
// already accepted in the same batch, so a generated batch is
// conflict-free by construction. A slot that cannot be filled without
// a conflict is SKIPPED with a reason — never forced.

import { overlaps } from './conflict.js';
import { normalizeClassroom, normalizeFacultyId } from './validation.js';

export const GENERATOR_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const GENERATOR_SLOTS = [
  ['09:00', '10:00'],
  ['10:00', '11:00'],
  ['11:00', '12:00'],
  ['12:00', '13:00'],
  ['14:00', '15:00'],
  ['15:00', '16:00'],
];
export const GENERATOR_ROOMS = [
  'LT-101', 'LT-102', 'LT-103', 'LT-104', 'LT-105', 'LT-106', 'LT-107', 'LT-108', 'LAB-1', 'LAB-2',
];

/**
 * Shape of each entry in `existing` / each accepted candidate:
 *   { day, startTime, endTime, faculty, classroom,
 *     department?, semester?, section?, subject? }
 * `facultyList` items: { _id, facultyId?, name?, subjects? }.
 * Returns { entries, skipped } where skipped items carry a reason.
 * Bounded: one department + semester + section per run, at most
 * days.length * slots.length candidates (30 with the defaults).
 */
export function buildSchedule({
  facultyList = [],
  existing = [],
  department,
  semester,
  section = 'A',
  days = GENERATOR_DAYS,
  slots = GENERATOR_SLOTS,
  rooms = GENERATOR_ROOMS,
}) {
  const entries = [];
  const skipped = [];
  const norm = (e) => ({
    day: e.day,
    startTime: e.startTime,
    endTime: e.endTime,
    faculty: normalizeFacultyId(e.faculty),
    classroom: normalizeClassroom(e.classroom),
    // Kept for the already-scheduled check below (not needed for clashes).
    department: e.department !== undefined ? String(e.department?._id ?? e.department) : undefined,
    semester: e.semester,
    section: e.section,
    subject: e.subject,
  });
  const pool = existing.map(norm);

  const clashesWith = (candidate, list) =>
    list.filter(
      (e) =>
        e.day === candidate.day &&
        overlaps(candidate.startTime, candidate.endTime, e.startTime, e.endTime) &&
        (e.faculty === candidate.faculty || e.classroom === candidate.classroom)
    );

  days.forEach((day, dayIdx) => {
    slots.forEach(([startTime, endTime]) => {
      // The class itself is already scheduled in this slot: do not double-book it.
      const alreadyScheduled = pool.find(
        (e) =>
          e.day === day &&
          overlaps(startTime, endTime, e.startTime, e.endTime) &&
          String(e.department ?? '') === String(department ?? '') &&
          Number(e.semester) === Number(semester) &&
          String(e.section ?? 'A') === String(section)
      );
      if (alreadyScheduled) {
        skipped.push({
          day, startTime, endTime,
          reason: `Already scheduled: ${alreadyScheduled.subject || 'a class'} ${alreadyScheduled.startTime}-${alreadyScheduled.endTime}`,
        });
        return;
      }
      if (facultyList.length === 0) {
        skipped.push({ day, startTime, endTime, reason: 'No faculty in this department' });
        return;
      }
      // Rotate the faculty order per day/slot so subjects vary across the week.
      const rotated = facultyList.map((_, i) => facultyList[(dayIdx + i) % facultyList.length]);
      let chosen = null;
      for (const fac of rotated) {
        // Try rooms in order; the first room free for this faculty wins.
        for (const classroom of rooms) {
          const candidate = {
            day, startTime, endTime, classroom: normalizeClassroom(classroom),
            faculty: String(fac._id),
          };
          if (clashesWith(candidate, pool).length === 0 && clashesWith(candidate, entries.map(norm)).length === 0) {
            chosen = {
              day,
              subject: (fac.subjects && fac.subjects[0]) || 'Lecture',
              faculty: String(fac._id),
              facultyId: fac.facultyId || '',
              facultyName: fac.name || '',
              classroom: normalizeClassroom(classroom),
              startTime,
              endTime,
              department,
              semester: Number(semester),
              section,
            };
            break;
          }
        }
        if (chosen) break;
      }
      if (chosen) entries.push(chosen);
      else {
        skipped.push({
          day, startTime, endTime,
          reason: 'No faculty member and classroom free at this time — every candidate conflicted with an existing entry',
        });
      }
    });
  });
  return { entries, skipped };
}

/**
 * Re-validate a previewed payload before saving (confirm endpoint).
 * Returns { accepted, skipped } — conflicting entries are dropped with
 * a reason, never inserted. `existing` is re-read from the DB at confirm
 * time, so entries created after the preview are still caught.
 *
 * Normalisation (finding 3): accepted entries are stored NORMALISED
 * (faculty as a plain string id, classroom trimmed + uppercased), the
 * same way candidates are normalised, and both clash checks compare
 * normalised-to-normalised. Previously an accepted entry kept a
 * populated faculty object, so String(object) never matched the next
 * candidate's id and a same-faculty clash inside the batch slipped
 * through. Skipped entries carry conflictsWith (DB entry ids, where
 * known) so the caller can audit-log generator drops.
 */
export function validateBatch({ entries = [], existing = [] }) {
  const accepted = [];
  const skipped = [];
  const pool = existing.map((e) => ({
    _id: e._id,
    day: e.day, startTime: e.startTime, endTime: e.endTime,
    faculty: normalizeFacultyId(e.faculty), classroom: normalizeClassroom(e.classroom),
  }));
  for (const raw of entries) {
    const candidate = {
      day: raw.day, startTime: raw.startTime, endTime: raw.endTime,
      faculty: normalizeFacultyId(raw.faculty), classroom: normalizeClassroom(raw.classroom),
    };
    const clashes = pool.filter(
      (e) =>
        e.day === candidate.day &&
        overlaps(candidate.startTime, candidate.endTime, e.startTime, e.endTime) &&
        (e.faculty === candidate.faculty || e.classroom === candidate.classroom)
    );
    const batchClashes = accepted.filter(
      (e) =>
        e.day === candidate.day &&
        overlaps(candidate.startTime, candidate.endTime, e.startTime, e.endTime) &&
        (e.faculty === candidate.faculty || e.classroom === candidate.classroom)
    );
    if (clashes.length > 0 || batchClashes.length > 0) {
      skipped.push({
        ...raw,
        faculty: candidate.faculty,
        classroom: candidate.classroom,
        conflictsWith: clashes.map((c) => c._id).filter(Boolean),
        reason: 'Conflict with an existing entry (or an earlier entry in this batch) — not saved',
      });
    } else {
      // Store the normalised form, so the next iteration's batch check
      // compares normalised-to-normalised (see header comment).
      accepted.push({ ...raw, faculty: candidate.faculty, classroom: candidate.classroom });
    }
  }
  return { accepted, skipped };
}
