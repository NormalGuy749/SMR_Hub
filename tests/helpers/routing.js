'use strict';

const fs = require('fs');
const vm = require('vm');
const ROUTING = fs.readFileSync('js/routing.js', 'utf8');

function bootRouting(html, href) {
  const location = new URL(href);
  const replacements = [];
  location.replace = (url) => { replacements.push(new URL(url, location).href); };
  let baseURI = href;
  let loaded = false;
  const base = { set href(value) { baseURI = new URL(value, href).href; } };
  const document = {
    get baseURI() { return baseURI; },
    querySelector: (selector) => selector === 'base' ? base : null,
    write(html) {
      if (!/^<script src="js\/routing\.js"><\/script>$/.test(html)) throw new Error('Bootstrap de routing inesperado');
      vm.runInContext(ROUTING, ctx);
      loaded = true;
    }
  };
  const history = {
    replaceState(state, title, url) { location.href = new URL(url, location).href; },
    pushState(state, title, url) { location.href = new URL(url, location).href; }
  };
  const ctx = { URL, URLSearchParams, location, document, history };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!/\bsrc=|application\/ld\+json/.test(script[1])) vm.runInContext(script[2], ctx);
    if (loaded) return { ctx, routing: ctx.SMR.routing, location, document, replacements };
  }
  throw new Error('Falta el bootstrap de routing');
}

module.exports = { bootRouting };
