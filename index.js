// Minimal static server for local preview: `npm start`
//   http://localhost:5173  — and on the home network via this machine's IP
//   https://<ip>:5174      — when .cert/ exists (npm run cert); needed on phones for the gyroscope
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT) || 5173;
const securePort = Number(process.env.HTTPS_PORT) || 5174;
const certDir = path.join(root, '.cert');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const allowed = /^\/(index\.html|manifest\.webmanifest|src\/[\w.-]+|media\/web\/[\w.-]+\.(jpg|png|mp4))$/;

function handler(req, res) {
  let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/') url = '/index.html';
  if (!allowed.test(url)) {
    res.writeHead(404).end('Not found');
    return;
  }
  const file = path.join(root, url);
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    const headers = {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': url.startsWith('/media/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    // Byte ranges: Safari will not play a video without them, and seeking relies on them.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      let end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
}

const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a.address);

http.createServer(handler).listen(port, '0.0.0.0', () => {
  console.log(`Raquel & Flávio → http://localhost:${port}`);
  lanAddresses.forEach((ip) => console.log(`  rede de casa  → http://${ip}:${port}`));
});

const key = path.join(certDir, 'key.pem');
const cert = path.join(certDir, 'cert.pem');
if (fs.existsSync(key) && fs.existsSync(cert)) {
  https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, handler)
    .listen(securePort, '0.0.0.0', () => {
      lanAddresses.forEach((ip) => console.log(`  https (giroscópio) → https://${ip}:${securePort}`));
    });
}
