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
  }
}, {
  timestamps: true
});

// Add static method to find available coupons
couponSchema.statics.findAvailable = function () {
  return this.find();
};

export default mongoose.model('Coupon', couponSchema);