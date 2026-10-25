import express from 'express';
import Faculty from '../models/Faculty.js';
import Department from '../models/Department.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Timetable from '../models/Timetable.js';
import ConflictLog from '../models/ConflictLog.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/summary', async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const deptFilter = req.user.role === 'hod' ? { department: req.user.department } : {};
  const [facultyCount, deptCount, timetableCount, pendingLeaves, conflictsPrevented, todayAttendance] =
    await Promise.all([
      Faculty.countDocuments(deptFilter),
      Department.countDocuments(),
      Timetable.countDocuments(deptFilter),
      Leave.countDocuments({ status: 'Pending' }),
      ConflictLog.countDocuments(),
      Attendance.countDocuments({ date: { $gte: today, $lt: tomorrow }, status: 'Present' }),
    ]);

  const recentConflicts = await ConflictLog.find()
    .populate({ path: 'faculty', select: 'facultyId', populate: { path: 'user', select: 'name' } })
    .sort({ createdAt: -1 })
    .limit(5);

  res.json({
    facultyCount,
    deptCount,
    timetableCount,
    pendingLeaves,
    conflictsPrevented,
    todayPresent: todayAttendance,
    recentConflicts,
  });
});

export default router;
