import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Initialize environment variables
dotenv.config();

// Define a simple coupon schema
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

async function createSimpleCoupon() {
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

        // Create a simple coupon
        const coupon = new Coupon({
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

        await coupon.save();
        console.log('Coupon created successfully:', coupon);

    } catch (error) {
        console.error('Error creating coupon:', error);
    } finally {
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
    }
}

createSimpleCoupon().catch(console.error); 