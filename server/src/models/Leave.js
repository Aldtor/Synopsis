import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema(
  {
    faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty', required: true },
    type: {
      type: String,
      enum: ['Casual', 'Sick', 'Earned', 'Maternity', 'Other'],
      required: true,
    },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    remarks: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Leave', leaveSchema);
