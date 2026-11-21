/* App.Meta – format detection, metadata and cover extraction for EPUB, PDF & CBZ */
window.App = window.App || {};

App.Meta = (function () {
  'use strict';

  const JUNK_AUTHORS = /^(microsoft|adobe|word|writer|openoffice|libreoffice|acrobat|pdfcreator|calibre|unknown|scan|canon|hp |epson)/i;
  const THUMB_WIDTH = 300;
  const IMAGE_TYPES = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp'
  };

  /* Determine the format from extension plus magic bytes; null when unknown */
  async function detectFormat(file) {
    const name = file.name.toLowerCase();
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const isZip = head[0] === 0x50 && head[1] === 0x4b; // "PK"
    const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // "%PDF"
    if (name.endsWith('.epub') && isZip) return 'epub';
    if (name.endsWith('.cbz') && isZip) return 'cbz';
    if (name.endsWith('.pdf') && isPdf) return 'pdf';
    if (isPdf) return 'pdf';
    return null;
  }

  /* "Author - Title.epub" → { author, title } */
  function parseFilename(fileName) {
    const base = fileName.replace(/\.(epub|pdf|cbz)$/i, '');
    const m = base.match(/^(.+?)\s+-\s+(.+)$/);
    if (m) return { author: m[1].trim(), title: m[2].trim() };
    return { author: null, title: base.trim() };
  }

  function cleanAuthor(author) {
    if (!author) return null;
    const a = String(author).trim();
    if (!a || JUNK_AUTHORS.test(a)) return null;
    return a;
  }

  /* Shrink an image source (blob or canvas) to a 300px JPEG thumbnail */
  async function makeThumbFromBlob(blob) {
    try {
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, THUMB_WIDTH / bitmap.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return await canvasToJpeg(canvas);
    } catch (e) {
      console.warn('Cover thumbnail failed', e);
      return null;
    }
  }

  function canvasToJpeg(canvas) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8));
  }

  /* EPUB: metadata and cover via epub.js (temporary instance, destroyed afterwards) */
  async function readEpub(file) {
    const result = { title: null, author: null, language: null, cover: null, pageCount: null };
    let book = null;
    try {
      const buffer = await file.arrayBuffer();
      book = ePub(buffer);
      const md = await Promise.race([
        book.loaded.metadata,
        new Promise((_, rej) => setTimeout(() => rej(new Error('EPUB-Metadaten-Timeout')), 15000))
      ]);
      result.title = (md.title || '').trim() || null;
      result.author = cleanAuthor(md.creator);
      result.language = (md.language || '').slice(0, 2) || null;
      try {
        const coverUrl = await book.coverUrl();
        if (coverUrl) {
          const blob = await (await fetch(coverUrl)).blob();
          result.cover = await makeThumbFromBlob(blob);
        }
      } catch (e) { /* cover is optional */ }
    } catch (e) {
      console.warn('EPUB metadata failed', file.name, e);
    } finally {
      if (book) { try { book.destroy(); } catch (e) { /* ignore */ } }
    }
    return finalize(result, file);
  }

  /* PDF: metadata plus page 1 as the cover */
  async function readPdf(file) {
    const result = { title: null, author: null, language: null, cover: null, pageCount: null };
    let pdf = null;
    try {
      const buffer = await file.arrayBuffer();
      pdf = await pdfjsLib.getDocument({ data: buffer, isEvalSupported: false }).promise;
      result.pageCount = pdf.numPages || null;
      try {
        const meta = await pdf.getMetadata();
        const info = meta.info || {};
        let author = info.Author;
        if (!author && meta.metadata && typeof meta.metadata.get === 'function') {
          const dc = meta.metadata.get('dc:creator');
          author = Array.isArray(dc) ? dc.join(', ') : dc;
        }
        result.author = cleanAuthor(author);
        result.title = (info.Title || '').trim() || null;
      } catch (e) { /* metadata is optional */ }
      try {
        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        result.cover = await canvasToJpeg(canvas);
      } catch (e) { /* cover is optional */ }
    } catch (e) {
      console.warn('PDF metadata failed', file.name, e);
    } finally {
      if (pdf) { try { pdf.destroy(); } catch (e) { /* ignore */ } }
    }
    return finalize(result, file);
  }

  /* CBZ: a ZIP of images in natural filename order, optionally with a ComicInfo.xml */
  async function openCbz(file) {
    const zip = await JSZip.loadAsync(file);
    const pages = [];
    let comicInfo = null;
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      const parts = path.split('/');
      const name = parts[parts.length - 1];
      // macOS resource forks and hidden files are not pages
      if (parts.includes('__MACOSX') || name.startsWith('.')) return;
      if (name.toLowerCase() === 'comicinfo.xml') {
        comicInfo = comicInfo || entry;
        return;
      }
      const type = IMAGE_TYPES[name.slice(name.lastIndexOf('.') + 1).toLowerCase()];
      if (type) pages.push({ path, entry, type });
    });
    pages.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
    const info = comicInfo ? parseComicInfo(await comicInfo.async('string')) : {};
    return { pages, info };
  }

  /* ComicInfo.xml (the ComicRack schema) → title, author, language, cover page, chapter bookmarks */
  function parseComicInfo(xml) {
    const info = {};
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const text = (tag) => {
        const el = doc.getElementsByTagName(tag)[0];
        return (el && el.textContent.trim()) || null;
      };
      const series = text('Series');
      const number = text('Number');
      const title = text('Title');
      const issue = series ? (number ? `${series} #${number}` : series) : null;
      info.title = issue && title && title !== series ? `${issue} – ${title}` : (title || issue);
      info.author = text('Writer') || text('Penciller');
      info.language = (text('LanguageISO') || '').slice(0, 2) || null;
      const pageInfo = [...doc.getElementsByTagName('Page')]
        .map((p) => ({
          index: Number(p.getAttribute('Image')),
          type: p.getAttribute('Type') || '',
          label: (p.getAttribute('Bookmark') || '').trim()
        }))
        .filter((p) => Number.isInteger(p.index) && p.index >= 0);
      const cover = pageInfo.find((p) => p.type === 'FrontCover');
      info.coverIndex = cover ? cover.index : 0;
      info.bookmarks = pageInfo.filter((p) => p.label).map((p) => ({ index: p.index, label: p.label }));
    } catch (e) { /* metadata is optional */ }
    return info;
  }

  /* The image of a CBZ page as a typed Blob (JSZip leaves the type empty) */
  async function cbzPageBlob(page) {
    return new Blob([await page.entry.async('uint8array')], { type: page.type });
  }

  /* CBZ: ComicInfo.xml plus the front cover (or the first page) as the thumbnail */
  async function readCbz(file) {
    const result = { title: null, author: null, language: null, cover: null, pageCount: null };
    try {
      const { pages, info } = await openCbz(file);
      result.pageCount = pages.length || null;
      result.title = info.title || null;
      result.author = cleanAuthor(info.author);
      result.language = info.language || null;
      const cover = pages[info.coverIndex || 0] || pages[0];
      if (cover) result.cover = await makeThumbFromBlob(await cbzPageBlob(cover));
    } catch (e) {
      console.warn('CBZ metadata failed', file.name, e);
    }
    return finalize(result, file);
  }

  /* Fallback chain: metadata → "Author - Title" filename → plain filename */
  function finalize(result, file) {
    const fromName = parseFilename(file.name);
    if (!result.title) result.title = fromName.title || file.name;
    if (!result.author) result.author = cleanAuthor(fromName.author);
    return result;
  }

  async function read(file, format) {
    if (format === 'epub') return readEpub(file);
    if (format === 'pdf') return readPdf(file);
    if (format === 'cbz') return readCbz(file);
    return finalize({ title: null, author: null, language: null, cover: null, pageCount: null }, file);
  }

  return { detectFormat, parseFilename, read, readEpub, readPdf, readCbz, openCbz, cbzPageBlob };
})();
