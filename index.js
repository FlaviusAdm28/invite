// Minimal static server for local preview: `npm start` → http://localhost:5173
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT) || 5173;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const allowed = /^\/(index\.html|src\/[\w.-]+|media\/web\/[\w.-]+\.jpg)$/;

http.createServer((req, res) => {
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
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': url.startsWith('/media/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, () => {
  console.log(`Raquel & Flávio → http://localhost:${port}`);
});
