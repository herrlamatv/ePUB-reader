/* App.Meta – Formaterkennung, Metadaten- und Cover-Extraktion für EPUB & PDF */
window.App = window.App || {};

App.Meta = (function () {
  'use strict';

  const JUNK_AUTHORS = /^(microsoft|adobe|word|writer|openoffice|libreoffice|acrobat|pdfcreator|calibre|unknown|scan|canon|hp |epson)/i;
  const THUMB_WIDTH = 300;

  /* Format anhand Endung + Magic Bytes bestimmen; null wenn unbekannt */
  async function detectFormat(file) {
    const name = file.name.toLowerCase();
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const isZip = head[0] === 0x50 && head[1] === 0x4b; // "PK"
    const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // "%PDF"
    if (name.endsWith('.epub') && isZip) return 'epub';
    if (name.endsWith('.pdf') && isPdf) return 'pdf';
    if (isPdf) return 'pdf';
    if (isZip && name.endsWith('.epub')) return 'epub';
    return null;
  }

  /* "Autor - Titel.epub" → { author, title } */
  function parseFilename(fileName) {
    const base = fileName.replace(/\.(epub|pdf)$/i, '');
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

  /* Bildquelle (Blob/Canvas) auf 300px-JPEG-Thumbnail verkleinern */
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
      console.warn('Cover-Thumbnail fehlgeschlagen', e);
      return null;
    }
  }

  function canvasToJpeg(canvas) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8));
  }

  /* EPUB: Metadaten + Cover über epub.js (temporäre Instanz, danach destroy) */
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
      } catch (e) { /* Cover ist optional */ }
    } catch (e) {
      console.warn('EPUB-Metadaten fehlgeschlagen', file.name, e);
    } finally {
      if (book) { try { book.destroy(); } catch (e) { /* egal */ } }
    }
    return finalize(result, file);
  }

  /* PDF: Metadaten + Seite 1 als Cover */
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
      } catch (e) { /* Metadaten optional */ }
      try {
        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        result.cover = await canvasToJpeg(canvas);
      } catch (e) { /* Cover optional */ }
    } catch (e) {
      console.warn('PDF-Metadaten fehlgeschlagen', file.name, e);
    } finally {
      if (pdf) { try { pdf.destroy(); } catch (e) { /* egal */ } }
    }
    return finalize(result, file);
  }

  /* Fallback-Kette: Metadaten → Dateiname "Autor - Titel" → Dateiname */
  function finalize(result, file) {
    const fromName = parseFilename(file.name);
    if (!result.title) result.title = fromName.title || file.name;
    if (!result.author) result.author = cleanAuthor(fromName.author);
    return result;
  }

  async function read(file, format) {
    if (format === 'epub') return readEpub(file);
    if (format === 'pdf') return readPdf(file);
    return finalize({ title: null, author: null, language: null, cover: null, pageCount: null }, file);
  }

  return { detectFormat, parseFilename, read, readEpub, readPdf };
})();
