import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Initialize environment variables
dotenv.config();

const API_URL = process.env.VITE_API_URL || 'http://localhost:5000';

async function testAPI() {
    try {
        console.log('Testing API connection...');
        console.log('API URL:', API_URL);

        // Create a session ID
        const sessionId = 'test_session_' + Date.now();
        console.log('Using session ID:', sessionId);

        // Try to claim a coupon
        console.log('Attempting to claim a coupon...');

        const response = await fetch(`${API_URL}/api/coupons/next`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Cookie': `sessionId=${sessionId}`
            }
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers.raw());

        const responseText = await response.text();
        console.log('Response body:', responseText);

        try {
            const data = JSON.parse(responseText);
            console.log('Parsed response:', data);
        } catch (parseError) {
            console.error('Error parsing JSON response:', parseError);
        }

    } catch (error) {
        console.error('API error:');
        console.error('  Message:', error.message);
        console.error('  Stack:', error.stack);
    }
}

// Run the test
testAPI().then(() => {
    console.log('Test completed');
}).catch(err => {
    console.error('Unhandled error:', err);
}); 