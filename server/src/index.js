import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import { seed } from './seed.js';
import authRoutes from './routes/auth.js';
import departmentRoutes from './routes/departments.js';
import facultyRoutes from './routes/faculty.js';
import attendanceRoutes from './routes/attendance.js';
import leaveRoutes from './routes/leave.js';
import timetableRoutes from './routes/timetable.js';
import dashboardRoutes from './routes/dashboard.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/dashboard', dashboardRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Server error', detail: err.message });
});

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  // Runs on local `npm start` AND on Vercel cold start (top-level await):
  // the DB connection + first-run seeding must happen in both paths.
  // Only the HTTP listener is local-only — a Vercel serverless function
  // must never call app.listen(); Vercel invokes the exported app itself.
  await connectDB();
  // Always run the idempotent, non-destructive seed ensure: it fills any
  // gaps left by a timed-out partial run and is a fast no-op (a handful
  // of reads) when the demo data is already complete. It never wipes
  // existing data, so a partial live database heals on the next start
  // instead of being stuck forever (the old "only when User count is 0"
  // trigger never retried after a partial run).
  await seed();
  if (!process.env.VERCEL) {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  }
}

export default app;
