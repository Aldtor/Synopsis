import mongoose from 'mongoose';

const timetableSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      required: true,
    },
    subject: { type: String, required: true, trim: true },
    faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty', required: true },
    classroom: { type: String, required: true, trim: true },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    semester: { type: Number, min: 1, max: 8, required: true },
    section: { type: String, default: 'A', trim: true },
  },
  { timestamps: true }
);

export default mongoose.model('Timetable', timetableSchema);
