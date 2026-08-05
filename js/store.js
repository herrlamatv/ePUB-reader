/* App.Store – data.json im Bibliotheksordner (Quelle der Wahrheit) + Cache-Spiegel */
window.App = window.App || {};

App.Store = (function () {
  'use strict';

  const FILE = 'data.json';
  const BACKUP = 'data.backup.json';

  let data = null;
  let readonly = false;      // true, solange keine Schreibfreigabe existiert
  let fallbackMode = false;  // true ohne File System Access API (localStorage statt Datei)
  let bc = null;
  let suppressBroadcast = false;

  function defaults() {
    return {
      version: 1,
      revision: 0,
      settings: {
        language: 'de',
        theme: 'light',
        libraryView: 'grid',
        librarySort: 'recent',
        epub: { fontSize: 100, fontFamily: 'original', lineHeight: 1.6, marginH: 48, flow: 'paginated' },
        pdf: { invertDark: false },
        tts: { rate: 1.0, voiceURI: null }
      },
      books: {},
      stats: { days: {}, streak: { current: 0, best: 0, lastDay: null } }
    };
  }

  function mergeDefaults(loaded) {
    const d = defaults();
    const out = Object.assign(d, loaded || {});
    out.settings = Object.assign(d.settings, (loaded && loaded.settings) || {});
    out.settings.epub = Object.assign(d.settings.epub, (loaded && loaded.settings && loaded.settings.epub) || {});
    out.settings.pdf = Object.assign(d.settings.pdf, (loaded && loaded.settings && loaded.settings.pdf) || {});
    out.settings.tts = Object.assign(d.settings.tts, (loaded && loaded.settings && loaded.settings.tts) || {});
    out.books = (loaded && loaded.books) || {};
    out.stats = Object.assign(d.stats, (loaded && loaded.stats) || {});
    out.stats.days = (loaded && loaded.stats && loaded.stats.days) || {};
    out.stats.streak = Object.assign(d.stats.streak, (loaded && loaded.stats && loaded.stats.streak) || {});
    return out;
  }

  /* ── Laden ── */

  async function load() {
    fallbackMode = false;
    readonly = false;
    const text = await App.FS.readDataFile(FILE);
    if (text !== null) {
      try {
        data = mergeDefaults(JSON.parse(text));
      } catch (e) {
        console.error('data.json beschädigt', e);
        data = await tryRestoreBackup();
      }
    } else {
      data = mergeDefaults(null);
    }
    await dailyBackup(text);
    await App.DB.set('dataCache', 'data', data);
    initBroadcast();
    return data;
  }

  async function tryRestoreBackup() {
    const backupText = await App.FS.readDataFile(BACKUP);
    if (backupText) {
      const restore = await App.Utils.confirmDialog(App.I18n.t('app.dataCorrupt'), App.I18n.t('common.ok'));
      if (restore) {
        try {
          const restored = mergeDefaults(JSON.parse(backupText));
          App.Utils.toast(App.I18n.t('app.dataRestored'));
          return restored;
        } catch (e) {
          console.error('Backup ebenfalls beschädigt', e);
        }
      }
    }
    return mergeDefaults(null);
  }

  async function dailyBackup(currentText) {
    if (!currentText) return;
    const today = App.Utils.todayKey();
    try {
      if (localStorage.getItem('leselampe-backup-day') !== today) {
        await App.FS.writeDataFile(BACKUP, currentText);
        localStorage.setItem('leselampe-backup-day', today);
      }
    } catch (e) {
      console.warn('Backup fehlgeschlagen', e);
    }
  }

  /* Read-only-Start aus dem IndexedDB-Spiegel (vor erneuter Freigabe) */
  async function loadFromCache() {
    const cached = await App.DB.get('dataCache', 'data');
    data = mergeDefaults(cached);
    readonly = true;
    return data;
  }

  /* Fallback ohne File System Access API: localStorage */
  function loadFallback() {
    fallbackMode = true;
    try {
      data = mergeDefaults(JSON.parse(localStorage.getItem('leselampe-data') || 'null'));
    } catch (e) {
      data = mergeDefaults(null);
    }
    return data;
  }

  /* ── Speichern ── */

  async function persist() {
    if (!data) return;
    data.revision += 1;
    const json = JSON.stringify(data, null, 2);
    try {
      if (fallbackMode) {
        localStorage.setItem('leselampe-data', json);
      } else if (!readonly && App.FS.hasLibrary()) {
        await App.FS.writeDataFile(FILE, json);
      }
      await App.DB.set('dataCache', 'data', data);
      if (bc && !suppressBroadcast) bc.postMessage({ type: 'updated', revision: data.revision });
    } catch (e) {
      console.error('Speichern fehlgeschlagen', e);
      App.Utils.toast(App.I18n.t('app.dataSaveError'), 'error');
    }
  }

  const save = App.Utils.debounce(persist, 1500);

  function saveNow() {
    save.cancel();
    return persist();
  }

  /* ── Multi-Tab ── */

  function initBroadcast() {
    if (bc || typeof BroadcastChannel === 'undefined') return;
    bc = new BroadcastChannel('leselampe');
    bc.onmessage = async (ev) => {
      if (!ev.data || ev.data.type !== 'updated') return;
      if (data && ev.data.revision > data.revision) {
        // Anderer Tab hat gespeichert → neu laden, eigene ungesicherte Statistik behalten
        const myStats = data.stats;
        const text = await App.FS.readDataFile(FILE);
        if (text) {
          try {
            suppressBroadcast = true;
            const fresh = mergeDefaults(JSON.parse(text));
            mergeStats(fresh.stats, myStats);
            data = fresh;
            App.Utils.emit('store:reloaded');
          } catch (e) { /* behalten was wir haben */ }
          suppressBroadcast = false;
        }
      }
    };
  }

  function mergeStats(target, source) {
    Object.keys(source.days || {}).forEach((day) => {
      if (!target.days[day]) {
        target.days[day] = source.days[day];
      } else {
        target.days[day].seconds = Math.max(target.days[day].seconds, source.days[day].seconds);
        const per = source.days[day].perBook || {};
        target.days[day].perBook = target.days[day].perBook || {};
        Object.keys(per).forEach((id) => {
          target.days[day].perBook[id] = Math.max(target.days[day].perBook[id] || 0, per[id]);
        });
      }
    });
  }

  /* ── Zugriff ── */

  function getData() { return data; }
  function settings() { return data.settings; }
  function isReadonly() { return readonly; }
  function isFallback() { return fallbackMode; }
  function setReadonly(v) { readonly = v; }

  function books() { return Object.values(data.books); }
  function getBook(id) { return data.books[id] || null; }

  function addBook(record) {
    data.books[record.id] = record;
    save();
    return record;
  }

  function removeBook(id) {
    delete data.books[id];
    save();
  }

  function findByPath(path) {
    return books().find((b) => b.path === path) || null;
  }

  function findByFingerprint(fp) {
    return books().find((b) => App.Utils.sameFingerprint(b.fingerprint, fp)) || null;
  }

  return {
    load, loadFromCache, loadFallback, save, saveNow,
    getData, settings, isReadonly, isFallback, setReadonly,
    books, getBook, addBook, removeBook, findByPath, findByFingerprint
  };
})();
