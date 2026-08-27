/* App.Search – full text search in the open book (EPUB: spine walk, PDF: text extraction) */
window.App = window.App || {};

App.Search = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MAX_RESULTS = 200;

  let token = 0;
  let results = [];
  let activeIndex = -1;
  let lastQuery = '';

  function status(text) { $('search-status').textContent = text || ''; }

  function reset() {
    token += 1;
    results = [];
    activeIndex = -1;
    lastQuery = '';
    $('search-results').innerHTML = '';
    $('book-search-input').value = '';
    status('');
  }

  async function run(query) {
    token += 1;
    const my = token;
    results = [];
    activeIndex = -1;
    lastQuery = query;
    $('search-results').innerHTML = '';
    if (!query || query.trim().length < 2) {
      status(App.I18n.t('search.tooShort'));
      return;
    }
    query = query.trim();
    const b = App.state.currentBook;
    if (!b) return;
    if (b.format === 'epub') {
      await searchEpub(query, my);
    } else {
      await searchPdf(query, my);
    }
    if (my === token) {
      status(results.length
        ? App.I18n.t('search.results', { n: results.length })
        : App.I18n.t('search.noResults'));
    }
  }

  async function searchEpub(query, my) {
    const book = App.EpubReader.getBook();
    if (!book) return;
    const items = book.spine.spineItems;
    for (let i = 0; i < items.length; i++) {
      if (my !== token || results.length >= MAX_RESULTS) return;
      status(App.I18n.t('search.searching', { current: i + 1, total: items.length }));
      const item = items[i];
      try {
        await item.load(book.load.bind(book));
        const found = (typeof item.find === 'function' ? item.find(query) : []) || [];
        found.forEach((r) => {
          if (results.length < MAX_RESULTS) {
            addResult({ cfi: r.cfi, excerpt: r.excerpt || '', loc: chapterLabel(item.href) }, query);
          }
        });
        item.unload();
      } catch (e) {
        console.warn('Search failed in section', item.href, e);
      }
      await App.Utils.nextFrame();
    }
  }

  function chapterLabel(href) {
    return App.EpubReader.chapterLabelFor(href) || (href ? href.split('/').pop() : '');
  }

  async function searchPdf(query, my) {
    const pdf = App.PdfReader.getDocument();
    if (!pdf) return;
    const total = App.PdfReader.getNumPages();
    const q = query.toLowerCase();
    for (let p = 1; p <= total; p++) {
      if (my !== token || results.length >= MAX_RESULTS) return;
      if (p % 5 === 0) status(App.I18n.t('search.searching', { current: p, total }));
      try {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        let text = '';
        tc.items.forEach((item) => { text += item.str + (item.hasEOL ? '\n' : ' '); });
        const lower = text.toLowerCase();
        let idx = lower.indexOf(q);
        while (idx !== -1 && results.length < MAX_RESULTS) {
          const start = Math.max(0, idx - 45);
          const end = Math.min(text.length, idx + q.length + 45);
          const excerpt = (start > 0 ? '… ' : '') + text.slice(start, end).replace(/\s+/g, ' ') + (end < text.length ? ' …' : '');
          addResult({ page: p, excerpt, loc: App.I18n.t('annotations.pageN', { n: p }) }, query);
          idx = lower.indexOf(q, idx + q.length);
        }
      } catch (e) { /* skip this page */ }
      if (p % 10 === 0) await App.Utils.nextFrame();
    }
  }

  function highlightQuery(excerpt, query) {
    const esc = App.Utils.escapeHtml(excerpt);
    const escQ = App.Utils.escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return esc.replace(new RegExp(`(${escQ})`, 'gi'), '<mark>$1</mark>');
    } catch (e) {
      return esc;
    }
  }

  function addResult(r, query) {
    const index = results.length;
    results.push(r);
    const btn = document.createElement('button');
    btn.className = 'search-result';
    btn.innerHTML = `${highlightQuery(r.excerpt, query)}<span class="result-loc">${App.Utils.escapeHtml(r.loc || '')}</span>`;
    btn.addEventListener('click', () => jumpTo(index));
    $('search-results').appendChild(btn);
  }

  async function jumpTo(index) {
    const r = results[index];
    if (!r) return;
    activeIndex = index;
    document.querySelectorAll('#search-results .search-result').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });
    const b = App.state.currentBook;
    if (!b) return;
    if (b.format === 'epub' && r.cfi) {
      await App.EpubReader.display(r.cfi);
      flashEpubResult(r.cfi);
    } else if (r.page) {
      App.PdfReader.goToPage(r.page);
      setTimeout(() => flashPdfResult(r.page), 450);
    }
  }

  function flashEpubResult(cfi) {
    const rendition = App.EpubReader.getRendition();
    if (!rendition) return;
    try {
      rendition.annotations.highlight(cfi, {}, null, 'leselampe-search-flash',
        { fill: '#60a5fa', 'fill-opacity': '0.45' });
      setTimeout(() => {
        try { rendition.annotations.remove(cfi, 'highlight'); } catch (e) { /* ignore */ }
      }, 2500);
    } catch (e) { /* ignore */ }
  }

  function flashPdfResult(pageNum) {
    const el = App.PdfReader.getPageEl(pageNum);
    if (!el) return;
    const q = lastQuery.toLowerCase();
    const spans = el.querySelectorAll('.textLayer > span, .textLayer > div');
    let flashed = 0;
    spans.forEach((span) => {
      if (flashed > 20) return;
      if (span.textContent.toLowerCase().includes(q)) {
        span.classList.add('search-hit');
        span.style.background = 'rgba(96,165,250,0.45)';
        flashed += 1;
        setTimeout(() => {
          span.classList.remove('search-hit');
          span.style.background = '';
        }, 2500);
      }
    });
  }

  function nextResult(dir) {
    if (!results.length) return;
    const idx = (activeIndex + dir + results.length) % results.length;
    jumpTo(idx);
  }

  const debouncedRun = App.Utils.debounce((q) => run(q), 400);

  function init() {
    const input = $('book-search-input');
    input.addEventListener('input', () => debouncedRun(input.value));
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        if (results.length) {
          nextResult(ev.shiftKey ? -1 : 1);
        } else {
          run(input.value);
        }
      }
    });
  }

  return { init, run, reset, nextResult };
})();
