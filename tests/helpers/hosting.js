'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const ROOT = path.resolve(__dirname, '../..');
const APP = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const block = APP.slice(APP.indexOf('const ROUTES = {'), APP.indexOf('const NAV_GROUPS'));
const context = { window: {} };
for (const match of block.matchAll(/render:\s*(render\w+)/g)) context[match[1]] = () => {};
const routes = vm.runInNewContext(block + '\n;ROUTES', context);

// shortcut: simula proxy y normalización documentados, contrastar con Pages al desplegar.
function hostingResponse(hosting, input, rules = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8')) {
  const url = new URL(input);
  const base = hosting === 'github' ? '/SMR_Hub/' : '/';
  const redirect = (pathname, status) => {
    const target = new URL(url);
    target.pathname = pathname;
    return Response.redirect(target.href, status);
  };
  const fileResponse = (file, status = 200) => {
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.xml': 'application/xml' };
    return new Response(fs.readFileSync(path.join(ROOT, file)), { status, headers: { 'Content-Type': types[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store' } });
  };
  const asset = (pathname) => {
    if (hosting === 'cloudflare' && pathname === '/index.html') return redirect('/', 308);
    if (hosting === 'cloudflare' && pathname.endsWith('.html') && fs.existsSync(path.join(ROOT, pathname.slice(1)))) return redirect(pathname.slice(0, -5), 308);
    if (pathname === base) return fileResponse('index.html');
    if (!pathname.startsWith(base)) return fileResponse('404.html', 404);
    const relative = decodeURIComponent(pathname.slice(base.length));
    const file = path.resolve(ROOT, relative);
    if (!file.startsWith(ROOT + path.sep)) return fileResponse('404.html', 404);
    if (hosting === 'cloudflare' && fs.existsSync(file + '.html')) return fileResponse(relative + '.html');
    if (fs.existsSync(file)) {
      if (fs.statSync(file).isFile()) return fileResponse(relative);
      if (hosting === 'github' && !pathname.endsWith('/')) return redirect(pathname + '/', 301);
    }
    return fileResponse('404.html', 404);
  };
  if (hosting === 'github' && url.pathname === '/SMR_Hub') return redirect(base, 301);
  if (hosting === 'cloudflare') {
    if (url.pathname === '/js/cloud-config.public') return fileResponse('js/cloud-config.public.js');
    for (const line of rules.trim().split(/\r?\n/)) {
      const [from, to, code] = line.trim().split(/\s+/);
      if (from !== url.pathname) continue;
      return code === '200' ? asset(to) : redirect(to, Number(code));
    }
  }
  return asset(url.pathname);
}

async function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const response = hostingResponse(req.url.startsWith('/SMR_Hub') ? 'github' : 'cloudflare', 'http://' + req.headers.host + req.url);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      res.writeHead(500);
      res.end(error.message);
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: 'http://127.0.0.1:' + server.address().port };
}

module.exports = { routes, hostingResponse, startServer };
