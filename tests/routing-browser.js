'use strict';

// Usa el Playwright ya instalado (NODE_PATH si procede), sin instalar dependencias.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { routes, startServer } = require('./helpers/hosting');

(async () => {
  const { server, origin } = await startServer();
  let browser;
  let entries = 0, reloads = 0, offline = 0, internal = 0, history = 0;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const base of ['/', '/SMR_Hub/']) {
      for (const withSW of [false, true]) {
        const context = await browser.newContext({ serviceWorkers: withSW ? 'allow' : 'block' });
        await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const checkView = async (id, suffix = '') => {
          await page.waitForFunction((title) => document.getElementById('page-title')?.textContent === title, routes[id].title);
          assert.equal(page.url(), origin + base + (id === 'inicio' ? '' : id) + suffix);
          assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://smr-hub.pages.dev/' + (id === 'inicio' ? '' : id));
          assert.equal(await page.locator('.empty-title').filter({ hasText: 'No se pudo cargar esta vista' }).count(), 0);
        };
        await page.goto(origin + base);
        await checkView('inicio');
        if (withSW) {
          await page.evaluate(async () => {
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
          });
        }
        for (const id of Object.keys(routes)) {
          for (const slash of id === 'inicio' ? [''] : ['', '/']) {
            const suffix = '?q=a%20b#seccion';
            const response = await page.goto(origin + base + (id === 'inicio' ? '' : id + slash) + suffix);
            if (base === '/') assert.equal(response.status(), 200);
            await checkView(id, suffix);
            entries++;
            await page.reload();
            await checkView(id, suffix);
            reloads++;
          }
        }
        // Navegación real por enlaces, seguida de historial y recarga.
        await page.goto(origin + base);
        await checkView('inicio');
        const close = page.getByRole('button', { name: 'Cerrar', exact: true });
        if (await close.isVisible()) await close.click();
        for (const id of Object.keys(routes).filter((id) => id !== 'inicio')) {
          const previousURL = page.url();
          const previousTitle = await page.locator('#page-title').textContent();
          await page.locator('a.nav-link[data-route="' + id + '"]').click();
          await checkView(id);
          internal++;
          await page.goBack();
          assert.equal(page.url(), previousURL);
          assert.equal(await page.locator('#page-title').textContent(), previousTitle);
          await page.goForward();
          await checkView(id);
          history += 2;
        }

        for (const missing of ['no-existe', 'tests/no-existe', 'recursos/subnetting']) {
          const response = await page.goto(origin + base + missing + '?q=1#seccion');
          assert.equal(response.status(), 404);
          assert.equal(page.url(), origin + base + missing + '?q=1#seccion');
          assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex');
          assert.match(await page.locator('body').innerText(), /Esta página no existe/);
        }
        await page.goto(origin + base + 'tests');
        await checkView('tests');
        await page.evaluate(() => SMR.navigate('/tests/no-existe?q=1#seccion'));
        await page.waitForFunction(() => document.getElementById('page-title').textContent === 'Página no encontrada');
        assert.equal(page.url(), origin + base + 'tests/no-existe?q=1#seccion');
        assert.equal((await page.reload()).status(), 404);

        if (withSW) {
          await page.goto(origin + base);
          await checkView('inicio');
          // install termina antes de ready: se comprueba el inventario cacheado real.
          const configPaths = await page.evaluate(async () => {
            const cache = await caches.open('smr-hub:' + new URL('.', document.baseURI).pathname + ':v3');
            return (await cache.keys()).map((request) => new URL(request.url).pathname);
          });
          assert(!configPaths.some((url) => /cloud-config\.public/.test(url)));
          await context.setOffline(true);
          for (const id of Object.keys(routes)) {
            for (const slash of id === 'inicio' ? [''] : ['', '/']) {
              const suffix = '?q=offline#seccion';
              await page.goto(origin + base + (id === 'inicio' ? '' : id + slash) + suffix);
              await checkView(id, suffix);
              offline++;
            }
          }
          for (const missing of ['no-existe', 'tests/no-existe']) {
            assert.equal((await page.goto(origin + base + missing)).status(), 404);
            assert.equal(page.url(), origin + base + missing);
          }
          await context.setOffline(false);
        }
        assert.deepEqual(errors, [], 'errores JS: ' + base + ' SW=' + withSW);
        console.log('PASS navegador: ' + base + ' SW=' + withSW);
        await context.close();
      }
    }
    console.log(JSON.stringify({ entries, reloads, internal, history, offline, result: 'PASS' }));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
