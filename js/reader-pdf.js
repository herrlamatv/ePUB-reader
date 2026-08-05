/* App.PdfReader – pdf.js-Integration: virtualisierte Seiten, Text-Layer, Zoom, Outline */
window.App = window.App || {};

App.PdfReader = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MAX_CANVAS_PIXELS = 16 * 1024 * 1024; // Backing-Store-Limit pro Seite

  let pdf = null;
  let record = null;
  let container = null;
  let numPages = 0;
  let scale = 1;
  let zoomMode = 'fit-width'; // fit-width | fit-page | custom
  let currentPage = 1;
  let pageEls = [];
  let baseSizes = {};        // pageNum → { width, height } bei Scale 1
  let page1Base = null;
  let observer = null;
  let renderTasks = new Map();
  let renderedScale = new Map();
  let scrollRaf = 0;

  async function open(rec, file) {
    record = rec;
    container = $('pdf-viewport');
    container.hidden = false;
    $('pdf-controls').hidden = false;
    zoomMode = 'fit-width';

    const buffer = await file.arrayBuffer();
    pdf = await pdfjsLib.getDocument({ data: buffer, isEvalSupported: false }).promise;
    numPages = pdf.numPages;
    record.progress.totalPages = numPages;

    const page1 = await pdf.getPage(1);
    const vp = page1.getViewport({ scale: 1 });
    page1Base = { width: vp.width, height: vp.height };
    baseSizes[1] = page1Base;

    computeScale();
    buildPages();
    applyInvert();

    $('pdf-page-count').textContent = `/ ${numPages}`;
    $('pdf-page-input').max = numPages;
    $('pdf-progress-slider').max = numPages;

    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('click', onClick);

    const startPage = App.Utils.clamp(rec.progress.page || 1, 1, numPages);
    requestAnimationFrame(() => {
      goToPage(startPage, true);
      updatePageUI();
    });

    loadOutline();
  }

  /* ── Layout & Zoom ── */

  function computeScale() {
    if (!page1Base) return;
    const availW = Math.max(200, container.clientWidth - 48);
    if (zoomMode === 'fit-width') {
      scale = availW / page1Base.width;
    } else if (zoomMode === 'fit-page') {
      const availH = Math.max(200, container.clientHeight - 130);
      scale = Math.min(availW / page1Base.width, availH / page1Base.height);
    }
    scale = App.Utils.clamp(scale, 0.2, 5);
  }

  function buildPages() {
    container.innerHTML = '';
    pageEls = [null];
    for (let i = 1; i <= numPages; i++) {
      const el = document.createElement('div');
      el.className = 'pdf-page';
      el.dataset.page = i;
      sizeWrapper(el, i);
      container.appendChild(el);
      pageEls.push(el);
    }
    setupObserver();
  }

  function sizeWrapper(el, pageNum) {
    const base = baseSizes[pageNum] || page1Base;
    el.style.width = `${Math.floor(base.width * scale)}px`;
    el.style.height = `${Math.floor(base.height * scale)}px`;
  }

  function setupObserver() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) renderPage(Number(en.target.dataset.page));
      });
    }, { root: container, rootMargin: '800px 0px' });
    pageEls.forEach((el) => { if (el) observer.observe(el); });
  }

  async function renderPage(pageNum) {
    if (!pdf) return;
    if (renderedScale.get(pageNum) === scale) return;
    if (renderTasks.has(pageNum)) return;
    renderTasks.set(pageNum, true);

    try {
      const page = await pdf.getPage(pageNum);
      const base = page.getViewport({ scale: 1 });
      baseSizes[pageNum] = { width: base.width, height: base.height };
      const viewport = page.getViewport({ scale });
      const el = pageEls[pageNum];
      if (!el) return;
      sizeWrapper(el, pageNum);
      el.style.setProperty('--scale-factor', String(scale));

      // HiDPI-Canvas mit Pixel-Obergrenze
      let dpr = window.devicePixelRatio || 1;
      while (dpr > 1 && viewport.width * viewport.height * dpr * dpr > MAX_CANVAS_PIXELS) {
        dpr = Math.max(1, dpr - 0.25);
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      const ctx = canvas.getContext('2d');

      const task = page.render({
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
      });
      await task.promise;

      const textLayer = document.createElement('div');
      textLayer.className = 'textLayer';
      try {
        const textContent = await page.getTextContent();
        pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayer,
          viewport,
          textDivs: []
        });
      } catch (e) {
        console.warn('Text-Layer fehlgeschlagen', pageNum, e);
      }

      const hlLayer = document.createElement('div');
      hlLayer.className = 'hl-layer';

      el.replaceChildren(canvas, textLayer, hlLayer);
      renderedScale.set(pageNum, scale);
      App.Annotations.renderPdfPageHighlights(el, pageNum, scale);
      cleanupFarPages();
    } catch (e) {
      if (!(e && e.name === 'RenderingCancelledException')) {
        console.warn('Seite konnte nicht gerendert werden', pageNum, e);
      }
    } finally {
      renderTasks.delete(pageNum);
    }
  }

  /* Weit entfernte Seiten wieder freigeben (Speicher) */
  function cleanupFarPages() {
    renderedScale.forEach((_, pageNum) => {
      if (Math.abs(pageNum - currentPage) > 6) {
        const el = pageEls[pageNum];
        if (el) el.replaceChildren();
        renderedScale.delete(pageNum);
      }
    });
  }

  function relayout() {
    const keepPage = currentPage;
    computeScale();
    renderedScale.clear();
    for (let i = 1; i <= numPages; i++) sizeWrapper(pageEls[i], i);
    setupObserver(); // löst Initial-Callbacks für sichtbare Seiten aus
    goToPage(keepPage, true);
    updateZoomLabel();
  }

  function zoomIn() { zoomMode = 'custom'; scale = App.Utils.clamp(scale * 1.15, 0.2, 5); relayout(); }
  function zoomOut() { zoomMode = 'custom'; scale = App.Utils.clamp(scale / 1.15, 0.2, 5); relayout(); }

  function cycleZoomMode() {
    zoomMode = zoomMode === 'fit-width' ? 'fit-page' : 'fit-width';
    relayout();
  }

  function resetZoom() { zoomMode = 'fit-width'; relayout(); }

  function updateZoomLabel() {
    const label = $('zoom-label');
    if (!label) return;
    if (zoomMode === 'fit-width') label.textContent = App.I18n.t('reader.fitWidth');
    else if (zoomMode === 'fit-page') label.textContent = App.I18n.t('reader.fitPage');
    else label.textContent = `${Math.round(scale * 100)} %`;
  }

  const onResize = App.Utils.debounce(() => {
    if (!pdf) return;
    if (zoomMode !== 'custom') relayout();
  }, 200);

  /* ── Navigation & Fortschritt ── */

  function onScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      updateCurrentPage();
    });
  }

  function updateCurrentPage() {
    if (!pageEls.length) return;
    const mid = container.scrollTop + container.clientHeight / 2;
    let best = 1;
    for (let i = 1; i <= numPages; i++) {
      const el = pageEls[i];
      if (!el) continue;
      if (el.offsetTop <= mid) best = i; else break;
    }
    if (best !== currentPage) {
      currentPage = best;
      record.progress.page = best;
      record.progress.percentage = numPages > 1 ? (best - 1) / (numPages - 1) : 1;
      App.Store.save();
      updatePageUI();
      App.Annotations.updateBookmarkButton();
    }
    App.Stats.recordActivity();
  }

  function updatePageUI() {
    $('pdf-page-input').value = currentPage;
    $('pdf-progress-slider').value = currentPage;
    updateZoomLabel();
  }

  function goToPage(n, instant) {
    n = App.Utils.clamp(Math.round(n), 1, numPages);
    const el = pageEls[n];
    if (!el) return;
    currentPage = n;
    container.scrollTo({ top: Math.max(0, el.offsetTop - 12), behavior: instant ? 'auto' : 'smooth' });
    record.progress.page = n;
    record.progress.percentage = numPages > 1 ? (n - 1) / (numPages - 1) : 1;
    App.Store.save();
    updatePageUI();
  }

  function next() { goToPage(currentPage + 1); }
  function prev() { goToPage(currentPage - 1); }
  function goToStart() { goToPage(1); }
  function goToEnd() { goToPage(numPages); }
  function currentPageNum() { return currentPage; }
  function getScale() { return scale; }
  function getPageEl(n) { return pageEls[n] || null; }
  function getDocument() { return pdf; }
  function getNumPages() { return numPages; }

  /* ── Outline (TOC) ── */

  async function loadOutline() {
    let outline = [];
    try { outline = (await pdf.getOutline()) || []; } catch (e) { /* egal */ }
    const list = $('toc-list');
    list.innerHTML = '';
    const flat = [];
    (function walk(items, depth) {
      (items || []).forEach((item) => {
        flat.push({ title: item.title, dest: item.dest, depth });
        walk(item.items, depth + 1);
      });
    })(outline, 0);

    if (!flat.length) {
      list.innerHTML = `<p class="empty-hint">${App.Utils.escapeHtml(App.I18n.t('reader.noToc'))}</p>`;
      return;
    }
    flat.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = `toc-item depth-${Math.min(item.depth, 3)}`;
      btn.textContent = item.title;
      btn.addEventListener('click', async () => {
        await goToDest(item.dest);
        App.closeDrawers();
      });
      list.appendChild(btn);
    });
  }

  async function goToDest(dest) {
    try {
      let d = dest;
      if (typeof d === 'string') d = await pdf.getDestination(d);
      if (!Array.isArray(d) || !d[0]) return;
      const pageIndex = await pdf.getPageIndex(d[0]);
      goToPage(pageIndex + 1);
    } catch (e) {
      console.warn('Sprungziel nicht auflösbar', e);
    }
  }

  /* ── Interaktion ── */

  function onMouseUp() {
    setTimeout(() => App.Annotations.onPdfSelection(), 10);
  }

  function onClick(ev) {
    if (ev.target.closest('.hl-layer')) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    if (App.Annotations.popupVisible()) {
      App.Annotations.hidePopups();
      return;
    }
    App.toggleChrome();
  }

  function applyInvert() {
    if (!container) return;
    const dark = document.documentElement.dataset.theme === 'dark';
    const invert = !!App.Store.settings().pdf.invertDark;
    container.classList.toggle('inverted', dark && invert);
  }

  /* ── TTS ── */

  async function getTtsBlocks() {
    if (!pdf) return [];
    try {
      const page = await pdf.getPage(currentPage);
      const tc = await page.getTextContent();
      let text = '';
      tc.items.forEach((item) => {
        text += item.str + (item.hasEOL ? '\n' : ' ');
      });
      const paragraphs = text.split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
      if (!paragraphs.length) {
        const joined = text.replace(/\s+/g, ' ').trim();
        return joined ? [{ text: joined, el: null }] : [];
      }
      return paragraphs.map((p) => ({ text: p, el: null }));
    } catch (e) {
      return [];
    }
  }

  async function ttsAdvance() {
    if (currentPage >= numPages) return false;
    goToPage(currentPage + 1, true);
    return true;
  }

  /* ── Aufräumen ── */

  function close() {
    if (observer) { observer.disconnect(); observer = null; }
    if (container) {
      container.removeEventListener('scroll', onScroll);
      container.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('click', onClick);
      container.innerHTML = '';
      container.hidden = true;
    }
    window.removeEventListener('resize', onResize);
    $('pdf-controls').hidden = true;
    try { if (pdf) pdf.destroy(); } catch (e) { /* egal */ }
    pdf = null;
    record = null;
    pageEls = [];
    baseSizes = {};
    renderedScale.clear();
    renderTasks.clear();
    currentPage = 1;
  }

  function init() {
    App.Utils.on('theme:changed', applyInvert);
  }

  return {
    init, open, close, next, prev, goToStart, goToEnd, goToPage,
    zoomIn, zoomOut, cycleZoomMode, resetZoom,
    currentPageNum, getScale, getPageEl, getDocument, getNumPages,
    getTtsBlocks, ttsAdvance
  };
})();
