import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Initialize environment variables
dotenv.config();

// Define the coupon schema
const couponSchema = new mongoose.Schema({
    code: String,
    description: String,
    discount: Number,
    stripeId: String,
    expiresAt: Date,
    duration: String,
    duration_in_months: Number,
    maxRedemptions: Number,
    timesRedeemed: Number,
    active: Boolean
}, {
    timestamps: true
});

const Coupon = mongoose.model('Coupon', couponSchema);

async function fixCoupon() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000
        });
        console.log('Connected to MongoDB');

        // Find the SAVE10 coupon
        const coupon = await Coupon.findOne({ code: 'SAVE10' });

        if (!coupon) {
            console.log('SAVE10 coupon not found, creating it...');

            // Create a new coupon
            const newCoupon = new Coupon({
                code: 'SAVE10',
                description: 'Save 10% on your purchase',
                discount: 10,
                stripeId: 'SAVE10',
                expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
                duration: 'once',
                duration_in_months: null,
                maxRedemptions: 100,
                timesRedeemed: 0,
                active: true
            });

            await newCoupon.save();
            console.log('New SAVE10 coupon created:', newCoupon);
        } else {
            console.log('Found existing SAVE10 coupon:', coupon);

            // Update the coupon with all required fields
            coupon.description = 'Save 10% on your purchase';
            coupon.discount = 10;
            coupon.expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
            coupon.duration = 'once';
            coupon.duration_in_months = null;
            coupon.maxRedemptions = 100;
            coupon.timesRedeemed = 0;
            coupon.active = true;

            await coupon.save();
            console.log('Updated SAVE10 coupon:', coupon);
        }

        // List all coupons
        const allCoupons = await Coupon.find();
        console.log('All coupons in database:');
        allCoupons.forEach(c => console.log(` - ${c.code}: ${c.description}, ${c.discount}%, expires: ${c.expiresAt}`));

    } catch (error) {
        console.error('Error fixing coupon:', error);
    } finally {
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
    }
}

fixCoupon().catch(console.error); 