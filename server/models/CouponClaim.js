import mongoose from 'mongoose';

const couponClaimSchema = new mongoose.Schema({
  ipAddress: {
    type: String,
    required: true,
  },
  sessionId: {
    type: String,
    required: true,
  },
  couponId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    required: true,
  },
  claimedAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('CouponClaim', couponClaimSchema);