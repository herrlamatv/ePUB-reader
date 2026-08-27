/* App.DB – thin IndexedDB wrapper (cache only: handles, covers, data mirror, locations) */
window.App = window.App || {};

App.DB = (function () {
  'use strict';

  const DB_NAME = 'leselampe';
  const VERSION = 1;
  const STORES = ['handles', 'covers', 'dataCache', 'locations'];

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((s) => {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function withStore(storeName, mode, fn) {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  function get(store, key) {
    return withStore(store, 'readonly', (s) => s.get(key));
  }

  function set(store, key, value) {
    return withStore(store, 'readwrite', (s) => s.put(value, key));
  }

  function del(store, key) {
    return withStore(store, 'readwrite', (s) => s.delete(key));
  }

  function keys(store) {
    return withStore(store, 'readonly', (s) => s.getAllKeys());
  }

  return { get, set, del, keys };
})();
