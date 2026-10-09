import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root) || !['index.html', 'game.js', 'style.css'].includes(path.relative(root, filename))) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)], 'Cache-Control': 'no-cache' });
    response.end(await readFile(filename));
  } catch {
    response.writeHead(404).end('Not found');
  }
});
server.listen(Number(process.env.PORT) || 4173, '0.0.0.0', () => console.log('My Property: http://localhost:' + (process.env.PORT || 4173)));
