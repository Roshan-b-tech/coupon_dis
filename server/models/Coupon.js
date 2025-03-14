import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  description: {
    type: String,
    required: true,
  },
  discount: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  stripeId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  duration: {
    type: String,
    required: true,
    enum: ['once', 'repeating', 'forever'],
    default: 'repeating'
  },
  duration_in_months: {
    type: Number,
    required: function () {
      return this.duration === 'repeating';
    },
    default: 3
  },
  maxRedemptions: {
    type: Number,
    default: null
  },
  timesRedeemed: {
    type: Number,
    default: 0
  },
  claimedBy: {
    type: String,
    default: null,
    index: true
  },
  claimedAt: {
    type: Date,
    default: null
  },
  active: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add static method to find available coupons
couponSchema.statics.findAvailable = function () {
  return this.find({
    expiresAt: { $gt: new Date() },
    active: true,
    $or: [
      { maxRedemptions: null },
      { $expr: { $lt: ['$timesRedeemed', '$maxRedemptions'] } }
    ]
  }).sort({ createdAt: -1 });
};

// Add method to check if coupon is expired
couponSchema.methods.isExpired = function () {
  return this.expiresAt < new Date();
};

// Add method to check if coupon is valid
couponSchema.methods.isValid = function () {
  if (!this.active) return false;
  if (this.isExpired()) return false;
  if (this.maxRedemptions && this.timesRedeemed >= this.maxRedemptions) return false;
  return true;
};

// Add method to increment redemption count
couponSchema.methods.incrementRedemptions = async function () {
  this.timesRedeemed += 1;
  if (this.maxRedemptions && this.timesRedeemed >= this.maxRedemptions) {
    this.active = false;
  }
  return this.save();
};

// Add a method to create a simple coupon for testing
couponSchema.statics.createTestCoupon = async function () {
  const code = 'TEST_' + Date.now();
  const coupon = new this({
    code,
    description: 'Test coupon',
    discount: 25,
    stripeId: code,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    duration: 'once',
    maxRedemptions: 100,
    timesRedeemed: 0,
    active: true
  });
  await coupon.save();
  return coupon;
};

export default mongoose.model('Coupon', couponSchema);