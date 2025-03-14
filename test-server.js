import fetch from 'node-fetch';

async function testServer() {
    console.log('Testing server connection...');

    try {
        // Test the status endpoint
        const statusResponse = await fetch('http://localhost:5000/api/coupons/status');
        console.log('Status endpoint response code:', statusResponse.status);

        const statusText = await statusResponse.text();
        console.log('Status endpoint raw response:', statusText);

        try {
            const statusData = JSON.parse(statusText);
            console.log('Status endpoint parsed data:', JSON.stringify(statusData, null, 2));
        } catch (e) {
            console.error('Could not parse status response as JSON:', e.message);
        }

        // Test the new test-coupon-json endpoint
        const testResponse = await fetch('http://localhost:5000/api/test-coupon-json');
        console.log('Test endpoint response code:', testResponse.status);

        const testText = await testResponse.text();
        console.log('Test endpoint raw response:', testText);

        try {
            const testData = JSON.parse(testText);
            console.log('Test endpoint parsed data:', JSON.stringify(testData, null, 2));
        } catch (e) {
            console.error('Could not parse test response as JSON:', e.message);
        }
    } catch (error) {
        console.error('Error testing server:', error);
    }
}

testServer(); 