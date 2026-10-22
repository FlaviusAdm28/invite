// Creates a self-signed certificate in .cert/ for HTTPS on the home network
// (phones only expose the gyroscope to secure pages). Requires openssl (ships with Git for Windows).
// Usage: npm run cert
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = path.join(__dirname, '..', '.cert');
fs.mkdirSync(dir, { recursive: true });

const ips = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4')
  .map((a) => a.address);
const san = ['DNS:localhost', ...ips.map((ip) => `IP:${ip}`)].join(',');

execFileSync('openssl', [
  'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825', '-sha256',
  '-keyout', path.join(dir, 'key.pem'),
  '-out', path.join(dir, 'cert.pem'),
  '-subj', '/CN=Raquel & Flavio (local)',
  '-addext', `subjectAltName=${san}`,
  '-addext', 'basicConstraints=critical,CA:TRUE',
  '-addext', 'extendedKeyUsage=serverAuth',
], { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });

console.log(`Certificado criado em .cert/ para: ${san}`);
