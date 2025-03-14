import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
  },
  description: {
    type: String,
    required: true,
  },
  discount: {
    type: Number,
    required: true,
  },
  isAssigned: {
    type: Boolean,
    default: false,
  },
  assignedAt: {
    type: Date,
  },
  claimedBy: [{
    ipAddress: String,
    sessionId: String,
    claimedAt: Date
  }]
});

export default mongoose.model('Coupon', couponSchema);