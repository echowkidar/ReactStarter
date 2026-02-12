
import http from 'http';

function checkPort(port) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: port,
            path: '/api/departments?showAll=true',
            method: 'GET',
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ port, status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ port, status: res.statusCode, data: data.substring(0, 100) });
                }
            });
        });

        req.on('error', (e) => {
            resolve({ port, error: e.message });
        });

        req.end();
    });
}

async function main() {
    const ports = [5000, 5001, 3000];
    for (const port of ports) {
        console.log(`Checking port ${port}...`);
        const result = await checkPort(port);
        if (!result.error && result.status === 200) {
            console.log(`Success on port ${port}!`);
            // check if array
            if (Array.isArray(result.data) && result.data.length > 0) {
                console.log('First department sample:', result.data[0]);
            } else {
                console.log('Data:', result.data);
            }
            return;
        } else {
            console.log(`Failed on port ${port}:`, result.error || result.status);
        }
    }
}

main();
