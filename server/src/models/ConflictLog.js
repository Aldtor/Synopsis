import mongoose from 'mongoose';

// Every timetable entry the conflict detector blocks is logged here so the
// dashboard can report "conflicts prevented" (an evaluation metric in the
// synopsis: conflict detection accuracy / false positives / false negatives).
const conflictLogSchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    subject: { type: String, required: true },
    faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty', required: true },
    classroom: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    conflictsWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Timetable' }],
    reason: { type: String, required: true },
    attemptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export default mongoose.model('ConflictLog', conflictLogSchema);
