import express from 'express';
import Faculty from '../models/Faculty.js';
import Department from '../models/Department.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Timetable from '../models/Timetable.js';
import ConflictLog from '../models/ConflictLog.js';
import { protect } from '../middleware/auth.js';
import { handleRouteError } from '../utils/validation.js';
import { istTodayWindow, istLastNDays, istDateKey } from '../utils/dates.js';

const router = express.Router();
router.use(protect);

// Faculty ids visible to the caller for scoped counts: HOD -> own
// department, faculty -> self only, admin -> null (all).
async function scopedFacultyIds(req) {
  if (req.user.role === 'hod') {
    const list = await Faculty.find({ department: req.user.department }).select('_id').lean();
    return list.map((f) => f._id);
  }
  if (req.user.role === 'faculty') {
    const mine = await Faculty.findOne({ user: req.user._id }).select('_id').lean();
    return mine ? [mine._id] : [];
  }
  return null;
}

router.get('/summary', async (req, res) => {
  try {
    // "Today" is an IST day window (Asia/Kolkata, UTC+5:30, no DST),
    // not the server's local day (Vercel runs on UTC).
    const { start: todayStart, end: tomorrowStart } = istTodayWindow();
    const deptFilter = req.user.role === 'hod' ? { department: req.user.department } : {};
    // HOD scoping (finding 8): pendingLeaves, todayPresent,
    // conflictsPrevented and recentConflicts are all scoped through
    // the HOD department's faculty ids, matching /charts. Admins keep
    // the global view; faculty users keep the previous summary counts.
    let scopedFilter = null;
    if (req.user.role === 'hod') {
      scopedFilter = { faculty: { $in: await scopedFacultyIds(req) } };
    }
    const [facultyCount, deptCount, timetableCount, pendingLeaves, conflictsPrevented, todayAttendance] =
      await Promise.all([
        Faculty.countDocuments(deptFilter),
        Department.countDocuments(),
        Timetable.countDocuments(deptFilter),
        Leave.countDocuments({ status: 'Pending', ...(scopedFilter || {}) }),
        ConflictLog.countDocuments(scopedFilter || {}),
        Attendance.countDocuments({
          date: { $gte: todayStart, $lt: tomorrowStart },
          status: 'Present',
          ...(scopedFilter || {}),
        }),
      ]);

    const recentConflicts = await ConflictLog.find(scopedFilter || {})
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
  } catch (err) {
    handleRouteError(res, err);
  }
});

// GET /api/dashboard/charts — data for the Dashboard charts.
// attendanceTrend: present vs absent per day over the last 14 days.
// facultyByDepartment / timetableByDepartment: counts per department.
// HODs see only their own department; faculty users get a single
// own-department entry (not all departments); admins see everything.
router.get('/charts', async (req, res) => {
  try {
    const isHod = req.user.role === 'hod';
    const isFaculty = req.user.role === 'faculty';
    const deptFilter = isHod ? { department: req.user.department } : {};

    const departments = await Department.find({}).sort({ code: 1 }).lean();
    let visibleDepartments = departments;
    if (isHod) {
      visibleDepartments = departments.filter((d) => String(d._id) === String(req.user.department));
    } else if (isFaculty) {
      const mine = await Faculty.findOne({ user: req.user._id }).select('department').lean();
      visibleDepartments = mine ? departments.filter((d) => String(d._id) === String(mine.department)) : [];
    }

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
      return visibleDepartments.map((d) => ({
        department: d.name,
        code: d.code,
        count: map.get(String(d._id)) || 0,
      }));
    };

    // Attendance trend: last 14 IST calendar days, bucketed by IST date.
    const days = istLastNDays(14);
    const start = days[0].start;
    const end = days[days.length - 1].end;
    const visibleFaculty = isHod
      ? await Faculty.find({ department: req.user.department }).select('_id').lean()
      : null;
    const attFilter = { date: { $gte: start, $lt: end } };
    if (visibleFaculty) attFilter.faculty = { $in: visibleFaculty.map((f) => f._id) };
    if (isFaculty) {
      const mine = await Faculty.findOne({ user: req.user._id }).select('_id').lean();
      attFilter.faculty = { $in: mine ? [mine._id] : [] };
    }
    const attRows = await Attendance.find(attFilter).select('date status').lean();
    const buckets = new Map(days.map((d) => [d.key, { present: 0, absent: 0 }]));
    attRows.forEach((r) => {
      const b = buckets.get(istDateKey(new Date(r.date)));
      if (!b) return;
      if (r.status === 'Present') b.present += 1;
      else if (r.status === 'Absent') b.absent += 1;
    });
    const attendanceTrend = days.map((d) => ({
      date: d.key,
      label: d.label,
      present: buckets.get(d.key).present,
      absent: buckets.get(d.key).absent,
    }));

    res.json({
      attendanceTrend,
      facultyByDepartment: countBy(facultyDocs),
      timetableByDepartment: countBy(timetableDocs),
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

export default router;
