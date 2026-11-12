const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { buildBundle } = require('./bundle.cjs');

const root = path.resolve(__dirname, '..');
const gameRoot = path.join(root, 'minigame');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT 必须是 1 到 65535 的整数');
}

const mimeTypes = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2'
};

async function respond(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  let body;
  let contentType;
  if (pathname === '/') {
    body = await fs.readFile(path.join(root, 'preview', 'index.html'));
    contentType = 'text/html; charset=utf-8';
  } else if (pathname === '/game.bundle.js') {
    body = buildBundle(path.join(gameRoot, 'game.js'));
    contentType = 'application/javascript; charset=utf-8';
  } else if (pathname === '/favicon.ico') {
    response.writeHead(204);
    response.end();
    return;
  } else if (pathname.startsWith('/assets/')) {
    const assetRoot = path.join(gameRoot, 'assets');
    const candidate = path.resolve(gameRoot, `.${pathname}`);
    if (!candidate.startsWith(`${assetRoot}${path.sep}`)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    const real = await fs.realpath(candidate);
    const realAssetRoot = await fs.realpath(assetRoot);
    if (!real.startsWith(`${realAssetRoot}${path.sep}`)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    body = await fs.readFile(real);
    contentType = mimeTypes[path.extname(real).toLowerCase()] || 'application/octet-stream';
  } else {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': contentType });
  response.end(request.method === 'HEAD' ? undefined : body);
}

const server = http.createServer((request, response) => {
  respond(request, response).catch((error) => {
    const status = error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 :
      error instanceof URIError ? 400 : 500;
    if (status === 500) console.error(error);
    if (!response.headersSent) response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(status === 500 ? `预览失败：${error.message}` : http.STATUS_CODES[status]);
  });
});
server.on('error', (error) => {
  console.error(`预览服务启动失败：${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () => {
  console.log(`微信小游戏本地预览：http://localhost:${port}`);
  console.log('修改源码后刷新页面即可。按 Ctrl+C 结束预览。');
});
