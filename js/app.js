/* App – bootstrap, view switching, drawers, auto-hiding chrome, drag & drop */
window.App = window.App || {};

App.state = {
  view: 'library',       // 'library' | 'reader'
  currentBook: null      // book record from the store
};

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const DRAWERS = ['drawer-toc', 'drawer-annotations', 'drawer-search', 'drawer-tts', 'drawer-settings'];

  let chromeTimer = null;
  let dragCounter = 0;

  /* ══════════ Open / close the reader ══════════ */

  App.openReader = async function (rec, file) {
    App.state.view = 'reader';
    App.state.currentBook = rec;
    $('view-library').hidden = true;
    $('view-reader').hidden = false;
    $('reader-title').textContent = rec.title;
    rec.lastOpenedAt = Date.now();
    App.Store.save();
    showChrome();

    try {
      if (rec.format === 'epub') {
        await App.EpubReader.open(rec, file);
      } else {
        await App.PdfReader.open(rec, file);
      }
    } catch (e) {
      console.error('Failed to open book', e);
      App.Utils.toast(App.I18n.t('reader.openError', { error: e.message || e }), 'error');
      App.closeReader();
      return;
    }

    App.Annotations.onReaderOpened();
    App.Search.reset();
    App.TTS.reset();
    App.Stats.startSession(rec.id);
  };

  App.closeReader = function () {
    if (App.state.view !== 'reader') return;
    App.TTS.stop(true);
    App.Stats.endSession();
    App.closeDrawers();
    App.Annotations.hidePopups();
    const rec = App.state.currentBook;
    if (rec) {
      if (rec.format === 'epub') App.EpubReader.close();
      else App.PdfReader.close();
    }
    App.state.currentBook = null;
    App.state.view = 'library';
    $('view-reader').hidden = true;
    $('view-library').hidden = false;
    clearTimeout(chromeTimer);
    App.Store.saveNow();
    App.Library.render();
  };

  /* ══════════ Drawer ══════════ */

  App.openDrawer = function (id) {
    DRAWERS.forEach((d) => { $(d).hidden = d !== id; });
    $('drawer-backdrop').hidden = false;
    showChrome();
    if (id === 'drawer-search') {
      setTimeout(() => $('book-search-input').focus(), 60);
    }
  };

  App.closeDrawers = function () {
    DRAWERS.forEach((d) => { $(d).hidden = true; });
    $('drawer-backdrop').hidden = true;
  };

  App.toggleDrawer = function (id) {
    if (!$(id).hidden) {
      App.closeDrawers();
    } else {
      App.openDrawer(id);
    }
  };

  App.anyDrawerOpen = function () {
    return DRAWERS.some((d) => !$(d).hidden);
  };

  /* ══════════ Auto-hiding chrome in the reader ══════════ */

  function showChrome() {
    $('reader-topbar').classList.remove('hidden-chrome');
    $('reader-bottombar').classList.remove('hidden-chrome');
    scheduleHide();
  }

  function hideChrome() {
    if (App.state.view !== 'reader') return;
    if (App.anyDrawerOpen() || App.Annotations.popupVisible()) return;
    $('reader-topbar').classList.add('hidden-chrome');
    $('reader-bottombar').classList.add('hidden-chrome');
  }

  function scheduleHide() {
    clearTimeout(chromeTimer);
    if (App.state.view !== 'reader') return;
    chromeTimer = setTimeout(hideChrome, 2500);
  }

  App.toggleChrome = function () {
    const hidden = $('reader-topbar').classList.contains('hidden-chrome');
    if (hidden) showChrome(); else hideChrome();
  };

  App.showChrome = showChrome;

  /* ══════════ Drag & Drop ══════════ */

  function hasFiles(ev) {
    return ev.dataTransfer && [...(ev.dataTransfer.types || [])].includes('Files');
  }

  function bindDragDrop() {
    window.addEventListener('dragenter', (ev) => {
      if (!hasFiles(ev) || App.state.view !== 'library') return;
      ev.preventDefault();
      dragCounter += 1;
      $('drop-overlay').hidden = false;
    });
    window.addEventListener('dragover', (ev) => {
      if (hasFiles(ev)) ev.preventDefault();
    });
    window.addEventListener('dragleave', (ev) => {
      if (!hasFiles(ev)) return;
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) $('drop-overlay').hidden = true;
    });
    window.addEventListener('drop', (ev) => {
      if (!hasFiles(ev)) return;
      ev.preventDefault();
      dragCounter = 0;
      $('drop-overlay').hidden = true;
      if (App.state.view === 'library' && ev.dataTransfer.files.length) {
        App.Library.importFiles(ev.dataTransfer.files);
      }
    });
  }

  /* ══════════ UI bindings ══════════ */

  function bindUI() {
    $('btn-back').addEventListener('click', App.closeReader);
    $('btn-toc').addEventListener('click', () => App.toggleDrawer('drawer-toc'));
    $('btn-annotations').addEventListener('click', () => App.toggleDrawer('drawer-annotations'));
    $('btn-search').addEventListener('click', () => App.toggleDrawer('drawer-search'));
    $('btn-tts').addEventListener('click', () => App.toggleDrawer('drawer-tts'));
    $('btn-reader-settings').addEventListener('click', () => App.toggleDrawer('drawer-settings'));

    document.querySelectorAll('.drawer-close').forEach((btn) => {
      btn.addEventListener('click', () => App.closeDrawers());
    });
    $('drawer-backdrop').addEventListener('click', App.closeDrawers);

    document.querySelectorAll('.dialog-close').forEach((btn) => {
      btn.addEventListener('click', () => btn.closest('dialog').close());
    });

    // tabs in the annotations drawer
    document.querySelectorAll('.drawer-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.drawer-tab').forEach((el) => el.classList.remove('active'));
        tab.classList.add('active');
        $('bookmark-list').hidden = tab.dataset.tab !== 'bookmarks';
        $('highlight-list').hidden = tab.dataset.tab !== 'highlights';
      });
    });

    $('btn-stats').addEventListener('click', () => App.Stats.showDialog());

    // EPUB controls
    $('progress-slider').addEventListener('input', (ev) => {
      App.EpubReader.goToPercentage(Number(ev.target.value) / 1000);
    });
    $('tap-left').addEventListener('click', () => App.EpubReader.prev());
    $('tap-right').addEventListener('click', () => App.EpubReader.next());

    // PDF controls
    $('pdf-page-input').addEventListener('change', (ev) => {
      App.PdfReader.goToPage(Number(ev.target.value));
    });
    $('pdf-progress-slider').addEventListener('input', (ev) => {
      App.PdfReader.goToPage(Number(ev.target.value), true);
    });
    $('btn-zoom-in').addEventListener('click', () => App.PdfReader.zoomIn());
    $('btn-zoom-out').addEventListener('click', () => App.PdfReader.zoomOut());
    $('btn-zoom-mode').addEventListener('click', () => App.PdfReader.cycleZoomMode());

    // chrome auto-hide
    $('view-reader').addEventListener('pointermove', () => {
      if ($('reader-topbar').classList.contains('hidden-chrome')) showChrome();
      else scheduleHide();
    });

    bindDragDrop();

    // save when the tab goes into the background or closes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) App.Store.saveNow();
    });
    window.addEventListener('pagehide', () => { App.Store.saveNow(); });
  }

  /* ══════════ Init ══════════ */

  async function init() {
    App.Utils.applyIcons();
    App.Settings.init();
    App.I18n.init();
    App.Library.init();
    App.Annotations.init();
    App.Search.init();
    App.TTS.init();
    App.Shortcuts.init();
    App.EpubReader.init();
    App.PdfReader.init();
    bindUI();

    if (window.pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    }

    // first run: ask for the language before the UI is filled
    if (!App.I18n.hasStoredPreference()) {
      await App.Settings.askLanguage();
    }

    if (location.protocol === 'file:') {
      setTimeout(() => App.Utils.toast(App.I18n.t('app.fileUrlHint')), 1200);
    }

    await App.Library.start();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
