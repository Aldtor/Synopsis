import express from 'express';
import Attendance from '../models/Attendance.js';
import Faculty from '../models/Faculty.js';
import { protect, requireRole } from '../middleware/auth.js';
import { friendlyValidationMessage } from '../utils/validation.js';

const router = express.Router();
router.use(protect);

const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayEnd = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

async function visibleFacultyIds(req) {
  if (req.user.role === 'hod') {
    const list = await Faculty.find({ department: req.user.department }).select('_id');
    return list.map((f) => f._id);
  }
  if (req.user.role === 'faculty') {
    const mine = await Faculty.findOne({ user: req.user._id }).select('_id');
    return mine ? [mine._id] : [];
  }
  return null; // admin: all
}

router.get('/', async (req, res) => {
  const ids = await visibleFacultyIds(req);
  const filter = {};
  if (ids) filter.faculty = { $in: ids };
  if (req.query.faculty) filter.faculty = req.query.faculty;
  if (req.query.date) filter.date = { $gte: dayStart(req.query.date), $lte: dayEnd(req.query.date) };
  const rows = await Attendance.find(filter)
    .populate({ path: 'faculty', select: 'facultyId', populate: { path: 'user', select: 'name' } })
    .sort({ date: -1 });
  res.json(rows);
});

// Mark (or update) attendance for one faculty on one day. Admin / HOD only.
router.post('/', requireRole('admin', 'hod'), async (req, res) => {
  const { faculty, date, status, remarks } = req.body;
  const profile = await Faculty.findById(faculty);
  if (!profile) return res.status(404).json({ message: 'Faculty not found' });
  if (req.user.role === 'hod' && String(profile.department) !== String(req.user.department)) {
    return res.status(403).json({ message: 'Faculty belongs to another department' });
  }
  try {
    const row = await Attendance.findOneAndUpdate(
      { faculty, date: { $gte: dayStart(date), $lte: dayEnd(date) } },
      { faculty, date: dayStart(date), status, remarks: remarks || '', markedBy: req.user._id },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ message: friendlyValidationMessage(err) });
  }
});

export default router;
