'use strict';

/* IndexedDB guarda una instantánea por type: una escritura nueva sustituye
   a la anterior y evita acumular estados obsoletos. cloud-progress decide
   el envío, el merge y el dueño; esta cola solo señala trabajo pendiente.
   Sin IndexedDB se rechaza la operación, pero el progreso sigue en localStorage. */

window.SMR = window.SMR || {};

window.SMR.offlineStore = (function () {
  const DB_NAME = 'smr_offline_db';
  const DB_VERSION = 1;
  const STORE = 'pending_actions';

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined' || !indexedDB) {
        reject(new Error('IndexedDB no disponible'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'type' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña'));
    });
    /* Un fallo no se memoriza: el siguiente intento vuelve a abrir. */
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  function run(mode, operation) {
    return open().then((db) => new Promise((resolve, reject) => {
      let transaction;
      try {
        transaction = db.transaction(STORE, mode);
      } catch (err) {
        reject(err);
        return;
      }
      const request = operation(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request ? request.result : undefined);
      transaction.onerror = () => reject(transaction.error || request.error);
      transaction.onabort = () => reject(transaction.error || new Error('transacción abortada'));
    }));
  }

  return {
    /* payload debe ser clonable por structured clone (objetos y arrays, sin
       funciones ni nodos del DOM). */
    savePendingAction(type, payload) {
      if (!type || typeof type !== 'string') {
        return Promise.reject(new TypeError('savePendingAction: type obligatorio'));
      }
      return run('readwrite', (store) => store.put({ type: type, payload: payload, at: Date.now() }));
    },

    getPendingActions() {
      return run('readonly', (store) => store.getAll());
    },

    clearPendingActions() {
      return run('readwrite', (store) => store.clear());
    }
  };
})();
