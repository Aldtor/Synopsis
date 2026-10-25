import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, closeDB } from './config/db.js';
import User from './models/User.js';
import Department from './models/Department.js';
import Faculty from './models/Faculty.js';
import Attendance from './models/Attendance.js';
import Leave from './models/Leave.js';
import Timetable from './models/Timetable.js';
import ConflictLog from './models/ConflictLog.js';

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

export async function seed() {
  // Clear per collection instead of dropDatabase(): the Atlas DB user
  // (readWriteAnyDatabase) is not allowed to drop the database, but
  // deleteMany on each collection is permitted and sufficient here,
  // since seed() only runs when the User collection is empty.
  await User.deleteMany({});
  await Department.deleteMany({});
  await Faculty.deleteMany({});
  await Attendance.deleteMany({});
  await Leave.deleteMany({});
  await Timetable.deleteMany({});
  await ConflictLog.deleteMany({});

  const admin = await User.create({ name: 'System Administrator', email: 'admin@bias.ac.in', password: PASSWORD, role: 'admin' });

  const deptDocs = {};
  for (const d of DEPARTMENTS) {
    const hodUser = await User.create({
      name: `HOD ${d.code}`,
      email: `hod.${d.code.toLowerCase()}@bias.ac.in`,
      password: PASSWORD,
      role: 'hod',
    });
    const dept = await Department.create({ ...d, hod: hodUser._id });
    hodUser.department = dept._id;
    await hodUser.save();
    deptDocs[d.code] = dept;
  }

  // 40 fictional faculty profiles (synopsis methodology: 30-50 records).
  const facultyDocs = [];
  for (let i = 0; i < NAMES.length; i++) {
    const code = DEPARTMENTS[i % DEPARTMENTS.length].code;
    const dept = deptDocs[code];
    const user = await User.create({
      name: NAMES[i],
      email: `faculty${String(i + 1).padStart(2, '0')}@bias.ac.in`,
      password: PASSWORD,
      role: 'faculty',
      department: dept._id,
    });
    const profile = await Faculty.create({
      facultyId: `FAC${String(i + 1).padStart(3, '0')}`,
      user: user._id,
      department: dept._id,
      designation: DESIGNATIONS[i % DESIGNATIONS.length],
      qualification: QUALIFICATIONS[i % QUALIFICATIONS.length],
      phone: `98${String(10000000 + i * 137).slice(0, 8)}`,
      subjects: [SUBJECTS[code][i % SUBJECTS[code].length]],
      joiningDate: new Date(2015 + (i % 9), i % 12, 1),
    });
    facultyDocs.push(profile);
  }

  // Attendance for the last 5 weekdays (mostly Present).
  const days = [];
  const d = new Date();
  while (days.length < 5) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(new Date(d));
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
  await Attendance.insertMany(attendanceRows);

  // Sample leave requests in every state.
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
  for (let i = 0; i < leaveSamples.length; i++) {
    const s = leaveSamples[i];
    const from = new Date();
    from.setDate(from.getDate() + s.off);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    await Leave.create({
      faculty: facultyDocs[i * 5]._id,
      type: s.type,
      fromDate: from,
      toDate: to,
      reason: 'Personal work (demo record)',
      status: s.status,
      reviewedBy: s.status === 'Pending' ? null : admin._id,
    });
  }

  // Timetable: conflict-free by construction — within one day+slot, every
  // faculty teaches at most once and every classroom is used at most once.
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const SLOTS = [['09:00', '10:00'], ['10:00', '11:00'], ['11:00', '12:00'], ['12:00', '13:00'], ['14:00', '15:00'], ['15:00', '16:00']];
  const ROOMS = ['LT-101', 'LT-102', 'LT-103', 'LT-104', 'LT-105', 'LT-106', 'LT-107', 'LT-108', 'LAB-1', 'LAB-2'];
  const entries = [];
  for (const day of DAYS) {
    const shuffled = [...facultyDocs].sort(() => Math.random() - 0.5);
    for (let s = 0; s < SLOTS.length; s++) {
      const [startTime, endTime] = SLOTS[s];
      shuffled.slice(0, 8).forEach((fac, j) => {
        const code = DEPARTMENTS.find((x) => String(deptDocs[x.code]._id) === String(fac.department))?.code || 'CSE';
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
  await Timetable.insertMany(entries);

  console.log(`Seeded: ${Object.keys(deptDocs).length} departments, ${facultyDocs.length} faculty, ${attendanceRows.length} attendance rows, ${entries.length} timetable entries.`);
  console.log('Demo logins (password for all: password123): admin@bias.ac.in, hod.cse@bias.ac.in, faculty01@bias.ac.in');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await connectDB();
  await seed();
  await closeDB();
  process.exit(0);
}
