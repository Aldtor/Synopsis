import express from 'express';
import Timetable from '../models/Timetable.js';
import ConflictLog from '../models/ConflictLog.js';
import Department from '../models/Department.js';
import Faculty from '../models/Faculty.js';
import Leave from '../models/Leave.js';
import { protect, requireRole } from '../middleware/auth.js';
import { findConflicts, describeConflict, logBlockedAttempt, toMinutes, overlaps } from '../utils/conflict.js';
import { buildSchedule, validateBatch, GENERATOR_DAYS } from '../utils/generate.js';
import { handleRouteError, normalizeClassroom, normalizeFacultyId } from '../utils/validation.js';
import { istNext14DaysWindow } from '../utils/dates.js';

const router = express.Router();
router.use(protect);

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIMETABLE_FIELDS = ['day', 'subject', 'faculty', 'classroom', 'startTime', 'endTime', 'department', 'semester', 'section'];
const pickFields = (body, fields) => Object.fromEntries(Object.entries(body || {}).filter(([k]) => fields.includes(k)));

const populate = (q) =>
  q.populate({ path: 'faculty', select: 'facultyId', populate: { path: 'user', select: 'name' } })
    .populate('department', 'name code');

// HODs may only touch entries in their own department (F1).
function hodScopeForbidden(req, departmentId) {
  return req.user.role === 'hod' && String(req.user.department) !== String(departmentId);
}

router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.day) filter.day = req.query.day;
  if (req.query.department) filter.department = req.query.department;
  if (req.query.faculty) filter.faculty = req.query.faculty;
  if (req.user.role === 'hod') filter.department = req.user.department;
  // F7 (leader decision, pending parent confirmation): faculty users
  // reading the full timetable stays as-is — shared schedule policy.
  // Deliberately NOT scoped here; do not "fix" without that decision.
  const rows = await populate(Timetable.find(filter).sort({ day: 1, startTime: 1 }));
  res.json(rows);
});

// Recently blocked timetable entries (proof the detector works).
// F3/F4: HODs see only blocks for faculty in their own department
// (ConflictLog has no department field, so scope via Faculty ids);
// admins keep the global view.
router.get('/conflicts-log', requireRole('admin', 'hod'), async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'hod') {
      const ids = await Faculty.find({ department: req.user.department }).select('_id').lean();
      filter.faculty = { $in: ids.map((f) => f._id) };
    }
    const rows = await ConflictLog.find(filter)
      .populate({ path: 'faculty', select: 'facultyId', populate: { path: 'user', select: 'name' } })
      .populate('conflictsWith', 'subject day startTime endTime classroom')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(rows);
  } catch (err) {
    handleRouteError(res, err);
  }
});

async function validateAndCheck(req, res, entry, excludeId) {
  if (entry.classroom != null) entry.classroom = normalizeClassroom(entry.classroom);
  if (!TIME_RE.test(entry.startTime || '') || !TIME_RE.test(entry.endTime || '')) {
    return res.status(400).json({ message: 'Start and end times must be in HH:MM format' });
  }
  if (toMinutes(entry.endTime) <= toMinutes(entry.startTime)) {
    return res.status(400).json({ message: 'endTime must be after startTime' });
  }
  const conflicts = await findConflicts(entry, excludeId);
  if (conflicts.length > 0) {
    // A ConflictLog write failure must NOT mask the 409: log best-effort.
    try {
      await logBlockedAttempt(entry, conflicts, req.user._id, 'manual');
    } catch (logErr) {
      console.error('Failed to log blocked timetable attempt:', logErr);
    }
    return res.status(409).json({
      message: 'Timetable conflict detected — entry was NOT saved',
      conflicts: conflicts.map((c) => ({
        id: c._id,
        subject: c.subject,
        day: c.day,
        startTime: c.startTime,
        endTime: c.endTime,
        classroom: c.classroom,
        faculty: c.faculty,
        detail: describeConflict(entry, c),
      })),
    });
  }
  return null;
}

// Look up Faculty and Department for a manual write: 404 for missing
// ids, 400 when the faculty does not belong to the entry department.
// Returns { faculty, dept } or { error } (response already sent).
async function verifyFacultyAndDepartment(req, res, facultyId, departmentId) {
  let faculty = null;
  let dept = null;
  if (facultyId) {
    faculty = await Faculty.findById(facultyId);
    if (!faculty) return { error: res.status(404).json({ message: 'Faculty not found' }) };
  }
  if (departmentId) {
    dept = await Department.findById(departmentId);
    if (!dept) return { error: res.status(404).json({ message: 'Department not found' }) };
  }
  if (faculty && dept && String(faculty.department) !== String(dept._id)) {
    return { error: res.status(400).json({ message: 'Faculty does not belong to this department' }) };
  }
  return { faculty, dept };
}

