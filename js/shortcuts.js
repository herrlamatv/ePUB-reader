/* App.Shortcuts – global keyboard shortcuts (also forwarded from the EPUB iframe) */
window.App = window.App || {};

App.Shortcuts = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function inReader() { return App.state.view === 'reader'; }

  function isEpub() {
    return App.state.currentBook && App.state.currentBook.format === 'epub';
  }

  function anyDialogOpen() {
    return [...document.querySelectorAll('dialog')].some((d) => d.open);
  }

  function handleKey(ev) {
    const tag = (ev.target && ev.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) {
      if (ev.key === 'Escape') ev.target.blur();
      return;
    }
    if (anyDialogOpen()) return; // Esc closes <dialog> natively

    // Global
    if (ev.key === '?') { showDialog(); return; }
    if (ev.key === 'd' && !ev.ctrlKey && !ev.metaKey) { App.Settings.cycleTheme(); return; }

    if (ev.ctrlKey && (ev.key === 'f' || ev.key === 'F')) {
      if (inReader() && App.hasText()) {
        ev.preventDefault();
        App.openDrawer('drawer-search');
      }
      return;
    }

    if (!inReader()) return;
    const reader = App.activeReader();
    if (!reader) return;

    switch (ev.key) {
      case 'ArrowLeft':
        reader.prev();
        break;
      case 'ArrowRight':
        reader.next();
        break;
      case ' ':
        ev.preventDefault && ev.preventDefault();
        if (ev.shiftKey) reader.prev(); else reader.next();
        break;
      case '+':
      case '=':
        if (isEpub()) App.Settings.adjustFontSize(10); else reader.zoomIn();
        break;
      case '-':
        if (isEpub()) App.Settings.adjustFontSize(-10); else reader.zoomOut();
        break;
      case '0':
        if (!isEpub()) reader.resetZoom();
        break;
      case 't':
        App.toggleDrawer('drawer-toc');
        break;
      case 'b':
        App.Annotations.toggleBookmark();
        break;
      case 'm':
        App.toggleDrawer('drawer-annotations');
        break;
      case 's':
        if (App.hasText()) App.toggleDrawer('drawer-search');
        break;
      case 'p':
        if (App.hasText()) App.TTS.playPause();
        break;
      case 'Home':
        reader.goToStart();
        break;
      case 'End':
        reader.goToEnd();
        break;
      case 'Escape':
        if (App.Annotations.popupVisible()) {
          App.Annotations.hidePopups();
        } else if (App.anyDrawerOpen()) {
          App.closeDrawers();
        } else {
          App.closeReader();
        }
        break;
      default:
        break;
    }
    App.Stats.recordActivity();
  }

  const SHORTCUTS = [
    ['←  →  Space', 'shortcuts.turnPage'],
    ['+  −  0', 'shortcuts.zoomFont'],
    ['T', 'shortcuts.toc'],
    ['B', 'shortcuts.bookmark'],
    ['M', 'shortcuts.annotations'],
    ['S  /  Strg+F', 'shortcuts.search'],
    ['P', 'shortcuts.tts'],
    ['D', 'shortcuts.theme'],
    ['Home  End', 'shortcuts.startEnd'],
    ['Esc', 'shortcuts.close'],
    ['?', 'shortcuts.help']
  ];

  function showDialog() {
    const list = $('shortcuts-list');
    list.innerHTML = '';
    SHORTCUTS.forEach(([keys, i18nKey]) => {
      const kbd = document.createElement('div');
      kbd.innerHTML = keys.split('  ').map((k) => `<kbd>${App.Utils.escapeHtml(k)}</kbd>`).join(' ');
      const desc = document.createElement('div');
      desc.textContent = App.I18n.t(i18nKey);
      list.appendChild(kbd);
      list.appendChild(desc);
    });
    $('dialog-shortcuts').showModal();
  }

  function init() {
    window.addEventListener('keydown', handleKey);
    $('btn-help').addEventListener('click', showDialog);
  }

  return { init, handleKey, showDialog };
})();
