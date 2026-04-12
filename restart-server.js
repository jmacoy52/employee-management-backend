const { exec } = require('child_process');
const path = require('path');

console.log('Restarting server...');

// Kill existing node processes and start new server
exec('taskkill /F /IM node.exe && node server.js', 
  { cwd: __dirname },
  (error, stdout, stderr) => {
    if (error) {
      console.error('Error restarting server:', error);
      return;
    }
    console.log('Server restarted successfully');
  }
);
