import fetch from 'node-fetch';

const API_KEY = "secret-key-2026";
const BASE_URL = "http://localhost:5001"; // "https://salarysection.com";

async function testApi() {
    console.log("--- Testing External API ---");

    // 1. Test Attendance Endpoint
    try {
        console.log("\n1. Fetching Attendance Data (Feb 2026)...");
        // Test with a filter to verify
        const params = new URLSearchParams({
            month: '2',
            year: '2026',
            departmentCode: 'REG' // Test filtering by REG department
        });
        const response = await fetch(`${BASE_URL}/api/external/attendance?${params}`, {
            headers: { 'x-api-key': API_KEY }
        });

        if (response.ok) {
            const data = await response.json();
            console.log("✅ Success!");
            console.log(`   Count: ${data.meta.count}`);
            if (data.data.length > 0) {
                console.log("   Sample Record:", JSON.stringify(data.data[0], null, 2));
                // Verify filter worked
                const allReg = data.data.every(d => d.departmentCode === 'REG');
                console.log(`   Filter Check: All records are REG? ${allReg ? '✅ Yes' : '❌ No'}`);
            } else {
                console.log("   No records found for this month/filter.");
            }
        } else {
            console.log("❌ Failed:", response.status, response.statusText);
            console.log(await response.text());
        }
    } catch (err) {
        console.error("❌ Error:", err.message);
    }

    // 2. Test Employees Endpoint
    try {
        console.log("\n2. Fetching Employee List...");
        const response = await fetch(`${BASE_URL}/api/external/employees`, {
            headers: { 'x-api-key': API_KEY }
        });

        if (response.ok) {
            const data = await response.json();
            console.log("✅ Success!");
            console.log(`   Total Employees: ${data.count}`);
            if (data.data.length > 0) {
                console.log("   Sample Employee:", JSON.stringify(data.data[0], null, 2));
            }
        } else {
            console.log("❌ Failed:", response.status, response.statusText);
        }
    } catch (err) {
        console.error("❌ Error:", err.message);
    }

    // 3. Test Unauthorized Access
    try {
        console.log("\n3. Testing Unauthorized Access (No Key)...");
        const response = await fetch(`${BASE_URL}/api/external/employees`);
        if (response.status === 401) {
            console.log("✅ Correctly rejected (401 Unauthorized)");
        } else {
            console.log("❌ Unexpected status:", response.status);
        }
    } catch (err) {
        console.error("❌ Error:", err.message);
    }
}

testApi();
