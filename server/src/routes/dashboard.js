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

// GET /api/dashboard/charts — data for the Dashboard charts.
// attendanceTrend: present vs absent per day over the last 14 days.
// facultyByDepartment / timetableByDepartment: counts per department.
// HODs see only their own department's faculty, timetable and
// attendance (same scoping as /summary); admins see everything.
router.get('/charts', async (req, res) => {
  const isHod = req.user.role === 'hod';
  const deptFilter = isHod ? { department: req.user.department } : {};

  const departments = await Department.find({}).sort({ code: 1 }).lean();

  const [facultyDocs, timetableDocs] = await Promise.all([
    Faculty.find(deptFilter).select('department').lean(),
    Timetable.find(deptFilter).select('department').lean(),
  ]);
  const countBy = (docs) => {
    const map = new Map();
    docs.forEach((d) => {
      const key = String(d.department);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return departments
      .filter((d) => !isHod || String(d._id) === String(req.user.department))
      .map((d) => ({
        department: d.name,
        code: d.code,
        count: map.get(String(d._id)) || 0,
      }));
  };

  // Attendance trend: last 14 calendar days, bucketed by local date.
  const days = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 13);
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  const end = new Date(days[13]);
  end.setHours(23, 59, 59, 999);
  const visibleFaculty = isHod
    ? await Faculty.find({ department: req.user.department }).select('_id').lean()
    : null;
  const attFilter = { date: { $gte: start, $lte: end } };
  if (visibleFaculty) attFilter.faculty = { $in: visibleFaculty.map((f) => f._id) };
  if (req.user.role === 'faculty') {
    const mine = await Faculty.findOne({ user: req.user._id }).select('_id').lean();
    attFilter.faculty = { $in: mine ? [mine._id] : [] };
  }
  const attRows = await Attendance.find(attFilter).select('date status').lean();
  // Local-date keys (not UTC ISO dates): stored attendance dates are
  // local midnights, and UTC slicing would shift them a day for IST.
  const localKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const buckets = new Map(days.map((d) => [localKey(d), { present: 0, absent: 0 }]));
  attRows.forEach((r) => {
    const b = buckets.get(localKey(new Date(r.date)));
    if (!b) return;
    if (r.status === 'Present') b.present += 1;
    else if (r.status === 'Absent') b.absent += 1;
  });
  const attendanceTrend = days.map((d) => ({
    date: localKey(d),
    label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    present: buckets.get(localKey(d)).present,
    absent: buckets.get(localKey(d)).absent,
  }));

  res.json({
    attendanceTrend,
    facultyByDepartment: countBy(facultyDocs),
    timetableByDepartment: countBy(timetableDocs),
  });
});

export default router;
