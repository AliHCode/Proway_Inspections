const fs = require('fs');

const env = fs.readFileSync('.env', 'utf-8');
const match = env.match(/VITE_VAPID_PUBLIC_KEY=(.*)/);

if (!match) {
    console.log("No VAPID key found in .env");
    process.exit(1);
}

const rawKey = match[1].trim();
console.log(`Raw key string from .env: "${rawKey}"`);
console.log(`Length: ${rawKey.length}`);

// Web decode equivalent
const base64String = rawKey;
const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
console.log(`Padded/Cleaned: ${base64}`);

const buffer = Buffer.from(base64, 'base64');
console.log(`Byte Length: ${buffer.length} bytes`);
console.log(`First byte: 0x${buffer[0].toString(16)} (Should be 0x04)`);

if (buffer.length !== 65 || buffer[0] !== 0x04) {
    console.error("INVALID VAPID PUBLIC KEY! Must be 65 bytes starting with 0x04.");
} else {
    console.log("Key is structurally valid!");
}
