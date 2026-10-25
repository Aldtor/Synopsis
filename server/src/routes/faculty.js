import express from 'express';
import User from '../models/User.js';
import Faculty from '../models/Faculty.js';
import Timetable from '../models/Timetable.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import { protect, requireRole } from '../middleware/auth.js';
import { handleRouteError } from '../utils/validation.js';

const router = express.Router();
router.use(protect);

const populate = (q) => q.populate('department', 'name code').populate('user', 'name email role');

// HODs only see their own department; faculty see only themselves in the list.
function listFilter(req) {
  if (req.user.role === 'hod') return { department: req.user.department };
  return {};
}

router.get('/', async (req, res) => {
  try {
    if (req.user.role === 'faculty') {
      const mine = await Faculty.findOne({ user: req.user._id });
      return res.json(mine ? [await populate(Faculty.findById(mine._id))] : []);
    }
    const faculty = await populate(Faculty.find(listFilter(req)).sort('facultyId'));
    res.json(faculty);
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.get('/me', async (req, res) => {
  try {
    const mine = await populate(Faculty.findOne({ user: req.user._id }));
    if (!mine) return res.status(404).json({ message: 'No faculty profile for this account' });
    res.json(mine);
  } catch (err) {
    handleRouteError(res, err);
  }
});

// Admin creates a faculty member (login account + profile in one call).
// An explicit password is required — no demo-password default (F11).
router.post('/', requireRole('admin'), async (req, res) => {
  const { name, email, password, facultyId, department, designation, qualification, phone, subjects, joiningDate } = req.body;
  if (!password) return res.status(400).json({ message: 'Password is required' });
  // Stage-tracked rollback: `user` is null until User.create actually
  // succeeds. Roll back ONLY that just-created user, by _id, and ONLY
  // when the profile create afterwards fails. If User.create itself
  // fails (validation error, duplicate email, ...), `user` is still
  // null, so no rollback runs — a pre-existing account with this email
  // is never touched. Never delete by email here.
  let user = null;
  try {
    user = await User.create({ name, email, password, role: 'faculty', department });
    const profile = await Faculty.create({
      facultyId, user: user._id, department, designation, qualification, phone,
      subjects: subjects || [], joiningDate: joiningDate || null,
    });
    res.status(201).json(await populate(Faculty.findById(profile._id)));
  } catch (err) {
    if (user) await User.findByIdAndDelete(user._id);
    if (err && err.code === 11000) return res.status(400).json({ message: 'Faculty ID or email already exists' });
    handleRouteError(res, err);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const profile = await Faculty.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Faculty not found' });
    const isSelf = String(profile.user) === String(req.user._id);
    const isAdmin = req.user.role === 'admin';
    const isOwnHod = req.user.role === 'hod' && String(profile.department) === String(req.user.department);
    if (!isAdmin && !isOwnHod && !isSelf) return res.status(403).json({ message: 'Forbidden' });
    // F5: a HOD may not move a profile into another department — only
    // into their own department (which, for an own-department profile,
    // is a no-op; moving a profile out is an admin job).
    if (req.user.role === 'hod' && req.body.department && String(req.body.department) !== String(req.user.department)) {
      return res.status(403).json({ message: 'HODs may only set a faculty profile to their own department' });
    }
    const allowed = isSelf && !isAdmin
      ? ['phone', 'qualification']
      : ['designation', 'qualification', 'phone', 'subjects', 'department', 'joiningDate'];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const oldDepartment = String(profile.department);
    Object.assign(profile, updates);
    await profile.save();
    // F5: keep the linked User.department in sync when the profile's
    // department changes.
    if (updates.department && String(profile.department) !== oldDepartment) {
      await User.findByIdAndUpdate(profile.user, { department: profile.department });
    }
    res.json(await populate(Faculty.findById(profile._id)));
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const profile = await Faculty.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Faculty not found' });
    // Finding 5: never cascade-delete a referenced profile — an
    // orphaned faculty reference crashes conflict detection and leave
    // review. Block the delete and list the referencing counts.
    const [timetableCount, attendanceCount, leaveCount] = await Promise.all([
      Timetable.countDocuments({ faculty: profile._id }),
      Attendance.countDocuments({ faculty: profile._id }),
      Leave.countDocuments({ faculty: profile._id }),
    ]);
    if (timetableCount > 0 || attendanceCount > 0 || leaveCount > 0) {
      return res.status(400).json({
        message: `Cannot delete faculty: referenced by ${timetableCount} timetable ${timetableCount === 1 ? 'entry' : 'entries'}, ${attendanceCount} attendance ${attendanceCount === 1 ? 'row' : 'rows'} and ${leaveCount} leave ${leaveCount === 1 ? 'request' : 'requests'}. Delete those references first.`,
      });
    }
    await Faculty.findByIdAndDelete(profile._id);
    await User.findByIdAndDelete(profile.user);
    res.json({ message: 'Faculty deleted' });
  } catch (err) {
    handleRouteError(res, err);
  }
});

export default router;
