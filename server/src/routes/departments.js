import express from 'express';
import Department from '../models/Department.js';
import Faculty from '../models/Faculty.js';
import { protect, requireRole } from '../middleware/auth.js';
import { handleRouteError } from '../utils/validation.js';

const router = express.Router();
router.use(protect);

const DEPARTMENT_FIELDS = ['name', 'code', 'hod'];
const pickFields = (body) => Object.fromEntries(Object.entries(body || {}).filter(([k]) => DEPARTMENT_FIELDS.includes(k)));

router.get('/', async (req, res) => {
  try {
    const depts = await Department.find().populate('hod', 'name email').sort('name');
    const counts = await Faculty.aggregate([{ $group: { _id: '$department', count: { $sum: 1 } } }]);
    const countByDept = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
    res.json(depts.map((d) => ({ ...d.toObject(), facultyCount: countByDept[String(d._id)] || 0 })));
  } catch (err) {
    handleRouteError(res, err);
  }
});

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    // Whitelisted fields only — no client-supplied _id or extra fields.
    const dept = await Department.create(pickFields(req.body));
    res.status(201).json(dept);
  } catch (err) {
    if (err && err.code === 11000) return res.status(400).json({ message: 'Department name/code already exists' });
    handleRouteError(res, err);
  }
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const dept = await Department.findByIdAndUpdate(req.params.id, pickFields(req.body), { new: true, runValidators: true });
    if (!dept) return res.status(404).json({ message: 'Department not found' });
    res.json(dept);
  } catch (err) {
    if (err && err.code === 11000) return res.status(400).json({ message: 'Department name/code already exists' });
    handleRouteError(res, err);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const inUse = await Faculty.countDocuments({ department: req.params.id });
    if (inUse > 0) return res.status(400).json({ message: `Cannot delete: ${inUse} faculty belong to this department` });
    const dept = await Department.findByIdAndDelete(req.params.id);
    if (!dept) return res.status(404).json({ message: 'Department not found' });
    res.json({ message: 'Department deleted' });
  } catch (err) {
    handleRouteError(res, err);
  }
});

export default router;
