/* App.Library – Bibliothek: Ordnerwahl, Scan, Import mit Autoren-Sortierung, Ansicht */
window.App = window.App || {};

App.Library = (function () {
  'use strict';

  let filter = '';
  let activeAuthor = null;            // null = alle, '__unsorted__' = Dateien im Wurzelordner
  const coverUrls = new Map();        // bookId → ObjectURL
  const sessionFiles = new Map();     // Fallback-Modus: bookId → File (nur für diese Sitzung)
  let progressToast = null;

  const $ = (id) => document.getElementById(id);

  /* ── Boot ── */

  async function start() {
    if (!App.FS.supported()) {
      App.Store.loadFallback();
      App.Settings.applyFromStore();
      $('fallback-note').hidden = false;
      $('btn-open-single').hidden = false;
      $('btn-pick-folder').hidden = true;
      $('btn-import').hidden = true;
      $('btn-rescan').hidden = true;
      render();
      return;
    }

    const { handle, permission } = await App.FS.restore();
    if (!handle) {
      await App.Store.loadFromCache();
      App.Settings.applyFromStore();
      render();
      return;
    }
    if (permission === 'granted') {
      await openLibrary();
    } else {
      await App.Store.loadFromCache();
      App.Settings.applyFromStore();
      $('permission-banner').hidden = false;
      render();
    }
  }

  async function openLibrary() {
    $('permission-banner').hidden = true;
    await App.Store.load();
    App.Store.setReadonly(false);
    App.Settings.applyFromStore();
    await scanAndReconcile();
    render();
  }

  async function pickFolder() {
    try {
      await App.FS.pickLibrary();
    } catch (e) {
      if (e && e.name !== 'AbortError') {
        console.error(e);
        App.Utils.toast(App.I18n.t('library.folderError'), 'error');
      }
      return;
    }
    await openLibrary();
  }

  async function regrant() {
    const ok = await App.FS.requestPermission();
    if (ok) {
      await openLibrary();
    } else {
      App.Utils.toast(App.I18n.t('library.permissionDenied'), 'error');
    }
  }

  /* ── Scan & Abgleich (Umbenennungen via Fingerprint erkennen) ── */

  async function scanAndReconcile() {
    let found;
    try {
      found = await App.FS.scan();
    } catch (e) {
      console.error('Scan fehlgeschlagen', e);
      return;
    }
    const data = App.Store.getData();
    const records = Object.values(data.books);
    const fileByPath = new Map(found.map((f) => [f.path, f]));
    const recordPaths = new Set(records.map((r) => r.path));

    // 1) Pfad-Treffer
    records.forEach((r) => {
      const f = fileByPath.get(r.path);
      if (f) {
        r.missing = false;
        r.authorFolder = f.authorFolder;
      }
    });

    // 2) Unbekannte Dateien: erst Fingerprint gegen verwaiste Records, sonst neuer Eintrag
    const unmatchedFiles = found.filter((f) => !recordPaths.has(f.path));
    const orphanRecords = records.filter((r) => !fileByPath.has(r.path));
    let newCount = 0;

    for (const f of unmatchedFiles) {
      try {
        const file = await f.handle.getFile();
        const fp = await App.Utils.fingerprint(file);
        const orphan = orphanRecords.find((r) => App.Utils.sameFingerprint(r.fingerprint, fp));
        if (orphan) {
          orphan.path = f.path;
          orphan.authorFolder = f.authorFolder;
          orphan.missing = false;
          orphanRecords.splice(orphanRecords.indexOf(orphan), 1);
          continue;
        }
        const format = await App.Meta.detectFormat(file);
        if (!format) continue;
        const meta = await App.Meta.read(file, format);
        const rec = newRecord({ path: f.path, authorFolder: f.authorFolder, format, fp, meta, size: file.size });
        data.books[rec.id] = rec;
        if (meta.cover) await App.DB.set('covers', rec.id, meta.cover);
        newCount += 1;
      } catch (e) {
        console.warn('Datei übersprungen', f.path, e);
      }
    }

    // 3) Verbliebene Waisen als fehlend markieren
    orphanRecords.forEach((r) => { r.missing = true; });

    App.Store.save();
    if (newCount > 0) App.Utils.toast(App.I18n.t('library.newBooksFound', { n: newCount }));
  }

  function newRecord({ path, authorFolder, format, fp, meta, size }) {
    return {
      id: App.Utils.uuid(),
      path,
      authorFolder,
      format,
      fingerprint: fp,
      title: meta.title,
      author: meta.author || null,
      language: meta.language || null,
      pageCount: meta.pageCount || null,
      size: size || 0,
      addedAt: Date.now(),
      lastOpenedAt: null,
      missing: false,
      progress: { percentage: 0, cfi: null, page: null, totalPages: null },
      bookmarks: [],
      highlights: [],
      settingsOverride: {}
    };
  }

  /* ── Import mit Autoren-Sortierung ── */

  async function importFiles(fileList) {
    const files = [...fileList].filter((f) => /\.(epub|pdf)$/i.test(f.name));
    if (!files.length) return;

    // Fallback-Modus: Datei nur öffnen, nicht kopieren
    if (App.Store.isFallback()) {
      await openSingleFile(files[0]);
      return;
    }
    if (App.Store.isReadonly() || !App.FS.hasLibrary()) {
      App.Utils.toast(App.I18n.t('library.permissionNeeded'), 'error');
      return;
    }

    let imported = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      showProgress(App.I18n.t('library.importing', { current: i + 1, total: files.length }));
      try {
        const format = await App.Meta.detectFormat(file);
        if (!format) {
          App.Utils.toast(App.I18n.t('library.importFailed', { name: file.name }), 'error');
          continue;
        }
        const fp = await App.Utils.fingerprint(file);
        const dup = App.Store.findByFingerprint(fp);
        if (dup) {
          App.Utils.toast(App.I18n.t('library.duplicate', { title: dup.title }));
          continue;
        }
        const meta = await App.Meta.read(file, format);
        const authorDisplay = meta.author || App.I18n.t('library.unknownAuthor');
        const authorFolder = App.Utils.sanitizeName(authorDisplay) || 'Unknown Author';
        const baseName = App.Utils.sanitizeName(meta.title) || App.Utils.sanitizeName(file.name.replace(/\.(epub|pdf)$/i, '')) || 'Buch';
        const ext = format === 'epub' ? '.epub' : '.pdf';
        const path = await App.FS.writeBookFile(authorFolder, baseName, ext, file);
        const rec = newRecord({ path, authorFolder, format, fp, meta, size: file.size });
        App.Store.addBook(rec);
        if (meta.cover) await App.DB.set('covers', rec.id, meta.cover);
        imported += 1;
        render();
      } catch (e) {
        console.error('Import fehlgeschlagen', file.name, e);
        App.Utils.toast(App.I18n.t('library.importFailed', { name: file.name }), 'error');
      }
    }
    hideProgress();
    if (imported > 0) App.Utils.toast(App.I18n.t('library.imported', { n: imported }));
  }

  function showProgress(text) {
    if (!progressToast) {
      progressToast = document.createElement('div');
      progressToast.className = 'toast';
      $('toast-container').appendChild(progressToast);
    }
    progressToast.textContent = text;
  }

  function hideProgress() {
    if (progressToast) { progressToast.remove(); progressToast = null; }
  }

  /* Fallback: einzelne Datei ohne Bibliothek öffnen */
  async function openSingleFile(file) {
    const format = await App.Meta.detectFormat(file);
    if (!format) {
      App.Utils.toast(App.I18n.t('library.importFailed', { name: file.name }), 'error');
      return;
    }
    const fp = await App.Utils.fingerprint(file);
    let rec = App.Store.findByFingerprint(fp);
    if (!rec) {
      const meta = await App.Meta.read(file, format);
      rec = newRecord({ path: null, authorFolder: null, format, fp, meta, size: file.size });
      App.Store.addBook(rec);
      if (meta.cover) await App.DB.set('covers', rec.id, meta.cover);
    }
    sessionFiles.set(rec.id, file);
    render();
    App.openReader(rec, file);
  }

  /* ── Buch öffnen / löschen ── */

  async function openBook(id) {
    const rec = App.Store.getBook(id);
    if (!rec) return;
    let file = null;
    if (App.Store.isFallback() || !rec.path) {
      file = sessionFiles.get(id);
      if (!file) {
        $('file-input').click();
        return;
      }
    } else {
      if (App.Store.isReadonly()) {
        App.Utils.toast(App.I18n.t('library.permissionNeeded'), 'error');
        return;
      }
      try {
        file = await App.FS.getFile(rec.path);
      } catch (e) {
        rec.missing = true;
        App.Store.save();
        render();
        App.Utils.toast(App.I18n.t('library.missing'), 'error');
        return;
      }
    }
    App.openReader(rec, file);
  }

  async function deleteBook(id) {
    const rec = App.Store.getBook(id);
    if (!rec) return;
    const ok = await App.Utils.confirmDialog(
      App.I18n.t('library.deleteConfirm', { title: rec.title }),
      App.I18n.t('common.delete')
    );
    if (!ok) return;
    if (rec.path && !App.Store.isFallback() && !rec.missing) {
      try { await App.FS.deleteFile(rec.path); } catch (e) { console.warn('Datei-Löschung fehlgeschlagen', e); }
    }
    await App.DB.del('covers', id);
    await App.DB.del('locations', id);
    const url = coverUrls.get(id);
    if (url) { URL.revokeObjectURL(url); coverUrls.delete(id); }
    App.Store.removeBook(id);
    render();
    App.Utils.toast(App.I18n.t('library.deleted', { title: rec.title }));
  }

  /* ── Details-Dialog ── */

  let detailsBookId = null;

  async function showDetails(id) {
    const rec = App.Store.getBook(id);
    if (!rec) return;
    detailsBookId = id;
    $('details-title').value = rec.title || '';
    $('details-author').value = rec.author || '';
    const coverEl = $('details-cover');
    coverEl.innerHTML = '';
    const url = await getCoverUrl(id);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      coverEl.appendChild(img);
    } else {
      coverEl.style.background = App.Utils.coverGradient(rec.title);
    }
    const t = App.I18n.t;
    const pages = rec.pageCount || rec.progress.totalPages || null;
    const pagesText = !pages ? '–'
      : rec.format === 'epub' ? t('details.pagesEstimate', { n: pages }) : String(pages);
    const rows = [
      [t('details.format'), rec.format.toUpperCase()],
      [t('details.pages'), pagesText],
      [t('details.path'), rec.path || '–'],
      [t('details.size'), App.Utils.formatSize(rec.size)],
      [t('details.added'), App.Utils.formatDate(rec.addedAt)],
      [t('details.lastOpened'), App.Utils.formatDate(rec.lastOpenedAt)],
      [t('details.readingTime'), App.Utils.formatDuration(App.Stats.totalForBook(id))]
    ];
    $('details-meta').innerHTML = rows
      .map(([k, v]) => `<div><strong>${App.Utils.escapeHtml(k)}:</strong> ${App.Utils.escapeHtml(v)}</div>`)
      .join('');
    $('dialog-details').showModal();
  }

  async function saveDetails() {
    const rec = App.Store.getBook(detailsBookId);
    if (!rec) return;
    const newTitle = $('details-title').value.trim();
    const newAuthor = $('details-author').value.trim();
    if (newTitle) rec.title = newTitle;
    rec.author = newAuthor || null;

    // Autor geändert → Datei in neuen Autorenordner verschieben
    if (rec.path && !App.Store.isFallback() && !App.Store.isReadonly() && !rec.missing) {
      const targetFolder = App.Utils.sanitizeName(newAuthor || App.I18n.t('library.unknownAuthor')) || 'Unknown Author';
      if (targetFolder !== rec.authorFolder) {
        try {
          rec.path = await App.FS.moveFile(rec.path, targetFolder);
          rec.authorFolder = targetFolder;
          App.Utils.toast(App.I18n.t('details.moved', { author: targetFolder }));
        } catch (e) {
          console.error('Verschieben fehlgeschlagen', e);
        }
      }
    }
    App.Store.save();
    $('dialog-details').close();
    render();
    App.Utils.toast(App.I18n.t('details.saved'));
  }

  /* ── Rendering ── */

  function getGroups() {
    const groups = new Map(); // key: authorFolder oder '__unsorted__'
    App.Store.books().forEach((b) => {
      const key = b.authorFolder || '__unsorted__';
      groups.set(key, (groups.get(key) || 0) + 1);
    });
    return groups;
  }

  function sortBooks(books) {
    const sort = App.Store.settings().librarySort;
    const cmp = {
      recent: (a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0) || (b.addedAt || 0) - (a.addedAt || 0),
      title: (a, b) => String(a.title).localeCompare(String(b.title), App.I18n.locale()),
      author: (a, b) => String(a.author || '~').localeCompare(String(b.author || '~'), App.I18n.locale()) ||
        String(a.title).localeCompare(String(b.title), App.I18n.locale()),
      progress: (a, b) => (b.progress.percentage || 0) - (a.progress.percentage || 0),
      added: (a, b) => (b.addedAt || 0) - (a.addedAt || 0)
    }[sort] || ((a, b) => 0);
    return books.slice().sort(cmp);
  }

  function filteredBooks() {
    let books = App.Store.books();
    if (activeAuthor === '__unsorted__') {
      books = books.filter((b) => !b.authorFolder);
    } else if (activeAuthor) {
      books = books.filter((b) => b.authorFolder === activeAuthor);
    }
    if (filter) {
      const q = filter.toLowerCase();
      books = books.filter((b) =>
        String(b.title).toLowerCase().includes(q) || String(b.author || '').toLowerCase().includes(q)
      );
    }
    return sortBooks(books);
  }

  function render() {
    renderSidebar();
    renderBooks();
  }

  function renderSidebar() {
    const groups = getGroups();
    const total = App.Store.books().length;
    $('count-all').textContent = total;
    $('nav-all-books').classList.toggle('active', activeAuthor === null);

    const list = $('author-list');
    list.innerHTML = '';
    const keys = [...groups.keys()].sort((a, b) => {
      if (a === '__unsorted__') return 1;
      if (b === '__unsorted__') return -1;
      return a.localeCompare(b, App.I18n.locale());
    });
    keys.forEach((key) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'sidebar-item' + (activeAuthor === key ? ' active' : '');
      const label = key === '__unsorted__' ? App.I18n.t('library.unsorted') : key;
      btn.innerHTML = `<span class="icon">${key === '__unsorted__' ? App.Icons.folder : App.Icons.book}</span>` +
        `<span class="label">${App.Utils.escapeHtml(label)}</span>` +
        `<span class="count-badge">${groups.get(key)}</span>`;
      btn.addEventListener('click', () => {
        activeAuthor = activeAuthor === key ? null : key;
        render();
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  async function getCoverUrl(id) {
    if (coverUrls.has(id)) return coverUrls.get(id);
    try {
      const blob = await App.DB.get('covers', id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        coverUrls.set(id, url);
        return url;
      }
    } catch (e) { /* egal */ }
    return null;
  }

  function coverHtml(rec) {
    return `
      <span class="format-badge">${rec.format.toUpperCase()}</span>
      ${rec.progress.percentage > 0 ? `<div class="card-progress"><div style="width:${Math.round(rec.progress.percentage * 100)}%"></div></div>` : ''}
      ${rec.missing ? `<div class="missing-badge"><span class="icon">${App.Icons.warning}</span></div>` : ''}
    `;
  }

  function fallbackCover(rec) {
    return `<div class="cover-fallback" style="background:${App.Utils.coverGradient(rec.title)}">` +
      `<span class="fallback-title">${App.Utils.escapeHtml(rec.title)}</span></div>`;
  }

  function renderBooks() {
    const gridEl = $('book-grid');
    const books = filteredBooks();
    const hasLibrary = App.FS.hasLibrary() || App.Store.isFallback();
    const anyBooks = App.Store.books().length > 0;

    $('empty-state').hidden = hasLibrary && anyBooks;
    $('no-results').hidden = !(anyBooks && books.length === 0);
    if (!hasLibrary && !anyBooks) {
      gridEl.innerHTML = '';
      return;
    }

    const view = App.Store.settings().libraryView;
    gridEl.className = view;
    gridEl.innerHTML = '';

    books.forEach((rec) => {
      const el = document.createElement('div');
      el.dataset.id = rec.id;
      if (view === 'grid') {
        el.className = 'book-card' + (rec.missing ? ' missing' : '');
        el.innerHTML = `
          <div class="cover">${fallbackCover(rec)}${coverHtml(rec)}
            <button class="icon-btn sm card-menu" title="…">${App.Icons.kebab}</button>
          </div>
          <div class="meta">
            <div class="title">${App.Utils.escapeHtml(rec.title)}</div>
            <div class="author">${App.Utils.escapeHtml(rec.author || App.I18n.t('library.unknownAuthor'))}</div>
          </div>`;
      } else {
        el.className = 'book-row' + (rec.missing ? ' missing' : '');
        const pct = Math.round((rec.progress.percentage || 0) * 100);
        el.innerHTML = `
          <div class="cover">${fallbackCover(rec)}<span class="format-badge">${rec.format.toUpperCase()}</span></div>
          <div class="meta">
            <div class="title">${App.Utils.escapeHtml(rec.title)}</div>
            <div class="author">${App.Utils.escapeHtml(rec.author || App.I18n.t('library.unknownAuthor'))}</div>
          </div>
          <div class="row-progress"><div class="track"><div style="width:${pct}%"></div></div><span>${pct} %</span></div>
          <div class="row-date">${App.Utils.formatDate(rec.lastOpenedAt)}</div>
          <button class="icon-btn sm card-menu" title="…">${App.Icons.kebab}</button>`;
      }

      el.addEventListener('click', (ev) => {
        if (ev.target.closest('.card-menu')) {
          showDetails(rec.id);
        } else {
          openBook(rec.id);
        }
      });

      gridEl.appendChild(el);

      // Cover asynchron nachladen
      getCoverUrl(rec.id).then((url) => {
        if (!url) return;
        const coverEl = el.querySelector('.cover');
        if (!coverEl) return;
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        coverEl.insertBefore(img, coverEl.firstChild);
        const fb = coverEl.querySelector('.cover-fallback');
        if (fb) fb.remove();
      });
    });
  }

  /* ── UI-Bindings ── */

  function init() {
    $('btn-pick-folder').addEventListener('click', pickFolder);
    $('btn-regrant').addEventListener('click', regrant);
    $('btn-import').addEventListener('click', () => $('file-input').click());
    $('btn-open-single').addEventListener('click', () => $('file-input').click());
    $('btn-rescan').addEventListener('click', async () => {
      if (!App.FS.hasLibrary() || App.Store.isReadonly()) return;
      showProgress(App.I18n.t('library.scanning'));
      await scanAndReconcile();
      hideProgress();
      render();
    });
    $('file-input').addEventListener('change', async (ev) => {
      const files = ev.target.files;
      if (files && files.length) {
        if (App.Store.isFallback()) {
          await openSingleFile(files[0]);
        } else {
          await importFiles(files);
        }
      }
      ev.target.value = '';
    });
    $('library-search').addEventListener('input', (ev) => {
      filter = ev.target.value.trim();
      renderBooks();
    });
    $('library-sort').addEventListener('change', (ev) => {
      App.Store.settings().librarySort = ev.target.value;
      App.Store.save();
      renderBooks();
    });
    $('btn-view-toggle').addEventListener('click', () => {
      const s = App.Store.settings();
      s.libraryView = s.libraryView === 'grid' ? 'list' : 'grid';
      App.Store.save();
      updateViewToggleIcon();
      renderBooks();
    });
    $('nav-all-books').addEventListener('click', () => {
      activeAuthor = null;
      render();
    });
    $('btn-sidebar-toggle').addEventListener('click', () => {
      $('sidebar').classList.toggle('collapsed');
    });

    // Details-Dialog
    $('details-save').addEventListener('click', saveDetails);
    $('details-cancel').addEventListener('click', () => $('dialog-details').close());
    $('details-delete').addEventListener('click', async () => {
      $('dialog-details').close();
      await deleteBook(detailsBookId);
    });

    App.Utils.on('lang:changed', render);
    App.Utils.on('store:reloaded', render);
  }

  function updateViewToggleIcon() {
    const view = App.Store.settings().libraryView;
    App.Utils.setIcon($('btn-view-toggle').querySelector('.icon'), view === 'grid' ? 'list' : 'grid');
  }

  function syncControls() {
    $('library-sort').value = App.Store.settings().librarySort;
    updateViewToggleIcon();
  }

  return { init, start, render, importFiles, openBook, deleteBook, showDetails, syncControls, sessionFiles };
})();
