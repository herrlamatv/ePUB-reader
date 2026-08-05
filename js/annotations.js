/* App.Annotations – Lesezeichen, Highlights (EPUB: CFI, PDF: Seiten-Rects), Notizen, Export */
window.App = window.App || {};

App.Annotations = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const COLORS = { yellow: '#facc15', green: '#4ade80', blue: '#60a5fa', pink: '#f472b6' };

  let pendingSelection = null;   // { format, text, cfiRange | page+rects }
  let editingHighlightId = null;
  let appliedEpub = new Set();
  let openNoteAfterHighlight = false;

  function book() { return App.state.currentBook; }

  /* ══════════ Auswahl → Popup ══════════ */

  function onEpubSelected(cfiRange, contents) {
    const sel = contents.window.getSelection();
    const text = sel ? sel.toString() : '';
    if (!text.trim()) return;
    let x = window.innerWidth / 2;
    let y = 100;
    try {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const iframe = contents.window.frameElement;
      const ifr = iframe ? iframe.getBoundingClientRect() : { left: 0, top: 0 };
      x = ifr.left + rect.left + rect.width / 2;
      y = ifr.top + rect.top;
    } catch (e) { /* Standardposition */ }
    pendingSelection = { format: 'epub', cfiRange, text, contents };
    showSelectionPopup(x, y);
  }

  function onPdfSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString();
    if (!text.trim()) return;
    let range;
    try { range = sel.getRangeAt(0); } catch (e) { return; }
    const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    if (!startEl) return;
    const pageEl = startEl.closest('.pdf-page');
    if (!pageEl) return;
    const pageNum = Number(pageEl.dataset.page);
    const pr = pageEl.getBoundingClientRect();
    const scale = App.PdfReader.getScale();
    const rects = mergeRects(
      [...range.getClientRects()]
        .filter((r) => r.width > 1 && r.height > 1 &&
          r.left >= pr.left - 2 && r.right <= pr.right + 2 &&
          r.top >= pr.top - 2 && r.bottom <= pr.bottom + 2)
        .map((r) => ({
          x: (r.left - pr.left) / scale,
          y: (r.top - pr.top) / scale,
          w: r.width / scale,
          h: r.height / scale
        }))
    );
    if (!rects.length) return;
    const firstClient = range.getClientRects()[0];
    pendingSelection = { format: 'pdf', page: pageNum, rects, text };
    showSelectionPopup(firstClient.left + firstClient.width / 2, firstClient.top);
  }

  /* Rechtecke derselben Zeile zusammenfassen */
  function mergeRects(rects) {
    const sorted = rects.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const merged = [];
    sorted.forEach((r) => {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last.y - r.y) < 3 && r.x <= last.x + last.w + 6) {
        const right = Math.max(last.x + last.w, r.x + r.w);
        last.w = right - last.x;
        last.h = Math.max(last.h, r.h);
      } else {
        merged.push({ x: r.x, y: r.y, w: r.w, h: r.h });
      }
    });
    return merged.map((r) => ({
      x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100,
      w: Math.round(r.w * 100) / 100, h: Math.round(r.h * 100) / 100
    }));
  }

  function showSelectionPopup(x, y) {
    const popup = $('selection-popup');
    popup.hidden = false;
    const rect = popup.getBoundingClientRect();
    popup.style.left = `${App.Utils.clamp(x - rect.width / 2, 8, window.innerWidth - rect.width - 8)}px`;
    popup.style.top = `${App.Utils.clamp(y - rect.height - 10, 8, window.innerHeight - rect.height - 8)}px`;
  }

  function hidePopups() {
    if (!$('note-popover').hidden) saveNoteAndClose();
    $('selection-popup').hidden = true;
  }

  function popupVisible() {
    return !$('selection-popup').hidden || !$('note-popover').hidden;
  }

  /* ══════════ Highlights ══════════ */

  function addHighlight(color) {
    const b = book();
    if (!pendingSelection || !b) return null;
    const h = {
      id: App.Utils.uuid(),
      createdAt: Date.now(),
      color: COLORS[color] ? color : 'yellow',
      text: pendingSelection.text.slice(0, 1000).trim(),
      note: ''
    };
    if (pendingSelection.format === 'epub') {
      h.cfiRange = pendingSelection.cfiRange;
      h.percentage = App.EpubReader.currentPercentage();
    } else {
      h.page = pendingSelection.page;
      h.rects = pendingSelection.rects;
    }
    b.highlights.push(h);
    App.Store.save();

    if (pendingSelection.format === 'epub') {
      App.EpubReader.addHighlightToRendition(h);
      appliedEpub.add(h.id);
      try { pendingSelection.contents.window.getSelection().removeAllRanges(); } catch (e) { /* egal */ }
    } else {
      refreshPdfPage(h.page);
      window.getSelection().removeAllRanges();
    }
    $('selection-popup').hidden = true;
    pendingSelection = null;
    renderLists();
    return h;
  }

  function deleteHighlight(id) {
    const b = book();
    if (!b) return;
    const idx = b.highlights.findIndex((h) => h.id === id);
    if (idx < 0) return;
    const h = b.highlights[idx];
    b.highlights.splice(idx, 1);
    App.Store.save();
    if (h.cfiRange) {
      App.EpubReader.removeHighlightFromRendition(h);
      appliedEpub.delete(id);
    } else if (h.page) {
      refreshPdfPage(h.page);
    }
    renderLists();
  }

  function refreshPdfPage(pageNum) {
    const el = App.PdfReader.getPageEl(pageNum);
    if (el) renderPdfPageHighlights(el, pageNum, App.PdfReader.getScale());
  }

  /* Beim Öffnen eines EPUBs alle gespeicherten Highlights anwenden */
  function applyEpubHighlights() {
    const b = book();
    if (!b || b.format !== 'epub') return;
    b.highlights.forEach((h) => {
      if (h.cfiRange && !appliedEpub.has(h.id)) {
        App.EpubReader.addHighlightToRendition(h);
        appliedEpub.add(h.id);
      }
    });
  }

  function resetEpubApplied() { appliedEpub = new Set(); }

  /* PDF: Highlight-Ebene einer Seite neu zeichnen (von PdfReader nach jedem Render aufgerufen) */
  function renderPdfPageHighlights(pageEl, pageNum, scale) {
    const b = book();
    const layer = pageEl.querySelector('.hl-layer');
    if (!layer) return;
    layer.innerHTML = '';
    if (!b || b.format !== 'pdf') return;
    b.highlights.filter((h) => h.page === pageNum).forEach((h) => {
      (h.rects || []).forEach((r) => {
        const div = document.createElement('div');
        div.className = 'hl';
        div.style.left = `${r.x * scale}px`;
        div.style.top = `${r.y * scale}px`;
        div.style.width = `${r.w * scale}px`;
        div.style.height = `${r.h * scale}px`;
        div.style.background = COLORS[h.color] || COLORS.yellow;
        div.style.opacity = '0.45';
        div.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openNotePopover(h.id, div.getBoundingClientRect());
        });
        layer.appendChild(div);
      });
    });
  }

  function onEpubHighlightClick(id, event) {
    let rect = null;
    try {
      const target = event.target;
      rect = target.getBoundingClientRect();
      if (target.ownerDocument !== document) {
        const iframe = target.ownerDocument.defaultView.frameElement;
        if (iframe) {
          const ifr = iframe.getBoundingClientRect();
          rect = { left: ifr.left + rect.left, top: ifr.top + rect.top, width: rect.width, height: rect.height };
        }
      }
    } catch (e) { /* Standardposition */ }
    openNotePopover(id, rect);
  }

  /* ══════════ Notiz-Popover ══════════ */

  function openNotePopover(id, anchorRect) {
    const b = book();
    const h = b && b.highlights.find((x) => x.id === id);
    if (!h) return;
    editingHighlightId = id;
    $('selection-popup').hidden = true;
    const pop = $('note-popover');
    $('note-excerpt').textContent = h.text;
    $('note-text').value = h.note || '';
    pop.querySelectorAll('.hl-dot').forEach((dot) => {
      dot.classList.toggle('active', dot.dataset.color === h.color);
    });
    pop.hidden = false;
    const rect = pop.getBoundingClientRect();
    let x = window.innerWidth / 2 - rect.width / 2;
    let y = window.innerHeight / 2 - rect.height / 2;
    if (anchorRect) {
      x = anchorRect.left + (anchorRect.width || 0) / 2 - rect.width / 2;
      y = anchorRect.top + (anchorRect.height || 0) + 8;
    }
    pop.style.left = `${App.Utils.clamp(x, 8, window.innerWidth - rect.width - 8)}px`;
    pop.style.top = `${App.Utils.clamp(y, 8, window.innerHeight - rect.height - 8)}px`;
    $('note-text').focus();
  }

  function saveNoteAndClose() {
    const pop = $('note-popover');
    if (pop.hidden) return;
    const b = book();
    const h = b && b.highlights.find((x) => x.id === editingHighlightId);
    if (h) {
      const newNote = $('note-text').value.trim();
      if (newNote !== (h.note || '')) {
        h.note = newNote;
        App.Store.save();
        renderLists();
      }
    }
    pop.hidden = true;
    editingHighlightId = null;
  }

  function setHighlightColor(id, color) {
    const b = book();
    const h = b && b.highlights.find((x) => x.id === id);
    if (!h || !COLORS[color]) return;
    h.color = color;
    App.Store.save();
    if (h.cfiRange) {
      App.EpubReader.removeHighlightFromRendition(h);
      appliedEpub.delete(id);
      App.EpubReader.addHighlightToRendition(h);
      appliedEpub.add(id);
    } else if (h.page) {
      refreshPdfPage(h.page);
    }
    $('note-popover').querySelectorAll('.hl-dot').forEach((dot) => {
      dot.classList.toggle('active', dot.dataset.color === color);
    });
    renderLists();
  }

  /* ══════════ Lesezeichen ══════════ */

  function currentPosition() {
    const b = book();
    if (!b) return null;
    if (b.format === 'epub') {
      const cfi = App.EpubReader.currentCfi();
      if (!cfi) return null;
      return {
        cfi,
        percentage: App.EpubReader.currentPercentage(),
        label: App.EpubReader.currentChapterLabel() ||
          App.I18n.t('annotations.position', { p: Math.round(App.EpubReader.currentPercentage() * 100) })
      };
    }
    const page = App.PdfReader.currentPageNum();
    return {
      page,
      percentage: b.progress.percentage || 0,
      label: App.I18n.t('annotations.pageN', { n: page })
    };
  }

  function findBookmarkAtCurrent() {
    const b = book();
    const pos = currentPosition();
    if (!b || !pos) return null;
    return b.bookmarks.find((bm) => (pos.cfi ? bm.cfi === pos.cfi : bm.page === pos.page)) || null;
  }

  function toggleBookmark() {
    const b = book();
    const pos = currentPosition();
    if (!b || !pos) return;
    const existing = findBookmarkAtCurrent();
    if (existing) {
      b.bookmarks = b.bookmarks.filter((bm) => bm.id !== existing.id);
      App.Utils.toast(App.I18n.t('annotations.bookmarkRemoved'));
    } else {
      b.bookmarks.push({
        id: App.Utils.uuid(),
        createdAt: Date.now(),
        cfi: pos.cfi || null,
        page: pos.page || null,
        percentage: pos.percentage,
        label: pos.label
      });
      App.Utils.toast(App.I18n.t('annotations.bookmarkAdded'));
    }
    App.Store.save();
    updateBookmarkButton();
    renderLists();
  }

  function updateBookmarkButton() {
    const btn = $('btn-bookmark');
    if (!btn) return;
    const active = !!findBookmarkAtCurrent();
    btn.classList.toggle('active', active);
    App.Utils.setIcon(btn.querySelector('.icon'), active ? 'bookmarkFilled' : 'bookmark');
  }

  /* ══════════ Listen im Drawer ══════════ */

  function jumpTo(item) {
    const b = book();
    if (!b) return;
    if (b.format === 'epub' && (item.cfi || item.cfiRange)) {
      App.EpubReader.display(item.cfiRange || item.cfi);
    } else if (item.page) {
      App.PdfReader.goToPage(item.page);
    }
    App.closeDrawers();
  }

  function renderLists() {
    const b = book();
    const bmList = $('bookmark-list');
    const hlList = $('highlight-list');
    if (!b) { bmList.innerHTML = ''; hlList.innerHTML = ''; return; }
    const esc = App.Utils.escapeHtml;
    const t = App.I18n.t;

    // Lesezeichen
    bmList.innerHTML = '';
    if (!b.bookmarks.length) {
      bmList.innerHTML = `<p class="empty-hint">${esc(t('annotations.noneBookmarks'))}</p>`;
    } else {
      b.bookmarks.slice().sort((x, y) => (x.percentage || 0) - (y.percentage || 0)).forEach((bm) => {
        const el = document.createElement('div');
        el.className = 'annotation-item';
        el.innerHTML = `
          <div class="excerpt">${esc(bm.label)}</div>
          <div class="anno-meta">
            <span>${Math.round((bm.percentage || 0) * 100)} %</span>
            <span>${esc(App.Utils.formatDate(bm.createdAt))}</span>
          </div>
          <button class="icon-btn sm anno-delete danger">${App.Icons.trash}</button>`;
        el.addEventListener('click', (ev) => {
          if (ev.target.closest('.anno-delete')) {
            b.bookmarks = b.bookmarks.filter((x) => x.id !== bm.id);
            App.Store.save();
            updateBookmarkButton();
            renderLists();
          } else {
            jumpTo(bm);
          }
        });
        bmList.appendChild(el);
      });
    }

    // Markierungen
    hlList.innerHTML = '';
    if (!b.highlights.length) {
      hlList.innerHTML = `<p class="empty-hint">${esc(t('annotations.noneHighlights'))}</p>`;
    } else {
      b.highlights.slice().sort((x, y) => {
        const px = x.page || Math.round((x.percentage || 0) * 10000);
        const py = y.page || Math.round((y.percentage || 0) * 10000);
        return px - py || x.createdAt - y.createdAt;
      }).forEach((h) => {
        const el = document.createElement('div');
        el.className = `annotation-item hl-${h.color}`;
        const loc = h.page
          ? t('annotations.pageN', { n: h.page })
          : t('annotations.position', { p: Math.round((h.percentage || 0) * 100) });
        el.innerHTML = `
          <div class="excerpt">${esc(h.text)}</div>
          ${h.note ? `<div class="note-preview">${esc(h.note)}</div>` : ''}
          <div class="anno-meta"><span>${esc(loc)}</span><span>${esc(App.Utils.formatDate(h.createdAt))}</span></div>
          <button class="icon-btn sm anno-delete danger">${App.Icons.trash}</button>`;
        el.addEventListener('click', (ev) => {
          if (ev.target.closest('.anno-delete')) {
            deleteHighlight(h.id);
          } else {
            jumpTo(h);
          }
        });
        hlList.appendChild(el);
      });
    }
  }

  /* ══════════ Export ══════════ */

  function exportMarkdown() {
    const b = book();
    if (!b) return;
    const t = App.I18n.t;
    const lines = [`# ${b.title}`, ''];
    if (b.author) lines.push(`**${t('details.author')}:** ${b.author}`, '');
    if (b.bookmarks.length) {
      lines.push(`## ${t('annotations.bookmarks')}`, '');
      b.bookmarks.forEach((bm) => {
        lines.push(`- ${bm.label} (${Math.round((bm.percentage || 0) * 100)} %)`);
      });
      lines.push('');
    }
    if (b.highlights.length) {
      lines.push(`## ${t('annotations.highlights')}`, '');
      b.highlights.forEach((h) => {
        const loc = h.page ? t('annotations.pageN', { n: h.page }) : `${Math.round((h.percentage || 0) * 100)} %`;
        lines.push(`> ${h.text}`, '', `*${loc}*`);
        if (h.note) lines.push('', `**Notiz:** ${h.note}`);
        lines.push('');
      });
    }
    App.Utils.downloadText(`${App.Utils.sanitizeName(b.title) || 'annotationen'}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
    App.Utils.toast(t('annotations.exported'));
  }

  /* ══════════ Lifecycle & Bindings ══════════ */

  function onReaderOpened() {
    resetEpubApplied();
    applyEpubHighlights();
    updateBookmarkButton();
    renderLists();
  }

  function init() {
    // Auswahl-Popup
    $('selection-popup').querySelectorAll('.hl-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        const h = addHighlight(dot.dataset.color);
        if (h && openNoteAfterHighlight) {
          openNoteAfterHighlight = false;
          openNotePopover(h.id, null);
        }
      });
    });
    $('sel-note').addEventListener('click', () => {
      const h = addHighlight('yellow');
      if (h) openNotePopover(h.id, null);
    });
    $('sel-copy').addEventListener('click', () => {
      if (pendingSelection) {
        navigator.clipboard.writeText(pendingSelection.text).then(() => {
          App.Utils.toast(App.I18n.t('annotations.copied'));
        }).catch(() => { /* egal */ });
      }
      $('selection-popup').hidden = true;
    });
    $('sel-tts').addEventListener('click', () => {
      $('selection-popup').hidden = true;
      App.TTS.start();
    });

    // Notiz-Popover
    $('note-close').addEventListener('click', saveNoteAndClose);
    $('note-delete').addEventListener('click', () => {
      const id = editingHighlightId;
      $('note-popover').hidden = true;
      editingHighlightId = null;
      if (id) deleteHighlight(id);
    });
    $('note-popover').querySelectorAll('.note-colors .hl-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        if (editingHighlightId) setHighlightColor(editingHighlightId, dot.dataset.color);
      });
    });

    $('btn-bookmark').addEventListener('click', toggleBookmark);
    $('btn-export-annotations').addEventListener('click', exportMarkdown);

    App.Utils.on('lang:changed', renderLists);
  }

  return {
    COLORS, init, onReaderOpened,
    onEpubSelected, onPdfSelection, onEpubHighlightClick,
    addHighlight, deleteHighlight, applyEpubHighlights, resetEpubApplied, renderPdfPageHighlights,
    toggleBookmark, updateBookmarkButton, renderLists, exportMarkdown,
    hidePopups, popupVisible
  };
})();
