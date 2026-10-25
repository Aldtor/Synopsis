import express from 'express';
import Department from '../models/Department.js';
import Faculty from '../models/Faculty.js';
import { protect, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/', async (req, res) => {
  const depts = await Department.find().populate('hod', 'name email').sort('name');
  const counts = await Faculty.aggregate([{ $group: { _id: '$department', count: { $sum: 1 } } }]);
  const countByDept = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  res.json(depts.map((d) => ({ ...d.toObject(), facultyCount: countByDept[String(d._id)] || 0 })));
});

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const dept = await Department.create(req.body);
    res.status(201).json(dept);
  } catch (err) {
    res.status(400).json({ message: err.code === 11000 ? 'Department name/code already exists' : err.message });
  }
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  const dept = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!dept) return res.status(404).json({ message: 'Department not found' });
  res.json(dept);
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const inUse = await Faculty.countDocuments({ department: req.params.id });
  if (inUse > 0) return res.status(400).json({ message: `Cannot delete: ${inUse} faculty belong to this department` });
  const dept = await Department.findByIdAndDelete(req.params.id);
  if (!dept) return res.status(404).json({ message: 'Department not found' });
  res.json({ message: 'Department deleted' });
});

export default router;
