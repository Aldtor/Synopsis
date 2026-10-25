import express from 'express';
import User from '../models/User.js';
import Faculty from '../models/Faculty.js';
import { protect, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

const populate = (q) => q.populate('department', 'name code').populate('user', 'name email role');

// HODs only see their own department; faculty see only themselves in the list.
function listFilter(req) {
  if (req.user.role === 'hod') return { department: req.user.department };
  return {};
}

router.get('/', async (req, res) => {
  if (req.user.role === 'faculty') {
    const mine = await Faculty.findOne({ user: req.user._id });
    return res.json(mine ? [await populate(Faculty.findById(mine._id))] : []);
  }
  const faculty = await populate(Faculty.find(listFilter(req)).sort('facultyId'));
  res.json(faculty);
});

router.get('/me', async (req, res) => {
  const mine = await populate(Faculty.findOne({ user: req.user._id }));
  if (!mine) return res.status(404).json({ message: 'No faculty profile for this account' });
  res.json(mine);
});

// Admin creates a faculty member (login account + profile in one call).
router.post('/', requireRole('admin'), async (req, res) => {
  const { name, email, password, facultyId, department, designation, qualification, phone, subjects, joiningDate } = req.body;
  try {
    const user = await User.create({ name, email, password: password || 'password123', role: 'faculty', department });
    const profile = await Faculty.create({
      facultyId, user: user._id, department, designation, qualification, phone,
      subjects: subjects || [], joiningDate: joiningDate || null,
    });
    res.status(201).json(await populate(Faculty.findById(profile._id)));
  } catch (err) {
    await User.findOneAndDelete({ email });
    res.status(400).json({ message: err.code === 11000 ? 'Faculty ID or email already exists' : err.message });
  }
});

router.put('/:id', async (req, res) => {
  const profile = await Faculty.findById(req.params.id);
  if (!profile) return res.status(404).json({ message: 'Faculty not found' });
  const isSelf = String(profile.user) === String(req.user._id);
  const isAdmin = req.user.role === 'admin';
  const isOwnHod = req.user.role === 'hod' && String(profile.department) === String(req.user.department);
  if (!isAdmin && !isOwnHod && !isSelf) return res.status(403).json({ message: 'Forbidden' });
  const allowed = isSelf && !isAdmin
    ? ['phone', 'qualification']
    : ['designation', 'qualification', 'phone', 'subjects', 'department', 'joiningDate'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  Object.assign(profile, updates);
  await profile.save();
  res.json(await populate(Faculty.findById(profile._id)));
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const profile = await Faculty.findByIdAndDelete(req.params.id);
  if (!profile) return res.status(404).json({ message: 'Faculty not found' });
  await User.findByIdAndDelete(profile.user);
  res.json({ message: 'Faculty deleted' });
});

export default router;