// ---- Auto timetable generation (admin / HOD only) ----
// Bounded to one department + semester + section per run (max 30
// candidates with the default Mon–Fri x 6-slot grid), so it stays fast
// under Vercel serverless time limits. Preview NEVER writes; confirm
// saves exactly the previewed payload, re-validated against the live DB.
// HODs may only generate for their own department.

// Shared validation for both generation endpoints.
async function generationContext(req, res) {
  const { department, semester, section = 'A' } = req.body || {};
  if (!department) return { error: res.status(400).json({ message: 'department is required' }) };
  const sem = Number(semester);
  if (!Number.isInteger(sem) || sem < 1 || sem > 8) {
    return { error: res.status(400).json({ message: 'semester must be an integer between 1 and 8' }) };
  }
  if (req.user.role === 'hod' && String(req.user.department) !== String(department)) {
    return { error: res.status(403).json({ message: 'HODs may only generate timetables for their own department' }) };
  }
  const dept = await Department.findById(department);
  if (!dept) return { error: res.status(404).json({ message: 'Department not found' }) };
  const facultyDocs = await Faculty.find({ department })
    .populate('user', 'name')
    .sort({ facultyId: 1 })
    .lean();
  return {
    department: String(dept._id),
    departmentName: dept.name,
    departmentCode: dept.code,
    semester: sem,
    section: String(section || 'A'),
    facultyList: facultyDocs.map((f) => ({
      _id: String(f._id),
      facultyId: f.facultyId,
      name: f.user ? f.user.name : '',
      subjects: f.subjects || [],
    })),
  };
}

// Generation leave warnings — WARNING-ONLY, NOT leave-aware (finding 4).
// Lists faculty in this department with an Approved leave overlapping
// [IST today, IST today+14 days]. Dated leaves do not map 1:1 onto
// weekday timetable slots, so nobody is excluded from generation on
// the basis of a warning; the caller decides what to do with it.
// Manual timetable writes are unchanged by leave status.
async function leaveWarningsForFaculty(facultyList) {
  if (!facultyList || facultyList.length === 0) return [];
  const { start, end } = istNext14DaysWindow();
  const ids = facultyList.map((f) => f._id);
  const leaves = await Leave.find({
    faculty: { $in: ids },
    status: 'Approved',
    fromDate: { $lte: end },
    toDate: { $gte: start },
  })
    .populate({ path: 'faculty', select: 'facultyId', populate: { path: 'user', select: 'name' } })
    .lean();
  return leaves.map((l) => ({
    faculty: String(l.faculty?._id || l.faculty),
    facultyId: l.faculty?.facultyId || '',
    name: l.faculty?.user?.name || '',
    type: l.type,
    fromDate: l.fromDate,
    toDate: l.toDate,
    status: l.status,
  }));
}

