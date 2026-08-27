/* App.Settings – themes, typography, language; applies settings to the reader live */
window.App = window.App || {};

App.Settings = (function () {
  'use strict';

  const THEMES = ['light', 'sepia', 'dark'];
  const $ = (id) => document.getElementById(id);

  /* ── Theme ── */

  function applyTheme(theme, persist) {
    if (!THEMES.includes(theme)) theme = 'light';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('leselampe-theme', theme); } catch (e) { /* ignore */ }
    document.querySelectorAll('.theme-swatch').forEach((el) => {
      el.classList.toggle('active', el.dataset.themeValue === theme);
    });
    const btnIcon = $('btn-theme') && $('btn-theme').querySelector('.icon');
    if (btnIcon) App.Utils.setIcon(btnIcon, theme === 'dark' ? 'moon' : 'sun');
    if (persist !== false && App.Store.getData()) {
      App.Store.settings().theme = theme;
      App.Store.save();
    }
    App.Utils.emit('theme:changed', theme);
  }

  function cycleTheme() {
    const current = document.documentElement.dataset.theme || 'light';
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    applyTheme(next);
  }

  /* ── Language ── */

  /* Switches the language; I18n writes the cookie, data.json follows */
  function changeLanguage(l) {
    App.I18n.setLanguage(l);
    if (App.Store.getData()) {
      App.Store.settings().language = App.I18n.language();
      App.Store.save();
    }
  }

  /* Finishes the language picker; called by the continue button or by Esc */
  let finishLanguageDialog = null;

  /**
   * Language picker shown on first run. A click applies the language right
   * away as a preview; "Continue" (or Esc) writes it to the cookie.
   */
  function askLanguage() {
    const dlg = $('dialog-language');
    if (!dlg || typeof dlg.showModal !== 'function') {
      App.I18n.confirmChoice();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      finishLanguageDialog = () => {
        finishLanguageDialog = null;    // finish only once
        App.I18n.confirmChoice();       // writes cookie + localStorage
        if (App.Store.getData()) {
          App.Store.settings().language = App.I18n.language();
          App.Store.save();
        }
        if (dlg.open) dlg.close();
        resolve();
      };
      App.I18n.syncControls();
      dlg.showModal();
    });
  }

  function bindLanguageDialog() {
    const dlg = $('dialog-language');
    if (!dlg) return;
    dlg.querySelectorAll('.lang-choice').forEach((btn) => {
      btn.addEventListener('click', () => {
        // preview only: do not persist yet, and do not re-render before data is loaded
        App.I18n.setLanguage(btn.dataset.lang, {
          persist: false,
          silent: !App.Store.getData()
        });
      });
    });
    // finish on the click itself – the close event of <dialog> cannot be relied on
    $('lang-continue').addEventListener('click', () => {
      if (finishLanguageDialog) finishLanguageDialog();
    });
    ['close', 'cancel'].forEach((evName) => {
      dlg.addEventListener(evName, () => {
        if (finishLanguageDialog) finishLanguageDialog();
      });
    });
    // catch Esc directly as well, so startup never hangs on a close
    // event that fails to arrive
    dlg.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && finishLanguageDialog) finishLanguageDialog();
    });
  }

  /* ── EPUB typography (with a per-book override) ── */

  function epubSettings() {
    const base = Object.assign({}, App.Store.settings().epub);
    const book = App.state && App.state.currentBook;
    if (book && book.settingsOverride) Object.assign(base, book.settingsOverride);
    return base;
  }

  function setEpubSetting(key, value) {
    const book = App.state && App.state.currentBook;
    if (book && book.format === 'epub' && key === 'fontSize') {
      // font size is kept per book, everything else globally
      book.settingsOverride = book.settingsOverride || {};
      book.settingsOverride[key] = value;
    } else {
      App.Store.settings().epub[key] = value;
    }
    App.Store.save();
    syncTypographyUI();
    App.Utils.emit('epub:settings-changed');
  }

  function syncTypographyUI() {
    const s = epubSettings();
    $('font-size-label').textContent = `${s.fontSize} %`;
    $('line-height-label').textContent = s.lineHeight.toFixed(1);
    $('margin-label').textContent = String(s.marginH);
    $('font-family').value = s.fontFamily;
    $('epub-flow').value = s.flow;
  }

  /* ── Apply from the store (after loading) ── */

  function applyFromStore() {
    const s = App.Store.settings();
    applyTheme(s.theme, false);
    if (App.I18n.hasStoredPreference()) {
      // the cookie leads – bring data.json in line if it differs
      if (s.language !== App.I18n.language()) {
        s.language = App.I18n.language();
        App.Store.save();
      }
      App.I18n.syncControls();
    } else {
      App.I18n.setLanguage(s.language, { silent: true });
    }
    $('pdf-invert').checked = !!s.pdf.invertDark;
    syncTypographyUI();
    App.Library.syncControls();
  }

  /* ── Bindings ── */

  function init() {
    // early: theme and language from localStorage, before the store loads (no flicker)
    let earlyTheme = 'light';
    try { earlyTheme = localStorage.getItem('leselampe-theme') || 'light'; } catch (e) { /* ignore */ }
    document.documentElement.dataset.theme = earlyTheme;

    $('theme-picker').addEventListener('click', (ev) => {
      const swatch = ev.target.closest('.theme-swatch');
      if (swatch) applyTheme(swatch.dataset.themeValue);
    });
    $('btn-theme').addEventListener('click', cycleTheme);
    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        changeLanguage(App.I18n.language() === 'de' ? 'en' : 'de');
      });
    });
    $('setting-language').addEventListener('change', (ev) => changeLanguage(ev.target.value));
    bindLanguageDialog();

    // typography steppers
    const step = (key, delta, min, max, round) => {
      const s = epubSettings();
      let v = App.Utils.clamp((s[key] || 0) + delta, min, max);
      if (round) v = Math.round(v * 10) / 10;
      setEpubSetting(key, v);
    };
    $('font-size-dec').addEventListener('click', () => step('fontSize', -10, 60, 200));
    $('font-size-inc').addEventListener('click', () => step('fontSize', 10, 60, 200));
    $('line-height-dec').addEventListener('click', () => step('lineHeight', -0.1, 1.0, 2.4, true));
    $('line-height-inc').addEventListener('click', () => step('lineHeight', 0.1, 1.0, 2.4, true));
    $('margin-dec').addEventListener('click', () => step('marginH', -12, 0, 120));
    $('margin-inc').addEventListener('click', () => step('marginH', 12, 0, 120));
    $('font-family').addEventListener('change', (ev) => setEpubSetting('fontFamily', ev.target.value));
    $('epub-flow').addEventListener('change', (ev) => setEpubSetting('flow', ev.target.value));

    $('pdf-invert').addEventListener('change', (ev) => {
      App.Store.settings().pdf.invertDark = ev.target.checked;
      App.Store.save();
      App.Utils.emit('theme:changed', document.documentElement.dataset.theme);
    });
  }

  function adjustFontSize(delta) {
    const s = epubSettings();
    setEpubSetting('fontSize', App.Utils.clamp(s.fontSize + delta, 60, 200));
  }

  return {
    init, applyTheme, cycleTheme, applyFromStore, epubSettings, syncTypographyUI,
    adjustFontSize, changeLanguage, askLanguage
  };
})();
