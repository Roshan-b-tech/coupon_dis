import fetch from 'node-fetch';

async function testEndpoint() {
    try {
        console.log('Testing endpoint...');

        const response = await fetch('http://localhost:5000/api/test-coupon');
        console.log('Response status:', response.status);

        const responseText = await response.text();
        console.log('Response body:', responseText);

        try {
            const data = JSON.parse(responseText);
            console.log('Parsed response:', data);
        } catch (parseError) {
            console.error('Error parsing JSON response:', parseError);
        }

    } catch (error) {
        console.error('Error testing endpoint:', error);
    }
}

testEndpoint().catch(console.error); 