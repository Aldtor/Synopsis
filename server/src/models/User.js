import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'hod', 'faculty'], required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  // Skip values that are already bcrypt hashes (e.g. the seed reuses one
  // pre-computed hash for all demo users). Re-hashing a hash would make
  // the original password unverifiable. A bcrypt hash always starts
  // with $2a$ / $2b$ / $2y$ followed by the cost, so this test is safe
  // for genuine plaintext passwords.
  if (/^\$2[aby]\$\d{2}\$/.test(this.password)) return next();
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model('User', userSchema);
