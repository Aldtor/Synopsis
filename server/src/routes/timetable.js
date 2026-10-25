import express from 'express';
import Timetable from '../models/Timetable.js';
import ConflictLog from '../models/ConflictLog.js';
import { protect, requireRole } from '../middleware/auth.js';
import { findConflicts, describeConflict, logBlockedAttempt, toMinutes } from '../utils/conflict.js';

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

router.post('/', requireRole('admin', 'hod'), async (req, res) => {
  try {
    const blocked = await validateAndCheck(req, res, req.body, null);
    if (blocked) return blocked;
    const entry = await Timetable.create(req.body);
    res.status(201).json(await populate(Timetable.findById(entry._id)));
  } catch (err) {
    res.status(400).json({ message: err.message });
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
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', requireRole('admin', 'hod'), async (req, res) => {
  const entry = await Timetable.findByIdAndDelete(req.params.id);
  if (!entry) return res.status(404).json({ message: 'Timetable entry not found' });
  res.json({ message: 'Timetable entry deleted' });
});

export default router;
