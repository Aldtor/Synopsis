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
import { isProductionDeployment } from './utils/jwtSecret.js';
import { globalLimiter } from './utils/rateLimit.js';
import { friendlyValidationMessage, errorStatus } from './utils/validation.js';

// F8: fail fast at startup in a production/Vercel deployment when no
// JWT secret is configured — never fall back to a shipped secret.
// Project history records the secret as set on Vercel, so this check
// must not break the live deployment; it only fires if it is missing.
if (isProductionDeployment() && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set for this deployment');
}

const app = express();
app.use(cors());
app.use(express.json());
// Modest global rate limit (F11); login has its own stricter limiter.
app.use(globalLimiter);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Error middleware: log server-side, return a generic message ONLY —
// never raw Mongoose/Mongo/CastError text. Validation-like errors map
// to 400 with a friendly message; everything else is a 500.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(errorStatus(err)).json({ message: friendlyValidationMessage(err) });
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
