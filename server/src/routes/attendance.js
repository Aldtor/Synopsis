import express from 'express';
import Attendance from '../models/Attendance.js';
import Faculty from '../models/Faculty.js';
import { protect, requireRole } from '../middleware/auth.js';
import { handleRouteError } from '../utils/validation.js';
import { istDayWindow } from '../utils/dates.js';

const router = express.Router();
router.use(protect);

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
  try {
    const ids = await visibleFacultyIds(req);
    const filter = {};
    // F2: intersect, never overwrite. An admin may filter by any
    // ?faculty= value; a scoped caller (HOD/faculty) may only narrow
    // to a faculty inside their scoped set — any other value is
    // ignored and the scoped filter stands.
    if (ids) {
      if (req.query.faculty && ids.map(String).includes(String(req.query.faculty))) {
        filter.faculty = req.query.faculty;
      } else {
        filter.faculty = { $in: ids };
      }
    } else if (req.query.faculty) {
      filter.faculty = req.query.faculty;
    }
    if (req.query.date) {
      // The query date is an IST calendar date (see utils/dates.js).
      const { start, end } = istDayWindow(new Date(req.query.date));
      filter.date = { $gte: start, $lt: end };
    }
    const rows = await Attendance.find(filter)
      .populate({ path: 'faculty', select: 'facultyId', populate: { path: 'user', select: 'name' } })
      .sort({ date: -1 });
    res.json(rows);
  } catch (err) {
    handleRouteError(res, err);
  }
});

// Mark (or update) attendance for one faculty on one day. Admin / HOD only.
// Returns 201 only on insert, 200 on update.
router.post('/', requireRole('admin', 'hod'), async (req, res) => {
  try {
    const { faculty, date, status, remarks } = req.body;
    const profile = await Faculty.findById(faculty);
    if (!profile) return res.status(404).json({ message: 'Faculty not found' });
    if (req.user.role === 'hod' && String(profile.department) !== String(req.user.department)) {
      return res.status(403).json({ message: 'Faculty belongs to another department' });
    }
    // Day window is the IST calendar day (see utils/dates.js); the
    // stored date is IST midnight for that day.
    const { start, end } = istDayWindow(new Date(date));
    const existing = await Attendance.findOne({ faculty, date: { $gte: start, $lt: end } });
    if (existing) {
      existing.date = start;
      existing.status = status;
      existing.remarks = remarks || '';
      existing.markedBy = req.user._id;
      await existing.save();
      return res.status(200).json(existing);
    }
    try {
      const row = await Attendance.create({
        faculty,
        date: start,
        status,
        remarks: remarks || '',
        markedBy: req.user._id,
      });
      return res.status(201).json(row);
    } catch (createErr) {
      if (createErr && createErr.code === 11000) {
        // Upsert race: a concurrent request inserted the same
        // faculty+day row after our find. Retry once as an update.
        const raced = await Attendance.findOne({ faculty, date: { $gte: start, $lt: end } });
        if (raced) {
          raced.date = start;
          raced.status = status;
          raced.remarks = remarks || '';
          raced.markedBy = req.user._id;
          await raced.save();
          return res.status(200).json(raced);
        }
        // If the row is still not there, the duplicate key came from
        // elsewhere — fall through to the generic handler below.
      }
      throw createErr;
    }
  } catch (err) {
    // Keep the duplicate-specific message safe; everything else goes
    // through the standard validation/generic mapping.
    if (err && err.code === 11000) {
      return res.status(400).json({ message: 'Attendance for this faculty and day already exists' });
    }
    handleRouteError(res, err);
  }
});

export default router;
