import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB, closeDB } from './config/db.js';
import User from './models/User.js';
import Department from './models/Department.js';
import Faculty from './models/Faculty.js';
import Attendance from './models/Attendance.js';
import Leave from './models/Leave.js';
import Timetable from './models/Timetable.js';

const PASSWORD = 'password123';

const DEPARTMENTS = [
  { name: 'Computer Science and Engineering', code: 'CSE' },
  { name: 'Electronics and Communication Engineering', code: 'ECE' },
  { name: 'Electrical Engineering', code: 'EE' },
  { name: 'Mechanical Engineering', code: 'ME' },
  { name: 'Civil Engineering', code: 'CE' },
];

const SUBJECTS = {
  CSE: ['Data Structures', 'Database Management Systems', 'Operating Systems', 'Computer Networks', 'Artificial Intelligence', 'Web Technology', 'Compiler Design', 'Software Engineering'],
  ECE: ['Digital Electronics', 'Signals and Systems', 'Microprocessors', 'VLSI Design', 'Communication Systems', 'Embedded Systems'],
  EE: ['Power Systems', 'Electrical Machines', 'Control Systems', 'Power Electronics'],
  ME: ['Thermodynamics', 'Fluid Mechanics', 'Machine Design', 'Manufacturing Technology'],
  CE: ['Structural Analysis', 'Geotechnical Engineering', 'Transportation Engineering', 'Surveying'],
};

const NAMES = [
  'Aarav Sharma', 'Priya Verma', 'Rohan Gupta', 'Sneha Patel', 'Arjun Mehta', 'Kavya Nair',
  'Vikram Singh', 'Ananya Iyer', 'Rahul Yadav', 'Pooja Desai', 'Nikhil Kumar', 'Divya Reddy',
  'Aditya Joshi', 'Neha Agarwal', 'Karan Malhotra', 'Ritu Saxena', 'Manish Tiwari', 'Shreya Kapoor',
  'Amit Chauhan', 'Farah Khan', 'Sanjay Mishra', 'Meera Pillai', 'Deepak Ranjan', 'Ishita Bose',
  'Varun Khanna', 'Tanvi Shah', 'Rajesh Kumar', 'Geeta Rao', 'Mohit Bansal', 'Sana Sheikh',
  'Abhishek Pandey', 'Lakshmi Menon', 'Nitin Jain', 'Swati Kulkarni', 'Harsh Vardhan', 'Anjali Gupta',
  'Prateek Singh', 'Roshni Das', 'Vivek Anand', 'Kiran Bedi',
];

const DESIGNATIONS = ['Professor', 'Associate Professor', 'Assistant Professor', 'Assistant Professor', 'Lecturer'];
const QUALIFICATIONS = ['Ph.D.', 'M.Tech.', 'M.Tech.', 'M.E.', 'Ph.D.'];

const facultyIdFor = (i) => `FAC${String(i + 1).padStart(3, '0')}`;
const facultyEmailFor = (i) => `faculty${String(i + 1).padStart(2, '0')}@bias.ac.in`;

