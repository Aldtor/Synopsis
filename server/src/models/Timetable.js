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

// DB-layer race guard (finding 1), exact-slot scope only.
// The seed is conflict-free by construction: within one day+slot every
// faculty teaches at most once and every classroom (ROOMS[j], j distinct
// per slot) is used at most once, so no seed row violates these indexes.
// They turn a lost race between two concurrent identical inserts into a
// duplicate-key error, which the routes map to 409 — they do NOT cover
// partially-overlapping intervals (e.g. 09:30-10:30 vs 09:00-10:00),
// which MongoDB cannot express as a unique constraint; those still rely
// on pre-validation in findConflicts/validateBatch. See the report for
// the resulting PARTIAL status of finding 1.
timetableSchema.index({ day: 1, faculty: 1, startTime: 1, endTime: 1 }, { unique: true });
timetableSchema.index({ day: 1, classroom: 1, startTime: 1, endTime: 1 }, { unique: true });

export default mongoose.model('Timetable', timetableSchema);
