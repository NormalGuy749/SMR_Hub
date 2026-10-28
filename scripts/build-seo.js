'use strict';

// node scripts/build-seo.js [--check]: genera las cuatro landings sin navegador ni dependencias.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function buildPages() {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const name of ['data', 'content', 'questions', 'seo-content']) vm.runInContext(read('js/' + name + '.js'), ctx);
  const app = read('js/app.js');
  const block = app.slice(app.indexOf('const ROUTES = {'), app.indexOf('const NAV_GROUPS'));
  for (const match of block.matchAll(/render:\s*(render\w+)/g)) ctx[match[1]] = () => {};
  const routes = vm.runInContext(block + '\n;ROUTES', ctx);
  const template = read('index.html');
  const seo = ctx.SMR_SEO;
  const content = { inicio: seo.home(), tests: seo.testsIntro() + seo.testsCatalog(), glosario: seo.glossary(), 'recursos/subnetting': seo.subnetting() };
  const pages = {};
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  for (const [id, body] of Object.entries(content)) {
    const route = routes[id];
    const title = route.seoTitle || route.title + ' · SMR Hub';
    const url = 'https://smr-hub.pages.dev/' + (id === 'inicio' ? '' : id);
    let html = template.replace(/<base[^>]*>/, '<base href="' + (id.includes('/') ? '../' : './') + '">')
      .replace(/<title>[^<]*<\/title>/, '<title>' + esc(title) + '</title>')
      .replace(/(<link rel="canonical" href=")[^"]*/, '$1' + url)
      .replace(/(<h1 id="page-title">)[\s\S]*?<\/h1>/, '$1' + esc(route.h1) + '</h1>')
      .replace(/(<p id="page-desc">)[\s\S]*?<\/p>/, '$1' + esc(route.desc) + '</p>')
      .replace(/(<main\b[^>]*>)[\s\S]*?<\/main>/, '$1' + body + '</main>');
    const metas = { description: route.desc, keywords: route.keywords.join(', '), robots: 'index, follow', 'og:title': title, 'og:description': route.desc, 'og:url': url, 'twitter:title': title, 'twitter:description': route.desc };
    html = html.replace(/<meta\b[^>]*>/g, (tag) => {
      const name = tag.match(/(?:name|property)="([^"]+)"/);
      return name && metas[name[1]] ? tag.replace(/content="[^"]*"/, 'content="' + esc(metas[name[1]]) + '"') : tag;
    });
    html = html.replace(/<ul id="nav-list">[\s\S]*?<\/ul>/, `<ul id="nav-list">${['tests', 'recursos', 'herramientas', 'glosario'].map((key) => `<li><a class="nav-link" href="${key}">${esc(routes[key].title)}</a></li>`).join('')}</ul>`);
    pages[id === 'inicio' ? 'index.html' : id + '.html'] = html;
  }
  return pages;
}

if (require.main === module) {
  for (const [file, html] of Object.entries(buildPages())) {
    if (process.argv.includes('--check')) {
      if (!fs.existsSync(path.join(ROOT, file)) || read(file) !== html) throw new Error(file + ' desactualizado: ejecuta node scripts/build-seo.js');
    } else {
      fs.mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, file), html);
    }
    console.log((process.argv.includes('--check') ? 'OK ' : 'Generado ') + file);
  }
}

module.exports = { buildPages };
