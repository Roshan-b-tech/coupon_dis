import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Coupon from './server/models/Coupon.js';
import CouponClaim from './server/models/CouponClaim.js';

// Initialize environment variables
dotenv.config();

async function testDatabase() {
    try {
        console.log('Testing database connection...');
        console.log('MongoDB URI:', process.env.MONGODB_URI ? 'URI is set' : 'URI is missing');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Create a test coupon
        console.log('Creating test coupon...');
        const testCoupon = await Coupon.createTestCoupon();
        console.log('Test coupon created:', testCoupon._id);
        console.log('Coupon details:', JSON.stringify(testCoupon, null, 2));

        // Find available coupons
        console.log('Finding available coupons...');
        const availableCoupons = await Coupon.findAvailable();
        console.log('Found', availableCoupons.length, 'available coupons');

        // Get the first available coupon
        if (availableCoupons.length > 0) {
            const coupon = availableCoupons[0];
            console.log('First available coupon:', coupon._id);
            console.log('Coupon details:', JSON.stringify(coupon, null, 2));

            // Create a claim for this coupon
            console.log('Creating claim for coupon...');
            const claim = await CouponClaim.create({
                sessionId: 'test_session_' + Date.now(),
                ipAddress: '127.0.0.1',
                couponId: coupon._id,
                claimedAt: new Date()
            });
            console.log('Claim created:', claim._id);

            // Increment redemption count
            await coupon.incrementRedemptions();
            console.log('Redemption count incremented to:', coupon.timesRedeemed);
        }

    } catch (error) {
        console.error('Database error:');
        console.error('  Message:', error.message);
        console.error('  Stack:', error.stack);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
    }
}

// Run the test
testDatabase().then(() => {
    console.log('Test completed');
}).catch(err => {
    console.error('Unhandled error:', err);
}); 