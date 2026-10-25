import express from 'express';
import Leave from '../models/Leave.js';
import Faculty from '../models/Faculty.js';
import { protect, requireRole } from '../middleware/auth.js';
import { friendlyValidationMessage } from '../utils/validation.js';

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
  const ids = await visibleFacultyIds(req);
  const filter = ids ? { faculty: { $in: ids } } : {};
  if (req.query.status) filter.status = req.query.status;
  res.json(await populate(Leave.find(filter).sort({ createdAt: -1 })));
});

// Faculty apply for their own leave.
router.post('/', async (req, res) => {
  const mine = await Faculty.findOne({ user: req.user._id });
  if (!mine && req.user.role === 'faculty') return res.status(400).json({ message: 'No faculty profile' });
  const facultyId = req.user.role === 'faculty' ? mine._id : req.body.faculty;
  const { type, fromDate, toDate, reason } = req.body;
  if (new Date(toDate) < new Date(fromDate)) {
    return res.status(400).json({ message: 'toDate cannot be before fromDate' });
  }
  try {
    const leave = await Leave.create({ faculty: facultyId, type, fromDate, toDate, reason });
    res.status(201).json(await populate(Leave.findById(leave._id)));
  } catch (err) {
    res.status(400).json({ message: friendlyValidationMessage(err) });
  }
});

// Approve / reject a leave request (admin or the faculty member's HOD).
router.put('/:id/review', requireRole('admin', 'hod'), async (req, res) => {
  const leave = await Leave.findById(req.params.id).populate('faculty', 'department');
  if (!leave) return res.status(404).json({ message: 'Leave not found' });
  if (req.user.role === 'hod' && String(leave.faculty.department) !== String(req.user.department)) {
    return res.status(403).json({ message: 'Faculty belongs to another department' });
  }
  const { status, remarks } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
  leave.status = status;
  leave.remarks = remarks || '';
  leave.reviewedBy = req.user._id;
  try {
    await leave.save();
    res.json(await populate(Leave.findById(leave._id)));
  } catch (err) {
    res.status(400).json({ message: friendlyValidationMessage(err) });
  }
});

export default router;
