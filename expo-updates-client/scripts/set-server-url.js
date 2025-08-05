#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const environment = process.argv[2] || 'local';
const appJsonPath = path.join(__dirname, '..', 'app.json');

// Get your computer's IP address
const os = require('os');
const networkInterfaces = os.networkInterfaces();
let localIP = 'localhost';

for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
            localIP = iface.address;
            break;
        }
    }
}

const serverUrls = {
    local: 'http://localhost:3000/api/manifest',
    emulator: 'http://10.0.2.2:3000/api/manifest',
    device: `http://${localIP}:3000/api/manifest`,
    production: 'https://your-server-domain.com/api/manifest'
};

const appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
appConfig.expo.updates.url = serverUrls[environment];

fs.writeFileSync(appJsonPath, JSON.stringify(appConfig, null, 2));

console.log(`✅ Updated server URL to: ${serverUrls[environment]}`);
console.log(`📱 Environment: ${environment}`);
if (environment === 'device') {
    console.log(`🌐 Your local IP: ${localIP}`);
}