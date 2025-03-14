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
  lastAssignedAt: {
    type: Date,
    default: null
  }
});

export default mongoose.model('Coupon', couponSchema);