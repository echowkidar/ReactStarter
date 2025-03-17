// Socket connection test for database connectivity
const { Socket } = require('net');

// Export a function that tests direct socket connection to the database
module.exports = function testSocketConnection() {
  return new Promise((resolve, reject) => {
    console.log('Testing direct socket connection to database...');
    
    const socket = new Socket();
    socket.setTimeout(10000); // 10 second timeout
    
    // Extract host and port from DATABASE_URL
    let host = '68.183.82.222'; // Default
    let port = 5432; // Default PostgreSQL port
    
    if (process.env.DATABASE_URL) {
      try {
        const connectionParts = process.env.DATABASE_URL.split('@');
        const hostPortPart = connectionParts[1]?.split('/')[0];
        if (hostPortPart) {
          const [hostPart, portPart] = hostPortPart.split(':');
          if (hostPart) host = hostPart;
          if (portPart) port = parseInt(portPart, 10);
        }
      } catch (error) {
        console.error('Error parsing DATABASE_URL for socket test:', error);
      }
    }
    
    console.log(`Attempting socket connection to ${host}:${port}...`);
    
    // Connection events
    socket.connect(port, host, () => {
      console.log('Socket connected successfully!');
      socket.end();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      console.log('Socket connection timed out');
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', (err) => {
      console.log('Socket connection error:', err.message);
      resolve(false);
    });
    
    socket.on('close', (hadError) => {
      console.log(`Socket connection closed${hadError ? ' with error' : ''}`);
    });
  });
}; 