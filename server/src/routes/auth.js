import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Faculty from '../models/Faculty.js';
import { protect, requireRole } from '../middleware/auth.js';

const router = express.Router();
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET || 'change-this-secret-in-production', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password').populate('department', 'name code');
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: 'Invalid email or password' });
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
});

// POST /api/auth/register (admin only — creates a login account)
router.post('/register', protect, requireRole('admin'), async (req, res) => {
  const { name, email, password, role, department } = req.body;
  try {
    const user = await User.create({ name, email, password, role, department: department || null });
    res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    res.status(400).json({ message: err.code === 11000 ? 'Email already registered' : err.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user._id).populate('department', 'name code');
  const profile = user.role === 'faculty' ? await Faculty.findOne({ user: user._id }) : null;
  res.json({ ...user.toObject(), facultyId: profile?._id || null });
});

export default router;
