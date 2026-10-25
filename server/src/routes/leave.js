import express from 'express';
import Leave from '../models/Leave.js';
import Faculty from '../models/Faculty.js';
import { protect, requireRole } from '../middleware/auth.js';
import { handleRouteError } from '../utils/validation.js';

const router = express.Router();
router.use(protect);

const populate = (q) =>
  q.populate({ path: 'faculty', select: 'facultyId department', populate: { path: 'user', select: 'name' } });

async function visibleFacultyIds(req) {
  if (req.user.role === 'hod') {
    const list = await Faculty.find({ department: req.user.department }).select('_id');
    return list.map((f) => f._id);
  }
  if (req.user.role === 'faculty') {
    const mine = await Faculty.findOne({ user: req.user._id }).select('_id');
    return mine ? [mine._id] : [];
  }
  return null;
}

router.get('/', async (req, res) => {
  try {
    const ids = await visibleFacultyIds(req);
    const filter = ids ? { faculty: { $in: ids } } : {};
    if (req.query.status) filter.status = req.query.status;
    res.json(await populate(Leave.find(filter).sort({ createdAt: -1 })));
  } catch (err) {
    handleRouteError(res, err);
  }
});

// Faculty apply for their own leave; admin/HOD may file for a faculty member.
router.post('/', async (req, res) => {
  try {
    let target = null;
    if (req.user.role === 'faculty') {
      target = await Faculty.findOne({ user: req.user._id });
      if (!target) return res.status(400).json({ message: 'No faculty profile' });
    } else {
      if (!req.body.faculty) return res.status(400).json({ message: 'Faculty is required' });
      target = await Faculty.findById(req.body.faculty);
      if (!target) return res.status(404).json({ message: 'Faculty not found' });
      // F6: HOD callers may only file leave for their own department.
      if (req.user.role === 'hod' && String(target.department) !== String(req.user.department)) {
        return res.status(403).json({ message: 'Faculty belongs to another department' });
      }
    }
    const facultyId = target._id;
    const { type, fromDate, toDate, reason } = req.body;
    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (!fromDate || !toDate || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ message: 'fromDate and toDate must be valid dates' });
    }
    if (to < from) {
      return res.status(400).json({ message: 'toDate cannot be before fromDate' });
    }
    // Reject a new leave overlapping an existing Pending/Approved leave
    // for the same faculty (finding 10).
    const overlap = await Leave.findOne({
      faculty: facultyId,
      status: { $in: ['Pending', 'Approved'] },
      fromDate: { $lte: to },
      toDate: { $gte: from },
    });
    if (overlap) {
      return res.status(400).json({ message: 'This faculty already has a pending or approved leave overlapping these dates' });
    }
    const leave = await Leave.create({ faculty: facultyId, type, fromDate: from, toDate: to, reason });
    res.status(201).json(await populate(Leave.findById(leave._id)));
  } catch (err) {
    handleRouteError(res, err);
  }
});

// Approve / reject a leave request (admin or the faculty member's HOD).
router.put('/:id/review', requireRole('admin', 'hod'), async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id).populate('faculty', 'department');
    if (!leave || !leave.faculty) return res.status(404).json({ message: 'Leave not found' });
    if (req.user.role === 'hod' && String(leave.faculty.department) !== String(req.user.department)) {
      return res.status(403).json({ message: 'Faculty belongs to another department' });
    }
    const { status, remarks } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
    // Review transitions are allowed ONLY from Pending (finding 10).
    if (leave.status !== 'Pending') {
      return res.status(400).json({ message: 'Only a Pending leave request can be reviewed' });
    }
    leave.status = status;
    leave.remarks = remarks || '';
    leave.reviewedBy = req.user._id;
    await leave.save();
    res.json(await populate(Leave.findById(leave._id)));
  } catch (err) {
    handleRouteError(res, err);
  }
});

export default router;
