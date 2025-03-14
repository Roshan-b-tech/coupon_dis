import mongoose from 'mongoose';

const couponClaimSchema = new mongoose.Schema({
  ipAddress: {
    type: String,
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  couponId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    required: true,
    index: true
  },
  claimedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Add compound indexes for common queries
couponClaimSchema.index({ ipAddress: 1, claimedAt: -1 });
couponClaimSchema.index({ sessionId: 1, claimedAt: -1 });

// Add method to check if claim is recent
couponClaimSchema.methods.isRecent = function () {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return this.claimedAt > oneHourAgo;
};

export default mongoose.model('CouponClaim', couponClaimSchema);