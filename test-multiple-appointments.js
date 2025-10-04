// Test script for the new multiple appointments workflow
// This simulates what operations.html will send

const testData = {
    appointments: [
        {
            id: "test-apt-1",
            appointmentDateTime: "2025-01-27T14:00:00.000Z",
            pickupTime: "2025-01-27T13:40:00.000Z",
            dropOffTime: "2025-01-27T16:00:00.000Z",
            location: "Test Location 1",
            locationAddress: "123 Test St, Halifax, NS",
            status: "confirmed",
            driver_assigned: 11,
            appointmentLength: 120,
            transitTime: 20,
            notes: "Test appointment 1",
            customRate: null
        },
        {
            id: "test-apt-2", 
            appointmentDateTime: "2025-01-27T15:00:00.000Z",
            pickupTime: "2025-01-27T14:40:00.000Z",
            dropOffTime: "2025-01-27T17:00:00.000Z",
            location: "Test Location 2",
            locationAddress: "456 Test Ave, Halifax, NS",
            status: "confirmed",
            driver_assigned: 12,
            appointmentLength: 90,
            transitTime: 15,
            notes: "Test appointment 2",
            customRate: 25.50
        }
    ]
};

// Function to test the workflow
async function testMultipleAppointmentsWorkflow() {
    const webhookUrl = 'https://webhook-processor-production-3bb8.up.railway.app/webhook/update-multiple-appointments-with-calendar';
    
    try {
        console.log('Testing multiple appointments workflow...');
        console.log('Sending data:', JSON.stringify(testData, null, 2));
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testData)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Success! Response:', JSON.stringify(result, null, 2));
            
            // Display key metrics
            if (result.results) {
                console.log(`\n📊 Results Summary:`);
                console.log(`- Total processed: ${result.results.total}`);
                console.log(`- Successful: ${result.results.successful}`);
                console.log(`- Failed: ${result.results.failed}`);
                console.log(`- Success rate: ${result.results.successRate}%`);
            }
            
            if (result.calendarOperations && result.calendarOperations.stats) {
                const stats = result.calendarOperations.stats;
                console.log(`\n📅 Calendar Operations:`);
                console.log(`- Created: ${stats.created}`);
                console.log(`- Updated: ${stats.updated}`);
                console.log(`- Deleted: ${stats.deleted}`);
                console.log(`- Errors: ${stats.errors}`);
            }
            
        } else {
            console.error('❌ HTTP Error:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('Error details:', errorText);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testMultipleAppointmentsWorkflow();
