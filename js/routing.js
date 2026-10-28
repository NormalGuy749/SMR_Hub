'use strict';

(function () {
  const basePath = location.protocol === 'file:' ? '/' : new URL('.', typeof document === 'undefined' ? location.href : document.baseURI).pathname;
  const recoveryPrefix = '#smrhub-route=';
  const routeIds = ['inicio', 'estudio', 'recursos', 'redes', 'sistemas', 'herramientas', 'tests', 'dashboard', 'exportar', 'glosario', 'casos', 'mapa', 'estadisticas', 'curriculo', 'mi-smr', 'configuracion'];

  function logicalPath(path) {
    let value = path || '/';
    const prefix = basePath.slice(0, -1);
    if (prefix && value.startsWith(prefix) && /^(?:[/?#]|$)/.test(value.slice(prefix.length))) {
      value = '/' + value.slice(prefix.length).replace(/^\//, '');
    }
    return value.replace(/^\/(?:inicio|index\.html)\/?(?=[?#]|$)/, '/');
  }

  function publicPath(path) {
    const logical = logicalPath(path);
    if (!logical.startsWith('/') || logical.startsWith('//')) throw new Error('Ruta interna inválida');
    const url = new URL(basePath.slice(0, -1) + logical, 'https://smr-hub.pages.dev');
    if (url.origin !== 'https://smr-hub.pages.dev' || !url.pathname.startsWith(basePath)) throw new Error('Ruta fuera de la aplicación');
    if (url.pathname !== basePath) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.pathname + url.search + url.hash;
  }

  function parsePath(path) {
    const url = new URL(logicalPath(path), 'https://smr-hub.pages.dev');
    return {
      id: (url.pathname.replace(/^\/|\/$/g, '') || 'inicio').toLowerCase(),
      query: url.searchParams
    };
  }

  function isRoute(path) {
    return routeIds.includes(parsePath(path).id);
  }

  function canonicalizeUrl() {
    if (location.protocol === 'file:') return;
    const path = location.hash.startsWith('#/')
      ? location.hash.slice(1)
      : location.pathname + location.search + location.hash;
    const target = publicPath(path);
    if (target !== location.pathname + location.search + location.hash) history.replaceState({}, '', target);
  }

  function redirectFrom404() {
    if (location.protocol === 'file:' || location.pathname === basePath || location.pathname === basePath + 'index.html') return;
    if (!isRoute(location.pathname)) return;
    const path = location.pathname + location.search + location.hash;
    location.replace(basePath + recoveryPrefix + encodeURIComponent(path));
  }

  function restorePathFrom404() {
    if (location.protocol === 'file:' || !location.hash.startsWith(recoveryPrefix)) return;
    if (location.pathname !== basePath && location.pathname !== basePath + 'index.html') return;
    let target = basePath;
    try {
      const saved = decodeURIComponent(location.hash.slice(recoveryPrefix.length));
      const url = new URL(saved, location.origin);
      if (saved.startsWith('/') && !saved.startsWith('//') && url.origin === location.origin && url.pathname.startsWith(basePath)) {
        target = url.pathname + url.search + url.hash;
      }
    } catch { /* Un fragmento inválido vuelve a Inicio. */ }
    history.replaceState({}, '', target);
  }

  const SMR = (globalThis.SMR = globalThis.SMR || {});
  SMR.routing = { basePath, logicalPath, publicPath, parsePath, isRoute, canonicalizeUrl, redirectFrom404, restorePathFrom404 };
})();
