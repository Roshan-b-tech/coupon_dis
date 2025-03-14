import fetch from 'node-fetch';

async function getCouponStatus() {
    const response = await fetch('http://localhost:5000/api/coupons/status');
    return await response.json();
}

async function claimCoupon() {
    const response = await fetch('http://localhost:5000/api/coupons/next', {
        credentials: 'include',
        headers: {
            'Cookie': `sessionId=${Math.random().toString(36).substring(2)}` // Simulate different users
        }
    });
    return await response.json();
}

async function testDistribution() {
    console.log('Initial coupon status:');
    console.log(await getCouponStatus());

    console.log('\nClaiming coupons sequentially:');
    for (let i = 0; i < 7; i++) {
        const result = await claimCoupon();
        console.log(`Claim ${i + 1}:`, result);

        // Wait a bit between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\nFinal coupon status:');
    console.log(await getCouponStatus());
}

testDistribution().catch(console.error); 