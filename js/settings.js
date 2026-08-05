/* App.Settings – Themes, Typografie, Sprache; wendet Einstellungen live auf Reader an */
window.App = window.App || {};

App.Settings = (function () {
  'use strict';

  const THEMES = ['light', 'sepia', 'dark'];
  const $ = (id) => document.getElementById(id);

  /* ── Theme ── */

  function applyTheme(theme, persist) {
    if (!THEMES.includes(theme)) theme = 'light';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('leselampe-theme', theme); } catch (e) { /* egal */ }
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

  /* ── EPUB-Typografie (mit Buch-Override) ── */

  function epubSettings() {
    const base = Object.assign({}, App.Store.settings().epub);
    const book = App.state && App.state.currentBook;
    if (book && book.settingsOverride) Object.assign(base, book.settingsOverride);
    return base;
  }

  function setEpubSetting(key, value) {
    const book = App.state && App.state.currentBook;
    if (book && book.format === 'epub' && key === 'fontSize') {
      // Schriftgröße pro Buch merken, Rest global
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

  /* ── Aus Store anwenden (nach Laden) ── */

  function applyFromStore() {
    const s = App.Store.settings();
    applyTheme(s.theme, false);
    App.I18n.setLanguage(s.language, { silent: true });
    $('pdf-invert').checked = !!s.pdf.invertDark;
    syncTypographyUI();
    App.Library.syncControls();
  }

  /* ── Bindings ── */

  function init() {
    // Früh: Theme/Sprache aus localStorage, bevor der Store geladen ist (kein Flackern)
    let earlyTheme = 'light';
    try { earlyTheme = localStorage.getItem('leselampe-theme') || 'light'; } catch (e) { /* egal */ }
    document.documentElement.dataset.theme = earlyTheme;

    $('theme-picker').addEventListener('click', (ev) => {
      const swatch = ev.target.closest('.theme-swatch');
      if (swatch) applyTheme(swatch.dataset.themeValue);
    });
    $('btn-theme').addEventListener('click', cycleTheme);
    $('btn-lang').addEventListener('click', () => {
      const next = App.I18n.language() === 'de' ? 'en' : 'de';
      App.I18n.setLanguage(next);
      if (App.Store.getData()) {
        App.Store.settings().language = next;
        App.Store.save();
      }
    });
    $('setting-language').addEventListener('change', (ev) => {
      App.I18n.setLanguage(ev.target.value);
      if (App.Store.getData()) {
        App.Store.settings().language = ev.target.value;
        App.Store.save();
      }
    });

    // Typografie-Stepper
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

  return { init, applyTheme, cycleTheme, applyFromStore, epubSettings, syncTypographyUI, adjustFontSize };
})();
