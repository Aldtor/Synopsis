import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Faculty from '../models/Faculty.js';
import Department from '../models/Department.js';
import { protect, requireRole } from '../middleware/auth.js';
import { getJwtSecret } from '../utils/jwtSecret.js';
import { loginLimiter } from '../utils/rateLimit.js';
import { handleRouteError } from '../utils/validation.js';

const router = express.Router();
// Default token expiry is 1 day (F9); JWT_EXPIRES_IN still overrides it.
// No refresh-token flow and no httpOnly-cookie migration were built
// (out of scope — future options, see the report).
const signToken = (id) =>
  jwt.sign({ id }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });

// POST /api/auth/login — rate-limited (F11).
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password').populate('department', 'name code');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    // F10: inactive accounts cannot log in, checked after the password.
    if (!user.active) {
      return res.status(401).json({ message: 'Account is inactive' });
    }
    const profile = user.role === 'faculty' ? await Faculty.findOne({ user: user._id }) : null;
    res.json({
      token: signToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        facultyId: profile?._id || null,
      },
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// POST /api/auth/register (admin only — creates a login account only;
// it never creates a faculty profile).
router.post('/register', protect, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role, department } = req.body;
    // F12: the faculty role must go through POST /api/faculty, which
    // creates the profile together with the account; register alone
    // would leave a profile-less faculty user.
    if (role === 'faculty') {
      return res.status(400).json({ message: 'Faculty accounts must be created via POST /api/faculty, not register' });
    }
    // F12: a HOD requires a valid department.
    let deptId = null;
    if (role === 'hod') {
      if (!department) return res.status(400).json({ message: 'Department is required for HOD accounts' });
      const dept = await Department.findById(department);
      if (!dept) return res.status(404).json({ message: 'Department not found' });
      deptId = dept._id;
    }
    const user = await User.create({ name, email, password, role, department: deptId });
    res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    if (err && err.code === 11000) return res.status(400).json({ message: 'Email already registered' });
    handleRouteError(res, err);
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('department', 'name code');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const profile = user.role === 'faculty' ? await Faculty.findOne({ user: user._id }) : null;
    res.json({ ...user.toObject(), facultyId: profile?._id || null });
  } catch (err) {
    handleRouteError(res, err);
  }
});

export default router;