// Idempotent, NON-DESTRUCTIVE seed ("ensure").
// The old version wiped every collection and then did
// ~46 sequential bcrypt hashes + one-by-one creates, so a Vercel Hobby
// timeout mid-run left a partial database that never retried (the old
// start trigger only seeded when User count was 0). This version:
//  - never deletes, drops, or overwrites anything that already exists;
//  - hashes the shared demo password ONCE and reuses that hash for all
//    demo users (insertMany skips the pre-save hook, and the hook itself
//    now skips already-hashed values, so the hash is never double-hashed);
//  - inserts only the missing rows, keyed on unique fields
//    (departments by code, users by email, faculty by facultyId);
//  - fills attendance / timetable / leaves only when their collection
//    is empty, so a partial run heals itself on the next start;
//  - hashes the demo password ONLY when users are actually missing
//    (finding 12: no wasted bcrypt work on a complete database);
//  - tolerates duplicate-key errors on insertMany (finding 12): two
//    concurrent cold starts can both see an empty collection and both
//    try to insert; the unique indexes reject the second copy and the
//    second run logs a warning and continues with the first run's rows
//    instead of crashing startup;
//  - KNOWN LIMITATION (finding 12, documented not fixed): partial
//    deletion is NOT healed — e.g. timetable 240 -> 239 is never
//    repaired, because seed rows have no stable natural key that would
//    distinguish a deliberately deleted row from a missing seed row,
//    and regenerating them (random shuffle) could add duplicates or
//    conflicts. Refilling them safely would need a deterministic seed
//    key per row; that is a future change, not attempted here.
//  - is a fast no-op (a handful of reads) when the data is complete,
//    so it is safe to run on every server start.
export async function seed() {

  // --- Departments, keyed by code ---
  const deptByCode = new Map((await Department.find()).map((d) => [d.code, d]));
  const missingDepts = DEPARTMENTS.filter((d) => !deptByCode.has(d.code));
  if (missingDepts.length > 0) {
    try {
      await Department.insertMany(missingDepts.map((d) => ({ ...d, hod: null })));
    } catch (e) {
      if (e.code !== 11000) throw e;
      console.warn('Seed departments: duplicate-key (concurrent cold start) — continuing with existing rows');
    }
    for (const d of await Department.find({ code: { $in: missingDepts.map((x) => x.code) } })) {
      deptByCode.set(d.code, d);
    }
  }

  // --- Users, keyed by email (one hash, one insertMany) ---
  const userSpecs = [
    { name: 'System Administrator', email: 'admin@bias.ac.in', role: 'admin', department: null },
    ...DEPARTMENTS.map((d) => ({
      name: `HOD ${d.code}`,
      email: `hod.${d.code.toLowerCase()}@bias.ac.in`,
      role: 'hod',
      department: deptByCode.get(d.code)._id,
    })),
    ...NAMES.map((name, i) => ({
      name,
      email: facultyEmailFor(i),
      role: 'faculty',
      department: deptByCode.get(DEPARTMENTS[i % DEPARTMENTS.length].code)._id,
    })),
  ];
  const userByEmail = new Map((await User.find()).map((u) => [u.email, u]));
  const missingUsers = userSpecs.filter((u) => !userByEmail.has(u.email));
  if (missingUsers.length > 0) {
    // Bcrypt work happens only here, when users are actually missing.
    const hash = await bcrypt.hash(PASSWORD, 10);
    try {
      await User.insertMany(missingUsers.map((u) => ({ ...u, password: hash })));
    } catch (e) {
      if (e.code !== 11000) throw e;
      console.warn('Seed users: duplicate-key (concurrent cold start) — continuing with existing rows');
    }
    for (const u of await User.find({ email: { $in: missingUsers.map((x) => x.email) } })) {
      userByEmail.set(u.email, u);
    }
  }

  // --- Repair links without touching anything else ---
  // HOD <-> department links (covers a dept created before its HOD user,
  // or a HOD user whose department was never set).
  for (const d of DEPARTMENTS) {
    const dept = deptByCode.get(d.code);
    const hod = userByEmail.get(`hod.${d.code.toLowerCase()}@bias.ac.in`);
    if (!hod) continue;
    if (String(hod.department || '') !== String(dept._id)) {
      await User.updateOne({ _id: hod._id }, { department: dept._id });
    }
    if (String(dept.hod || '') !== String(hod._id)) {
      await Department.updateOne({ _id: dept._id }, { hod: hod._id });
    }
  }

  // --- Faculty profiles, keyed by facultyId ---
  const facultySpecs = NAMES.map((_, i) => {
    const code = DEPARTMENTS[i % DEPARTMENTS.length].code;
    const dept = deptByCode.get(code);
    return {
      facultyId: facultyIdFor(i),
      user: userByEmail.get(facultyEmailFor(i))._id,
      department: dept._id,
      designation: DESIGNATIONS[i % DESIGNATIONS.length],
      qualification: QUALIFICATIONS[i % QUALIFICATIONS.length],
      phone: `98${String(10000000 + i * 137).slice(0, 8)}`,
      subjects: [SUBJECTS[code][i % SUBJECTS[code].length]],
      joiningDate: new Date(2015 + (i % 9), i % 12, 1),
    };
  });
  const facultyById = new Map((await Faculty.find()).map((f) => [f.facultyId, f]));
  const missingFaculty = facultySpecs.filter((f) => !facultyById.has(f.facultyId));
  if (missingFaculty.length > 0) {
    try {
      await Faculty.insertMany(missingFaculty);
    } catch (e) {
      if (e.code !== 11000) throw e;
      console.warn('Seed faculty: duplicate-key (concurrent cold start) — continuing with existing rows');
    }
  }
  // Generated rows (attendance / leaves / timetable) are built from the
  // demo profiles only, so user-created faculty never inflate them.
  const facultyDocs = await Faculty.find({ facultyId: { $in: NAMES.map((_, i) => facultyIdFor(i)) } }).sort('facultyId');
  const admin = userByEmail.get('admin@bias.ac.in');

  // --- Attendance: fill only when empty (200 rows: 40 faculty x 5 days) ---
  if ((await Attendance.countDocuments()) === 0 && facultyDocs.length > 0) {
    const days = [];
    const d = new Date();
    while (days.length < 5) {
      d.setDate(d.getDate() - 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        // Normalised to UTC midnight (finding 13): seed attendance rows
        // carry a date, not a seeding-time timestamp, so IST day
        // bucketing (UTC midnight = 05:30 IST, same IST date) is stable.
        const day = new Date(d);
        day.setUTCHours(0, 0, 0, 0);
        days.push(day);
      }
    }
    const attendanceRows = [];
    for (const fac of facultyDocs) {
      for (const day of days) {
        const r = Math.random();
        attendanceRows.push({
          faculty: fac._id,
          date: day,
          status: r < 0.85 ? 'Present' : r < 0.92 ? 'Absent' : r < 0.97 ? 'Half-Day' : 'Leave',
          markedBy: admin._id,
        });
      }
    }
    try {
      await Attendance.insertMany(attendanceRows);
    } catch (e) {
      if (e.code !== 11000) throw e;
      console.warn('Seed attendance: duplicate-key (concurrent cold start) — continuing with existing rows');
    }
  }

  // --- Leaves: fill only when empty (8 sample rows) ---
  if ((await Leave.countDocuments()) === 0 && facultyDocs.length >= 36) {
    const leaveSamples = [
      { type: 'Casual', status: 'Pending', off: 3 },
      { type: 'Sick', status: 'Pending', off: 5 },
      { type: 'Earned', status: 'Approved', off: -10 },
      { type: 'Casual', status: 'Approved', off: -4 },
      { type: 'Sick', status: 'Approved', off: -2 },
      { type: 'Casual', status: 'Rejected', off: -7 },
      { type: 'Other', status: 'Pending', off: 8 },
      { type: 'Sick', status: 'Rejected', off: -12 },
    ];
    try {
      await Leave.insertMany(
      leaveSamples.map((s, i) => {
        const from = new Date();
        from.setDate(from.getDate() + s.off);
        const to = new Date(from);
        to.setDate(to.getDate() + 1);
        return {
          faculty: facultyDocs[i * 5]._id,
          type: s.type,
          fromDate: from,
          toDate: to,
          reason: 'Personal work (demo record)',
          status: s.status,
          reviewedBy: s.status === 'Pending' ? null : admin._id,
        };
      })
      );
    } catch (e) {
      if (e.code !== 11000) throw e;
      console.warn('Seed leaves: duplicate-key (concurrent cold start) — continuing with existing rows');
    }
  }

  // --- Timetable: fill only when empty (240 entries), conflict-free
  // by construction — within one day+slot, every faculty teaches at
  // most once and every classroom is used at most once. ---
  if ((await Timetable.countDocuments()) === 0 && facultyDocs.length > 0) {
    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const SLOTS = [['09:00', '10:00'], ['10:00', '11:00'], ['11:00', '12:00'], ['12:00', '13:00'], ['14:00', '15:00'], ['15:00', '16:00']];
    const ROOMS = ['LT-101', 'LT-102', 'LT-103', 'LT-104', 'LT-105', 'LT-106', 'LT-107', 'LT-108', 'LAB-1', 'LAB-2'];
    const deptCodeById = new Map([...deptByCode.values()].map((d) => [String(d._id), d.code]));
    const entries = [];
    for (const day of DAYS) {
      const shuffled = [...facultyDocs].sort(() => Math.random() - 0.5);
      for (let s = 0; s < SLOTS.length; s++) {
        const [startTime, endTime] = SLOTS[s];
        shuffled.slice(0, 8).forEach((fac, j) => {
          const code = deptCodeById.get(String(fac.department)) || 'CSE';
          entries.push({
            day,
            subject: SUBJECTS[code][(j + s) % SUBJECTS[code].length],
            faculty: fac._id,
            classroom: ROOMS[j],
            startTime,
            endTime,
            department: fac.department,
            semester: 3 + (j % 4),
            section: j % 2 === 0 ? 'A' : 'B',
          });
        });
      }
    }
    try {
      await Timetable.insertMany(entries);
    } catch (e) {
      if (e.code !== 11000) throw e;
      console.warn('Seed timetable: duplicate-key (concurrent cold start) — continuing with existing rows');
    }
  }

  const counts = {
    departments: await Department.countDocuments(),
    users: await User.countDocuments(),
    faculty: await Faculty.countDocuments(),
    attendance: await Attendance.countDocuments(),
    leaves: await Leave.countDocuments(),
    timetable: await Timetable.countDocuments(),
  };
  console.log(`Seed ensured: ${counts.departments} departments, ${counts.users} users, ${counts.faculty} faculty, ${counts.attendance} attendance rows, ${counts.leaves} leaves, ${counts.timetable} timetable entries.`);
  console.log('Demo logins (password for all: password123): admin@bias.ac.in, hod.cse@bias.ac.in, faculty01@bias.ac.in');
  return counts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await connectDB();
  await seed();
  await closeDB();
  process.exit(0);
}
