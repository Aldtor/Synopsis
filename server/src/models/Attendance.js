import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty', required: true },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Leave', 'Half-Day'],
      required: true,
    },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    remarks: { type: String, default: '' },
  },
  { timestamps: true }
);

// One attendance record per faculty per day.
attendanceSchema.index({ faculty: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);
