import mongoose from 'mongoose';

const facultySchema = new mongoose.Schema(
  {
    facultyId: { type: String, required: true, unique: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    designation: {
      type: String,
      enum: ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer'],
      required: true,
    },
    qualification: { type: String, default: '' },
    phone: { type: String, default: '' },
    subjects: [{ type: String, trim: true }],
    joiningDate: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('Faculty', facultySchema);
