import express from 'express';
import Timetable from '../models/Timetable.js';
import ConflictLog from '../models/ConflictLog.js';
import Department from '../models/Department.js';
import Faculty from '../models/Faculty.js';
import { protect, requireRole } from '../middleware/auth.js';
import { findConflicts, describeConflict, logBlockedAttempt, toMinutes } from '../utils/conflict.js';
import { buildSchedule, validateBatch } from '../utils/generate.js';
import { friendlyValidationMessage } from '../utils/validation.js';

const router = express.Router();
router.use(protect);

const populate = (q) =>
  q.populate({ path: 'faculty', select: 'facultyId', populate: { path: 'user', select: 'name' } })
    .populate('department', 'name code');

router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.day) filter.day = req.query.day;
  if (req.query.department) filter.department = req.query.department;
  if (req.query.faculty) filter.faculty = req.query.faculty;
  if (req.user.role === 'hod') filter.department = req.user.department;
  const rows = await populate(Timetable.find(filter).sort({ day: 1, startTime: 1 }));
  res.json(rows);
});

// Recently blocked timetable entries (proof the detector works).
router.get('/conflicts-log', requireRole('admin', 'hod'), async (req, res) => {
  const rows = await ConflictLog.find()
    .populate({ path: 'faculty', select: 'facultyId', populate: { path: 'user', select: 'name' } })
    .populate('conflictsWith', 'subject day startTime endTime classroom')
    .sort({ createdAt: -1 })
    .limit(50);
  res.json(rows);
});

async function validateAndCheck(req, res, entry, excludeId) {
  if (toMinutes(entry.endTime) <= toMinutes(entry.startTime)) {
    return res.status(400).json({ message: 'endTime must be after startTime' });
  }
  const conflicts = await findConflicts(entry, excludeId);
  if (conflicts.length > 0) {
    await logBlockedAttempt(entry, conflicts, req.user._id);
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
    });
  } catch (err) {
    res.status(400).json({ message: friendlyValidationMessage(err) });
  }
});

// POST /api/timetable/generate-confirm — saves exactly the previewed
// payload (body: { department, semester, section, entries: [...] }).
// Every entry is re-validated against current DB state and against
// earlier entries in the same batch; conflicting entries are dropped
// with a reason, never inserted.
router.post('/generate-confirm', requireRole('admin', 'hod'), async (req, res) => {
  try {
    const ctx = await generationContext(req, res);
    if (ctx.error) return ctx.error;
    const entries = Array.isArray(req.body.entries) ? req.body.entries : null;
    if (!entries || entries.length === 0 || entries.length > 60) {
      return res.status(400).json({ message: 'entries must be a non-empty array of at most 60 previewed entries' });
    }
    const facultyById = new Map(ctx.facultyList.map((f) => [f._id, f]));
    for (const e of entries) {
      if (
        String(e.department) !== ctx.department ||
        Number(e.semester) !== ctx.semester ||
        String(e.section || 'A') !== ctx.section ||
        !facultyById.has(String(e.faculty?._id ?? e.faculty))
      ) {
        return res.status(400).json({ message: 'Every entry must match the previewed department, semester and section, and its faculty must belong to that department' });
      }
      if (toMinutes(e.endTime) <= toMinutes(e.startTime)) {
        return res.status(400).json({ message: 'endTime must be after startTime for every entry' });
      }
    }
    const existing = await Timetable.find({}).lean();
    const { accepted, skipped } = validateBatch({ entries, existing });
    let saved = [];
    if (accepted.length > 0) {
      const docs = await Timetable.insertMany(
        accepted.map((e) => ({
          day: e.day,
          subject: e.subject,
          faculty: e.faculty,
          classroom: e.classroom,
          startTime: e.startTime,
          endTime: e.endTime,
          department: ctx.department,
          semester: ctx.semester,
          section: ctx.section,
        }))
      );
      saved = await populate(Timetable.find({ _id: { $in: docs.map((d) => d._id) } }).sort({ day: 1, startTime: 1 }));
    }
    res.status(201).json({ saved, savedCount: saved.length, skipped, skippedCount: skipped.length });
  } catch (err) {
    res.status(400).json({ message: friendlyValidationMessage(err) });
  }
});

router.post('/', requireRole('admin', 'hod'), async (req, res) => {
  try {
    const blocked = await validateAndCheck(req, res, req.body, null);
    if (blocked) return blocked;
    const entry = await Timetable.create(req.body);
    res.status(201).json(await populate(Timetable.findById(entry._id)));
  } catch (err) {
    res.status(400).json({ message: friendlyValidationMessage(err) });
  }
});

router.put('/:id', requireRole('admin', 'hod'), async (req, res) => {
  const existing = await Timetable.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Timetable entry not found' });
  const merged = { ...existing.toObject(), ...req.body };
  try {
    const blocked = await validateAndCheck(req, res, merged, req.params.id);
    if (blocked) return blocked;
    Object.assign(existing, req.body);
    await existing.save();
    res.json(await populate(Timetable.findById(existing._id)));
  } catch (err) {
    res.status(400).json({ message: friendlyValidationMessage(err) });
  }
});

router.delete('/:id', requireRole('admin', 'hod'), async (req, res) => {
  const entry = await Timetable.findByIdAndDelete(req.params.id);
  if (!entry) return res.status(404).json({ message: 'Timetable entry not found' });
  res.json({ message: 'Timetable entry deleted' });
});

export default router;
