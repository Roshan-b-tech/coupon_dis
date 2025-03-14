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
  active: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
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

export default mongoose.model('Coupon', couponSchema);