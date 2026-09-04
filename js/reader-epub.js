/* App.EpubReader – epub.js integration: rendering, TOC, progress, themes, TTS hooks */
window.App = window.App || {};

App.EpubReader = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const THEME_STYLES = {
    light: { bg: '#ffffff', fg: '#1c1917', link: '#2563eb' },
    sepia: { bg: '#f6f0e4', fg: '#433422', link: '#b45309' },
    dark: { bg: '#111110', fg: '#d6d3d1', link: '#60a5fa' }
  };

  let book = null;
  let rendition = null;
  let record = null;
  let toc = [];
  let locationsReady = false;
  let currentLocation = null;
  let currentFlow = null;
  let displayedFirst = false;

  /* Mouse wheel paging (paginated flow only) */
  const WHEEL_STEP = 40;        // accumulated pixels needed for one page turn
  const WHEEL_COOLDOWN = 320;   // ms between two turns
  const WHEEL_GESTURE_GAP = 400; // ms of quiet that starts a fresh gesture
  let wheelAccum = 0;
  let wheelLastEvent = 0;
  let wheelLastTurn = 0;

  async function open(rec, file) {
    record = rec;
    $('epub-container').hidden = false;
    $('epub-controls').hidden = false;
    locationsReady = false;
    currentLocation = null;
    displayedFirst = false;

    const buffer = await file.arrayBuffer();
    book = ePub(buffer);
    await book.opened;

    createRendition();

    const nav = await book.loaded.navigation;
    toc = flattenToc(nav.toc || []);
    renderToc();

    await rendition.display(rec.progress.cfi || undefined);
    displayedFirst = true;
    setupLocations();
  }

  function createRendition() {
    const s = App.Settings.epubSettings();
    currentFlow = s.flow;
    rendition = book.renderTo('epub-viewport', {
      width: '100%',
      height: '100%',
      flow: s.flow === 'scrolled' ? 'scrolled-doc' : 'paginated',
      spread: 'auto',
      minSpreadWidth: 1000,
      allowScriptedContent: false
    });

    registerThemes();
    applyTypography();

    // inject the TTS highlight stylesheet into every section
    rendition.hooks.content.register((contents) => {
      const style = contents.document.createElement('style');
      style.textContent = '.leselampe-tts-active { background: rgba(59,130,246,0.18); border-radius: 3px; }';
      contents.document.head.appendChild(style);
      // the section lives in an iframe, so it needs its own wheel listener
      contents.document.addEventListener('wheel', onWheel, { passive: false });
    });

    rendition.on('relocated', onRelocated);
    rendition.on('selected', (cfiRange, contents) => App.Annotations.onEpubSelected(cfiRange, contents));
    rendition.on('click', onContentClick);
    rendition.on('keydown', (ev) => App.Shortcuts.handleKey(ev));
  }

  function registerThemes() {
    Object.keys(THEME_STYLES).forEach((name) => {
      const c = THEME_STYLES[name];
      rendition.themes.register(name, {
        body: { background: c.bg + ' !important', color: c.fg + ' !important' },
        'a, a:visited': { color: c.link + ' !important' },
        '::selection': { background: 'rgba(96,165,250,0.35)' }
      });
    });
    rendition.themes.select(document.documentElement.dataset.theme || 'light');
  }

  function applyTypography() {
    if (!rendition) return;
    const s = App.Settings.epubSettings();
    rendition.themes.fontSize(s.fontSize + '%');
    rendition.themes.override('font-family', s.fontFamily === 'original' ? '' : s.fontFamily);
    rendition.themes.override('line-height', String(s.lineHeight));
    const viewport = $('epub-viewport');
    viewport.style.padding = `0 ${s.marginH}px`;
    try { rendition.resize(); } catch (e) { /* layout follows on next display */ }
  }

  function applyTheme(themeName) {
    if (rendition) rendition.themes.select(themeName);
  }

  /* Switching flow (paged ↔ scrolled) needs a fresh rendition */
  async function reflow() {
    if (!book || !rendition) return;
    const cfi = currentLocation && currentLocation.start ? currentLocation.start.cfi : record.progress.cfi;
    try { rendition.destroy(); } catch (e) { /* ignore */ }
    $('epub-viewport').innerHTML = '';
    createRendition();
    await rendition.display(cfi || undefined);
    App.Annotations.resetEpubApplied();
    App.Annotations.applyEpubHighlights();
  }

  function onSettingsChanged() {
    if (!rendition) return;
    const s = App.Settings.epubSettings();
    if (s.flow !== currentFlow) {
      reflow();
    } else {
      applyTypography();
    }
  }

  /* ── Position & progress ── */

  function onRelocated(location) {
    currentLocation = location;
    if (!record || !displayedFirst) return;
    const cfi = location.start.cfi;
    record.progress.cfi = cfi;
    let pct = location.start.percentage || 0;
    if (locationsReady) {
      try { pct = book.locations.percentageFromCfi(cfi) || 0; } catch (e) { /* ignore */ }
    }
    record.progress.percentage = pct;
    App.Store.save();

    $('progress-slider').value = Math.round(pct * 1000);
    $('progress-label').textContent = `${Math.round(pct * 100)} %`;
    updatePageIndicator(pct);
    $('chapter-label').textContent = chapterLabelFor(location.start.href) || '';
    markActiveTocItem(location.start.href);
    App.Annotations.updateBookmarkButton();
    App.Stats.recordActivity();
  }

  /* EPUB has no real pages – derive one from the estimated page count */
  function updatePageIndicator(pct) {
    const total = record && record.pageCount ? record.pageCount : 0;
    if (!total) {
      App.setPageIndicator(null, null);
      return;
    }
    const page = App.Utils.clamp(Math.round(pct * (total - 1)) + 1, 1, total);
    App.setPageIndicator(page, total);
  }

  async function setupLocations() {
    try {
      const saved = await App.DB.get('locations', record.id);
      if (saved) {
        book.locations.load(saved);
      } else {
        await book.locations.generate(1000);
        App.DB.set('locations', record.id, book.locations.save());
      }
      locationsReady = true;
      // page count estimated from the text volume (1 location = 1000 chars, ~1800 chars per page)
      if (book.locations.total > 0) {
        record.pageCount = Math.max(1, Math.round((book.locations.total * 1000) / 1800));
        App.Store.save();
      }
      if (currentLocation) onRelocated(currentLocation);
    } catch (e) {
      console.warn('Generating locations failed', e);
    }
  }

  function goToPercentage(p) {
    if (!locationsReady) return;
    try {
      const cfi = book.locations.cfiFromPercentage(App.Utils.clamp(p, 0, 1));
      if (cfi) rendition.display(cfi);
    } catch (e) { /* ignore */ }
  }

  function display(target) {
    if (rendition) return rendition.display(target);
    return Promise.resolve();
  }

  function next() { if (rendition) rendition.next(); }
  function prev() { if (rendition) rendition.prev(); }
  function goToStart() { if (rendition) rendition.display(0); }
  function goToEnd() { goToPercentage(0.999); }

  /* ── TOC ── */

  function flattenToc(items, depth) {
    const out = [];
    (items || []).forEach((item) => {
      out.push({ label: (item.label || '').trim(), href: item.href, depth: depth || 0 });
      if (item.subitems && item.subitems.length) {
        out.push(...flattenToc(item.subitems, (depth || 0) + 1));
      }
    });
    return out;
  }

  function renderToc() {
    const list = $('toc-list');
    list.innerHTML = '';
    if (!toc.length) {
      list.innerHTML = `<p class="empty-hint">${App.Utils.escapeHtml(App.I18n.t('reader.noToc'))}</p>`;
      return;
    }
    toc.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = `toc-item depth-${Math.min(item.depth, 3)}`;
      btn.textContent = item.label;
      btn.dataset.href = item.href;
      btn.addEventListener('click', () => {
        rendition.display(item.href);
        App.closeDrawers();
      });
      list.appendChild(btn);
    });
  }

  function normalizeHref(href) {
    return (href || '').split('#')[0].split('/').pop();
  }

  function chapterLabelFor(href) {
    const base = normalizeHref(href);
    const item = toc.find((i) => normalizeHref(i.href) === base);
    return item ? item.label : '';
  }

  function markActiveTocItem(href) {
    const base = normalizeHref(href);
    document.querySelectorAll('#toc-list .toc-item').forEach((el) => {
      el.classList.toggle('active', normalizeHref(el.dataset.href) === base);
    });
  }

  /* ── Interaction ── */

  function wheelDistance(ev) {
    const d = ev.deltaY || ev.deltaX || 0;
    if (ev.deltaMode === 1) return d * 16;   // lines → px
    if (ev.deltaMode === 2) return d * 400;  // pages → px
    return d;
  }

  function onWheel(ev) {
    if (!rendition || currentFlow === 'scrolled') return; // scrolled flow scrolls natively
    if (ev.ctrlKey || ev.metaKey) return;                 // leave zoom gestures alone
    if (ev.cancelable) ev.preventDefault();

    const now = Date.now();
    if (now - wheelLastEvent > WHEEL_GESTURE_GAP) wheelAccum = 0;
    wheelLastEvent = now;
    wheelAccum += wheelDistance(ev);

    if (Math.abs(wheelAccum) < WHEEL_STEP) return;
    if (now - wheelLastTurn < WHEEL_COOLDOWN) return;     // keep accumulating until the cooldown is over
    wheelLastTurn = now;
    const forward = wheelAccum > 0;
    wheelAccum = 0;
    if (forward) next(); else prev();
    App.showChrome();
  }

  function onContentClick() {
    const contents = rendition.getContents()[0];
    if (contents) {
      const sel = contents.window.getSelection();
      if (sel && !sel.isCollapsed) return; // a selection is active → do not toggle
    }
    if (App.Annotations.popupVisible()) {
      App.Annotations.hidePopups();
      return;
    }
    App.toggleChrome();
  }

  /* ── Highlights ── */

  function addHighlightToRendition(h) {
    if (!rendition) return;
    const colors = App.Annotations.COLORS;
    try {
      rendition.annotations.highlight(
        h.cfiRange,
        { id: h.id },
        (e) => App.Annotations.onEpubHighlightClick(h.id, e),
        'leselampe-hl',
        { fill: colors[h.color] || colors.yellow, 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' }
      );
    } catch (e) {
      console.warn('Highlight could not be applied', h.cfiRange, e);
    }
  }

  function removeHighlightFromRendition(h) {
    if (!rendition) return;
    try { rendition.annotations.remove(h.cfiRange, 'highlight'); } catch (e) { /* ignore */ }
  }

  /* ── State / access ── */

  function getBook() { return book; }
  function getRendition() { return rendition; }
  function currentCfi() {
    return currentLocation && currentLocation.start ? currentLocation.start.cfi : null;
  }
  function currentPercentage() {
    return record ? record.progress.percentage || 0 : 0;
  }
  function currentChapterLabel() {
    return currentLocation ? chapterLabelFor(currentLocation.start.href) : '';
  }

  /* ── TTS ── */

  async function getTtsBlocks() {
    if (!rendition) return [];
    const contents = rendition.getContents()[0];
    if (!contents) return [];
    const doc = contents.document;
    const all = [...doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, dd, dt')]
      .filter((el) => el.textContent.trim().length > 0);
    if (!all.length) {
      const bodyText = doc.body.textContent.trim();
      return bodyText ? [{ text: bodyText, el: null }] : [];
    }
    let startIdx = 0;
    try {
      if (currentLocation && currentFlow !== 'scrolled') {
        const range = contents.range(currentLocation.start.cfi);
        if (range) {
          const node = range.startContainer;
          const el = node.nodeType === 1 ? node : node.parentElement;
          const idx = all.findIndex((b) => b === el || b.contains(el));
          if (idx >= 0) {
            startIdx = idx;
          } else {
            const after = all.findIndex((b) => node.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
            if (after >= 0) startIdx = after;
          }
        }
      }
    } catch (e) { /* read from the start of the section */ }
    return all.slice(startIdx).map((el) => ({ text: el.textContent.trim(), el }));
  }

  async function ttsAdvance() {
    if (!rendition) return false;
    const loc = currentLocation;
    await rendition.next();
    await new Promise((r) => setTimeout(r, 250));
    // at the end of the book the position stops changing
    if (loc && currentLocation && loc.start.cfi === currentLocation.start.cfi) return false;
    return true;
  }

  /* ── Teardown ── */

  function close() {
    try { if (rendition) rendition.destroy(); } catch (e) { /* ignore */ }
    try { if (book) book.destroy(); } catch (e) { /* ignore */ }
    rendition = null;
    book = null;
    record = null;
    toc = [];
    currentLocation = null;
    $('epub-viewport').innerHTML = '';
    $('epub-container').hidden = true;
    $('epub-controls').hidden = true;
    App.setPageIndicator(null, null);
  }

  function init() {
    App.Utils.on('epub:settings-changed', onSettingsChanged);
    App.Utils.on('theme:changed', (theme) => applyTheme(theme));
    // wheel events over the margins / tap zones never reach the iframe
    $('epub-container').addEventListener('wheel', onWheel, { passive: false });
  }

  return {
    init, open, close, next, prev, goToStart, goToEnd, display, goToPercentage,
    getBook, getRendition, currentCfi, currentPercentage, currentChapterLabel, chapterLabelFor,
    addHighlightToRendition, removeHighlightFromRendition,
    getTtsBlocks, ttsAdvance, applyTypography
  };
})();