// POST /api/timetable/generate-preview — no writes.
router.post('/generate-preview', requireRole('admin', 'hod'), async (req, res) => {
  try {
    const ctx = await generationContext(req, res);
    if (ctx.error) return ctx.error;
    const existing = await Timetable.find({}).lean();
    const { entries, skipped } = buildSchedule({
      facultyList: ctx.facultyList,
      existing: existing.map((e) => ({
        ...e,
        department: String(e.department),
        faculty: String(e.faculty),
      })),
      department: ctx.department,
      semester: ctx.semester,
      section: ctx.section,
    });
    res.json({
      department: ctx.department,
      departmentName: ctx.departmentName,
      departmentCode: ctx.departmentCode,
      semester: ctx.semester,
      section: ctx.section,
      entries,
      skipped,
      generatedCount: entries.length,
      skippedCount: skipped.length,
      leaveWarnings: await leaveWarningsForFaculty(ctx.facultyList),
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// POST /api/timetable/generate-confirm — saves exactly the previewed
// payload (body: { department, semester, section, entries: [...] }).
// Full pre-validation runs BEFORE any insert, so one bad entry rejects
// the whole batch (400) and cannot leave earlier entries saved:
// day must be on the Mon–Fri grid, subject/classroom non-empty, times
// valid and end-after-start, faculty in the previewed department, and
// the already-scheduled rule (no entry overlapping an existing entry
// for the same department+semester+section). Conflicting entries are
// a separate, intended path: they are dropped with a reason (and now
// audit-logged with source 'generator'), never inserted.
// A preview-token system was NOT built (out of scope); it remains a
// future option for binding confirm to a specific preview.
router.post('/generate-confirm', requireRole('admin', 'hod'), async (req, res) => {
  try {
    const ctx = await generationContext(req, res);
    if (ctx.error) return ctx.error;
    const entries = Array.isArray(req.body.entries) ? req.body.entries : null;
    if (!entries || entries.length === 0 || entries.length > 30) {
      return res.status(400).json({ message: 'entries must be a non-empty array of at most 30 previewed entries' });
    }
    const facultyById = new Map(ctx.facultyList.map((f) => [f._id, f]));
    const existing = await Timetable.find({}).lean();
    for (const e of entries) {
      if (
        String(e.department) !== ctx.department ||
        Number(e.semester) !== ctx.semester ||
        String(e.section || 'A') !== ctx.section ||
        !facultyById.has(normalizeFacultyId(e.faculty))
      ) {
        return res.status(400).json({ message: 'Every entry must match the previewed department, semester and section, and its faculty must belong to that department' });
      }
      if (!GENERATOR_DAYS.includes(e.day)) {
        return res.status(400).json({ message: 'Every entry day must be Monday–Friday' });
      }
      if (!String(e.subject || '').trim() || !String(e.classroom || '').trim()) {
        return res.status(400).json({ message: 'Every entry must have a non-empty subject and classroom' });
      }
      if (!TIME_RE.test(e.startTime || '') || !TIME_RE.test(e.endTime || '') || toMinutes(e.endTime) <= toMinutes(e.startTime)) {
        return res.status(400).json({ message: 'Every entry must have valid start/end times with endTime after startTime' });
      }
      const alreadyScheduled = existing.find(
        (x) =>
          String(x.department) === ctx.department &&
          Number(x.semester) === ctx.semester &&
          String(x.section || 'A') === ctx.section &&
          x.day === e.day &&
          overlaps(e.startTime, e.endTime, x.startTime, x.endTime)
      );
      if (alreadyScheduled) {
        return res.status(400).json({ message: `Already scheduled: ${alreadyScheduled.subject} ${alreadyScheduled.startTime}-${alreadyScheduled.endTime} on ${alreadyScheduled.day} for this department, semester and section` });
      }
    }
    const { accepted, skipped } = validateBatch({ entries, existing });
    // Audit-log generator drops (finding 11). Log failures must not
    // mask the confirm response.
    const logGeneratorDrops = async (drops) => {
      for (const d of drops) {
        try {
          await ConflictLog.create({
            day: d.day,
            subject: String(d.subject || '').trim(),
            faculty: normalizeFacultyId(d.faculty),
            classroom: normalizeClassroom(d.classroom),
            startTime: d.startTime,
            endTime: d.endTime,
            conflictsWith: (d.conflictsWith || []).filter(Boolean),
            reason: d.reason || 'Conflict — not saved',
            attemptedBy: req.user._id,
            source: 'generator',
          });
        } catch (logErr) {
          console.error('Failed to log generator drop:', logErr);
        }
      }
    };
    await logGeneratorDrops(skipped);
    let saved = [];
    const allSkipped = [...skipped];
    if (accepted.length > 0) {
      const docsToInsert = accepted.map((e) => ({
        day: e.day,
        subject: String(e.subject || '').trim(),
        faculty: normalizeFacultyId(e.faculty),
        classroom: normalizeClassroom(e.classroom),
        startTime: e.startTime,
        endTime: e.endTime,
        department: ctx.department,
        semester: ctx.semester,
        section: ctx.section,
      }));
      try {
        const docs = await Timetable.insertMany(docsToInsert, { ordered: false });
        saved = await populate(Timetable.find({ _id: { $in: docs.map((d) => d._id) } }).sort({ day: 1, startTime: 1 }));
      } catch (insertErr) {
        if (insertErr && (insertErr.code === 11000 || insertErr.name === 'MongoBulkWriteError' || insertErr.name === 'MongooseBulkWriteError')) {
          // Duplicate-key race after pre-validation: recover what did
          // save and drop the rest as conflicts, rather than failing
          // the whole batch or reporting a partial mystery.
          const recovered = await Timetable.find({
            department: ctx.department,
            semester: ctx.semester,
            section: ctx.section,
            $or: docsToInsert.map((d) => ({
              day: d.day, faculty: d.faculty, classroom: d.classroom, startTime: d.startTime, endTime: d.endTime,
            })),
          }).lean();
          const recoveredKeys = new Set(recovered.map((d) => `${d.day}|${d.faculty}|${d.startTime}|${d.endTime}`));
          const raceDropped = docsToInsert.filter(
            (d) => !recoveredKeys.has(`${d.day}|${d.faculty}|${d.startTime}|${d.endTime}`)
          );
          for (const d of raceDropped) {
            allSkipped.push({ ...d, reason: 'Conflict detected during save (duplicate slot) — not saved' });
          }
          await logGeneratorDrops(raceDropped);
          saved = await populate(Timetable.find({ _id: { $in: recovered.map((d) => d._id) } }).sort({ day: 1, startTime: 1 }));
        } else {
          throw insertErr;
        }
      }
    }
    res.status(201).json({
      saved,
      savedCount: saved.length,
      skipped: allSkipped,
      skippedCount: allSkipped.length,
      leaveWarnings: await leaveWarningsForFaculty(ctx.facultyList),
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.post('/', requireRole('admin', 'hod'), async (req, res) => {
  try {
    const body = pickFields(req.body, TIMETABLE_FIELDS);
    const verified = await verifyFacultyAndDepartment(req, res, body.faculty, body.department);
    if (verified.error) return verified.error;
    if (hodScopeForbidden(req, body.department)) {
      return res.status(403).json({ message: 'HODs may only create timetable entries for their own department' });
    }
    const entry = {
      ...body,
      subject: body.subject != null ? String(body.subject).trim() : body.subject,
      classroom: normalizeClassroom(body.classroom),
    };
    const blocked = await validateAndCheck(req, res, entry, null);
    if (blocked) return blocked;
    let created;
    try {
      created = await Timetable.create(entry);
    } catch (createErr) {
      // Duplicate-key race: pre-validation passed, a concurrent insert
      // won the slot first (see Timetable unique indexes). Map to 409,
      // never to a raw 400/500.
      if (createErr && createErr.code === 11000) {
        return res.status(409).json({ message: 'Timetable conflict detected — entry was NOT saved' });
      }
      throw createErr;
    }
    res.status(201).json(await populate(Timetable.findById(created._id)));
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.put('/:id', requireRole('admin', 'hod'), async (req, res) => {
  try {
    const existing = await Timetable.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Timetable entry not found' });
    if (hodScopeForbidden(req, existing.department)) {
      return res.status(403).json({ message: 'HODs may only update timetable entries for their own department' });
    }
    const body = pickFields(req.body, TIMETABLE_FIELDS);
    if (req.user.role === 'hod' && body.department && String(body.department) !== String(req.user.department)) {
      return res.status(403).json({ message: 'HODs may only set a timetable entry to their own department' });
    }
    const merged = { ...existing.toObject(), ...body };
    // When faculty/department change (or are present), re-verify them
    // exactly as on create: 404 for missing ids, 400 for a faculty
    // that does not belong to the entry department.
    const verified = await verifyFacultyAndDepartment(req, res, merged.faculty, merged.department);
    if (verified.error) return verified.error;
    if (req.user.role === 'hod' && hodScopeForbidden(req, merged.department)) {
      return res.status(403).json({ message: 'HODs may only update timetable entries for their own department' });
    }
    const blocked = await validateAndCheck(req, res, merged, req.params.id);
    if (blocked) return blocked;
    Object.assign(existing, body, { classroom: normalizeClassroom(merged.classroom) });
    try {
      await existing.save();
    } catch (saveErr) {
      if (saveErr && saveErr.code === 11000) {
        return res.status(409).json({ message: 'Timetable conflict detected — entry was NOT saved' });
      }
      throw saveErr;
    }
    res.json(await populate(Timetable.findById(existing._id)));
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.delete('/:id', requireRole('admin', 'hod'), async (req, res) => {
  try {
    const entry = await Timetable.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Timetable entry not found' });
    if (hodScopeForbidden(req, entry.department)) {
      return res.status(403).json({ message: 'HODs may only delete timetable entries for their own department' });
    }
    await Timetable.findByIdAndDelete(req.params.id);
    res.json({ message: 'Timetable entry deleted' });
  } catch (err) {
    handleRouteError(res, err);
  }
});

export default router;
