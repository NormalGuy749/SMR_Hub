'use strict';

/* SMR Hub — cola offline sobre IndexedDB
   ---------------------------------------
   QUÉ ES: guarda el último estado que no se pudo sincronizar mientras no hay
   red, para reintentarlo al reconectar. Tres operaciones, sin dependencias.
   La store usa `type` como clave: guardar dos veces el mismo tipo REEMPLAZA la
   acción anterior (una instantánea de progreso nueva sustituye a la vieja),
   así que la cola nunca crece sin límite.

   QUÉ NO ES: no habla con Supabase ni decide qué se envía. El envío lo hace
   cloud-progress (merge, propiedad del slot y reintentos); esto solo avisa de
   que hay algo pendiente. Si IndexedDB no está disponible (modo privado de
   algunos navegadores), todas las funciones rechazan y la app sigue igual de
   funcional, porque el progreso ya vive en localStorage. */

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
