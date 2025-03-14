import dotenv from 'dotenv';
import Stripe from 'stripe';

// Initialize environment variables
dotenv.config();

// Initialize Stripe with the API key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_tR3PYbcVNZZ796tH88S4VQ2u');

async function testStripe() {
    try {
        console.log('Testing Stripe connection...');
        console.log('API Key:', process.env.STRIPE_SECRET_KEY ? 'Key is set' : 'Key is missing');

        // Try to create a coupon
        const couponId = 'TEST_' + Date.now();
        console.log('Attempting to create coupon with ID:', couponId);

        const coupon = await stripe.coupons.create({
            duration: 'once',
            percent_off: 25,
            id: couponId
        });

        console.log('Coupon created successfully:', coupon.id);
        console.log('Coupon details:', JSON.stringify(coupon, null, 2));

        // List existing coupons
        console.log('Listing existing coupons:');
        const coupons = await stripe.coupons.list({ limit: 5 });
        console.log('Found', coupons.data.length, 'coupons');
        coupons.data.forEach(c => console.log(' -', c.id));

    } catch (error) {
        console.error('Stripe error:');
        console.error('  Message:', error.message);
        console.error('  Type:', error.type);
        console.error('  Code:', error.code);
        console.error('  StatusCode:', error.statusCode);
        if (error.raw) {
            console.error('  Raw error:', error.raw);
        }
    }
}

// Run the test
testStripe().then(() => {
    console.log('Test completed');
}).catch(err => {
    console.error('Unhandled error:', err);
}); 