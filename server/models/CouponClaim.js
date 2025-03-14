import mongoose from 'mongoose';

const couponClaimSchema = new mongoose.Schema({
  ipAddress: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: function (v) {
        return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(v) || // IPv4
          /^[0-9a-fA-F:]+$/.test(v);                    // IPv6
      },
      message: props => `${props.value} is not a valid IP address!`
    }
  },
  sessionId: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: function (v) {
        return /^[a-zA-Z0-9]+$/.test(v);
      },
      message: props => `${props.value} is not a valid session ID!`
    }
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
couponClaimSchema.index({ sessionId: 1, claimedAt: -1 });
couponClaimSchema.index({ ipAddress: 1, claimedAt: -1 });
couponClaimSchema.index({ couponId: 1, claimedAt: -1 });

// Add method to check if claim is recent
couponClaimSchema.methods.isRecent = function () {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return this.claimedAt > oneHourAgo;
};

// Add pre-save middleware to validate claim
couponClaimSchema.pre('save', async function (next) {
  try {
    // Check if this is a new claim
    if (this.isNew) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentClaim = await this.constructor.findOne({
        $or: [
          { sessionId: this.sessionId },
          { ipAddress: this.ipAddress }
        ],
        claimedAt: { $gt: oneHourAgo }
      });

      if (recentClaim) {
        throw new Error('You can only claim one coupon per hour');
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

export default mongoose.model('CouponClaim', couponClaimSchema);