/* App.CbzReader – comic archives: one page per screen (fit page) or a continuous strip, lazy images, zoom */
window.App = window.App || {};

App.CbzReader = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const KEEP_AROUND = 6;        // decoded pages kept on each side of the current one
  const DEFAULT_RATIO = 1.5;    // height / width of a placeholder until a real page is known

  /* Mouse wheel paging in fit-page mode (same feel as the paginated EPUB view) */
  const WHEEL_STEP = 40;
  const WHEEL_COOLDOWN = 320;
  const WHEEL_GESTURE_GAP = 400;
  let wheelAccum = 0;
  let wheelLastEvent = 0;
  let wheelLastTurn = 0;

  let record = null;
  let container = null;
  let pages = [];             // [{ path, entry, type }] in reading order, index 0 = page 1
  let numPages = 0;
  let zoomMode = 'fit-page';  // fit-page | fit-width | custom
  let customWidth = 0;        // page width in px while zoomMode is 'custom'
  let currentPage = 1;
  let pageEls = [];
  let sizes = [];             // pageNum → { w, h } natural image size, once loaded
  let defaultRatio = DEFAULT_RATIO;
  let observer = null;
  let nearby = new Set();     // pages inside the observer's root margin
  let loading = new Set();
  let urls = new Map();       // pageNum → object URL of the decoded image
  let scrollRaf = 0;
  let layoutReady = false;    // scroll events before the first layout would report a wrong page
  let session = 0;            // bumped on open/close so late image loads are dropped

  async function open(rec, file) {
    record = rec;
    session += 1;
    container.hidden = false;
    $('pdf-controls').hidden = false;

    const { pages: list, info } = await App.Meta.openCbz(file);
    if (!list.length) throw new Error(App.I18n.t('reader.noImages'));
    pages = list;
    numPages = pages.length;
    record.progress.totalPages = numPages;
    record.pageCount = numPages;
    zoomMode = storedFitMode();

    $('pdf-page-count').textContent = `/ ${numPages}`;
    $('pdf-page-input').max = numPages;
    $('pdf-progress-slider').max = numPages;

    buildPages();
    // the start page decides the placeholder size, so the layout barely shifts while loading
    currentPage = App.Utils.clamp(rec.progress.page || 1, 1, numPages);
    await loadPage(currentPage);
    if (sizes[currentPage]) defaultRatio = sizes[currentPage].h / sizes[currentPage].w;
    relayout();
    layoutReady = true;
    setupObserver();
    buildToc(info);
  }

  /* ── Layout & zoom ── */

  function storedFitMode() {
    const o = record && record.settingsOverride;
    return (o && o.cbzZoom) || 'fit-page';
  }

  function availWidth() { return Math.max(200, container.clientWidth - 48); }
  function availHeight() { return Math.max(200, container.clientHeight - 136); }

  function frameSize(pageNum) {
    const s = sizes[pageNum];
    const ratio = s ? s.h / s.w : defaultRatio;
    let w;
    if (zoomMode === 'fit-page') w = Math.min(availWidth(), availHeight() / ratio);
    else if (zoomMode === 'fit-width') w = availWidth();
    else w = customWidth;
    return { w: Math.floor(w), h: Math.floor(w * ratio) };
  }

  function buildPages() {
    container.innerHTML = '';
    pageEls = [null];
    for (let i = 1; i <= numPages; i++) {
      const el = document.createElement('div');
      el.className = 'cbz-page';
      el.dataset.page = i;
      const frame = document.createElement('div');
      frame.className = 'cbz-frame';
      el.appendChild(frame);
      container.appendChild(el);
      pageEls.push(el);
    }
  }

  function sizePage(pageNum) {
    const frame = pageEls[pageNum].firstChild;
    const { w, h } = frameSize(pageNum);
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
  }

  function relayout() {
    container.classList.toggle('paged', zoomMode === 'fit-page');
    for (let i = 1; i <= numPages; i++) sizePage(i);
    goToPage(currentPage, true);
    updateZoomLabel();
  }

  function zoomBy(factor) {
    if (zoomMode !== 'custom') customWidth = frameSize(currentPage).w;
    zoomMode = 'custom';
    customWidth = App.Utils.clamp(customWidth * factor, availWidth() * 0.2, availWidth() * 4);
    relayout();
  }

  function zoomIn() { zoomBy(1.15); }
  function zoomOut() { zoomBy(1 / 1.15); }

  /* Fit modes are remembered per book: a webtoon stays a strip, a comic stays paged */
  function setFitMode(mode) {
    zoomMode = mode;
    record.settingsOverride = record.settingsOverride || {};
    record.settingsOverride.cbzZoom = mode;
    App.Store.save();
    relayout();
  }

  function cycleZoomMode() { setFitMode(zoomMode === 'fit-page' ? 'fit-width' : 'fit-page'); }
  function resetZoom() { setFitMode(storedFitMode()); }

  function updateZoomLabel() {
    const label = $('zoom-label');
    if (!label) return;
    if (zoomMode === 'fit-width') label.textContent = App.I18n.t('reader.fitWidth');
    else if (zoomMode === 'fit-page') label.textContent = App.I18n.t('reader.fitPage');
    else label.textContent = `${Math.round((customWidth / availWidth()) * 100)} %`;
  }

  const onResize = App.Utils.debounce(() => {
    if (numPages) relayout();
  }, 200);

  /* ── Images (decoded lazily, released when far away) ── */

  function setupObserver() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const n = Number(en.target.dataset.page);
        if (en.isIntersecting) {
          nearby.add(n);
          loadPage(n);
        } else {
          nearby.delete(n);
        }
      });
    }, { root: container, rootMargin: '1200px 0px' });
    pageEls.forEach((el) => { if (el) observer.observe(el); });
  }

  async function loadPage(pageNum) {
    if (urls.has(pageNum) || loading.has(pageNum)) return;
    const my = session;
    loading.add(pageNum);
    try {
      const blob = await App.Meta.cbzPageBlob(pages[pageNum - 1]);
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.alt = '';
      img.draggable = false;
      img.src = url;
      try {
        await img.decode();
      } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
      }
      if (my !== session || urls.has(pageNum)) {
        URL.revokeObjectURL(url);
        return;
      }
      urls.set(pageNum, url);
      sizes[pageNum] = { w: img.naturalWidth, h: img.naturalHeight };
      const el = pageEls[pageNum];
      el.firstChild.replaceChildren(img);
      // a page above the viewport that changes height would push the visible one away
      const before = el.offsetHeight;
      sizePage(pageNum);
      const delta = el.offsetHeight - before;
      if (delta && el.offsetTop < container.scrollTop) container.scrollTop += delta;
    } catch (e) {
      if (my === session) console.warn('Page could not be loaded', pages[pageNum - 1].path, e);
    } finally {
      if (my === session) loading.delete(pageNum);
    }
    if (my === session) cleanupFarPages();
  }

  /* Release decoded pages that are neither near the viewport nor near the current page (memory) */
  function cleanupFarPages() {
    urls.forEach((url, pageNum) => {
      if (nearby.has(pageNum) || Math.abs(pageNum - currentPage) <= KEEP_AROUND) return;
      pageEls[pageNum].firstChild.replaceChildren();
      URL.revokeObjectURL(url);
      urls.delete(pageNum);
    });
  }

  /* ── Navigation & progress ── */

  function onScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      updateCurrentPage();
    });
  }

  function updateCurrentPage() {
    if (!layoutReady) return;
    const mid = container.scrollTop + container.clientHeight / 2;
    let best = 1;
    for (let i = 1; i <= numPages; i++) {
      if (pageEls[i].offsetTop <= mid) best = i; else break;
    }
    if (best !== currentPage) {
      currentPage = best;
      saveProgress();
      updatePageUI();
      App.Annotations.updateBookmarkButton();
      cleanupFarPages();
    }
    App.Stats.recordActivity();
  }

  function saveProgress() {
    record.progress.page = currentPage;
    record.progress.percentage = numPages > 1 ? (currentPage - 1) / (numPages - 1) : 1;
    App.Store.save();
  }

  function updatePageUI() {
    $('pdf-page-input').value = currentPage;
    $('pdf-progress-slider').value = currentPage;
    App.setPageIndicator(currentPage, numPages);
    updateZoomLabel();
  }

  function goToPage(n, instant) {
    n = App.Utils.clamp(Math.round(n), 1, numPages);
    const el = pageEls[n];
    if (!el) return;
    currentPage = n;
    // fit page: every page fills exactly one screen and flips instantly like a comic reader;
    // strip: the page starts just below the top and the jump scrolls smoothly
    const paged = zoomMode === 'fit-page';
    const top = paged ? el.offsetTop : Math.max(0, el.offsetTop - 12);
    container.scrollTo({ top, behavior: instant || paged ? 'auto' : 'smooth' });
    saveProgress();
    updatePageUI();
    App.Annotations.updateBookmarkButton();
  }

  function next() { goToPage(currentPage + 1); }
  function prev() { goToPage(currentPage - 1); }
  function goToStart() { goToPage(1, true); }
  function goToEnd() { goToPage(numPages, true); }
  function currentPageNum() { return currentPage; }

  /* ── Chapters (TOC) ── */

  /* Bookmarks from ComicInfo.xml, otherwise one entry per folder inside the archive */
  function tocEntries(info) {
    if (info.bookmarks && info.bookmarks.length) {
      return info.bookmarks
        .filter((b) => b.index < numPages)
        .map((b) => ({ label: b.label, page: b.index + 1 }));
    }
    const dirs = pages.map((p) => p.path.split('/').slice(0, -1));
    if (new Set(dirs.map((d) => d.join('/'))).size < 2) return [];
    // drop the folders every page shares ("Comic/Chapter 1/01.jpg" → "Chapter 1")
    let common = 0;
    while (dirs.every((d) => d.length > common && d[common] === dirs[0][common])) common += 1;
    const entries = [];
    let last = null;
    dirs.forEach((d, i) => {
      const key = d.join('/');
      if (key === last) return;
      last = key;
      const label = d.slice(common).join(' / ') || App.I18n.t('annotations.pageN', { n: i + 1 });
      entries.push({ label, page: i + 1 });
    });
    return entries;
  }

  function buildToc(info) {
    const list = $('toc-list');
    list.innerHTML = '';
    const entries = tocEntries(info);
    if (!entries.length) {
      list.innerHTML = `<p class="empty-hint">${App.Utils.escapeHtml(App.I18n.t('reader.noToc'))}</p>`;
      return;
    }
    entries.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'toc-item depth-0';
      btn.textContent = item.label;
      btn.addEventListener('click', () => {
        goToPage(item.page, true);
        App.closeDrawers();
      });
      list.appendChild(btn);
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
    if (!numPages || zoomMode !== 'fit-page') return; // the strip scrolls natively
    if (ev.ctrlKey || ev.metaKey) return;              // leave zoom gestures alone
    if (ev.cancelable) ev.preventDefault();

    const now = Date.now();
    if (now - wheelLastEvent > WHEEL_GESTURE_GAP) wheelAccum = 0;
    wheelLastEvent = now;
    wheelAccum += wheelDistance(ev);

    if (Math.abs(wheelAccum) < WHEEL_STEP) return;
    if (now - wheelLastTurn < WHEEL_COOLDOWN) return;
    wheelLastTurn = now;
    const forward = wheelAccum > 0;
    wheelAccum = 0;
    if (forward) next(); else prev();
    App.showChrome();
  }

  /* Outer quarters turn the page, the middle toggles the bars */
  function onClick(ev) {
    if (!numPages) return;
    if (App.Annotations.popupVisible()) {
      App.Annotations.hidePopups();
      return;
    }
    const rect = container.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    if (x < 0.25) prev();
    else if (x > 0.75) next();
    else App.toggleChrome();
  }

  /* ── Teardown ── */

  function close() {
    session += 1;
    layoutReady = false;
    if (observer) { observer.disconnect(); observer = null; }
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls.clear();
    loading.clear();
    nearby.clear();
    container.innerHTML = '';
    container.hidden = true;
    container.classList.remove('paged');
    $('pdf-controls').hidden = true;
    App.setPageIndicator(null, null);
    record = null;
    pages = [];
    pageEls = [];
    sizes = [];
    numPages = 0;
    currentPage = 1;
    defaultRatio = DEFAULT_RATIO;
  }

  function init() {
    container = $('cbz-viewport');
    container.addEventListener('scroll', onScroll, { passive: true });
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('click', onClick);
    window.addEventListener('resize', onResize);
  }

  return {
    init, open, close, next, prev, goToStart, goToEnd, goToPage,
    zoomIn, zoomOut, cycleZoomMode, resetZoom, currentPageNum
  };
})();
