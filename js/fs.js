/* App.FS – File-System-Access-Schicht: Bibliotheksordner, Scan, Lesen/Schreiben */
window.App = window.App || {};

App.FS = (function () {
  'use strict';

  const DATA_DIR = '.leselampe';
  let libraryHandle = null;

  function supported() {
    return 'showDirectoryPicker' in window;
  }

  function hasLibrary() {
    return !!libraryHandle;
  }

  /* Ordner-Auswahl (User-Gesture nötig) */
  async function pickLibrary() {
    libraryHandle = await window.showDirectoryPicker({ id: 'library', mode: 'readwrite' });
    await App.DB.set('handles', 'library', libraryHandle);
    return libraryHandle;
  }

  /* Gespeichertes Handle wiederherstellen; Rückgabe: 'granted' | 'prompt' | null */
  async function restore() {
    try {
      const handle = await App.DB.get('handles', 'library');
      if (!handle) return { handle: null, permission: null };
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission === 'denied') return { handle: null, permission: null };
      libraryHandle = handle;
      return { handle, permission };
    } catch (e) {
      console.warn('Handle-Wiederherstellung fehlgeschlagen', e);
      return { handle: null, permission: null };
    }
  }

  /* Erneute Freigabe anfordern (braucht User-Gesture) */
  async function requestPermission() {
    if (!libraryHandle) return false;
    try {
      const result = await libraryHandle.requestPermission({ mode: 'readwrite' });
      return result === 'granted';
    } catch (e) {
      console.warn('requestPermission fehlgeschlagen', e);
      return false;
    }
  }

  async function forgetLibrary() {
    libraryHandle = null;
    await App.DB.del('handles', 'library');
  }

  /* Pfad "Autor/Titel.epub" in Verzeichnis-Handle + Dateiname auflösen */
  async function resolveDir(relPath, create) {
    const parts = relPath.split('/').filter(Boolean);
    const fileName = parts.pop();
    let dir = libraryHandle;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: !!create });
    }
    return { dir, fileName };
  }

  async function getFile(relPath) {
    const { dir, fileName } = await resolveDir(relPath, false);
    const fh = await dir.getFileHandle(fileName);
    return fh.getFile();
  }

  /* Datei schreiben (atomar: Commit erst bei close()) */
  async function writeFile(relPath, data) {
    const { dir, fileName } = await resolveDir(relPath, true);
    const fh = await dir.getFileHandle(fileName, { create: true });
    const writable = await fh.createWritable();
    try {
      if (data && typeof data.stream === 'function' && data.size > 64 * 1024 * 1024) {
        await data.stream().pipeTo(writable);
        return;
      }
      await writable.write(data);
      await writable.close();
    } catch (e) {
      try { await writable.abort(); } catch (e2) { /* bereits geschlossen */ }
      throw e;
    }
  }

  /* Import: Datei in Autorenordner ablegen, Kollisionen mit " (2)" auflösen */
  async function writeBookFile(authorFolder, baseName, ext, file) {
    const dir = await libraryHandle.getDirectoryHandle(authorFolder, { create: true });
    let name = baseName + ext;
    let counter = 2;
    while (true) {
      try {
        await dir.getFileHandle(name);
        name = `${baseName} (${counter})${ext}`;
        counter += 1;
      } catch (e) {
        break; // Name ist frei
      }
    }
    const fh = await dir.getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    try {
      if (file.size > 64 * 1024 * 1024) {
        await file.stream().pipeTo(writable);
      } else {
        await writable.write(file);
        await writable.close();
      }
    } catch (e) {
      try { await writable.abort(); } catch (e2) { /* bereits geschlossen */ }
      throw e;
    }
    return `${authorFolder}/${name}`;
  }

  async function deleteFile(relPath) {
    const { dir, fileName } = await resolveDir(relPath, false);
    await dir.removeEntry(fileName);
    // Leeren Autorenordner aufräumen (nur oberste Ebene)
    const parts = relPath.split('/').filter(Boolean);
    if (parts.length === 2) {
      let empty = true;
      for await (const _ of dir.keys()) { empty = false; break; } // eslint-disable-line no-unused-vars
      if (empty) {
        try { await libraryHandle.removeEntry(parts[0]); } catch (e) { /* egal */ }
      }
    }
  }

  /* Datei in anderen Autorenordner verschieben (Kopie + Löschen) */
  async function moveFile(relPath, newAuthorFolder) {
    const file = await getFile(relPath);
    const parts = relPath.split('/').filter(Boolean);
    const fileName = parts[parts.length - 1];
    const dot = fileName.lastIndexOf('.');
    const newPath = await writeBookFile(newAuthorFolder, fileName.slice(0, dot), fileName.slice(dot), file);
    await deleteFile(relPath);
    return newPath;
  }

  /* Bibliothek rekursiv einlesen → [{ path, name, authorFolder, handle }] */
  async function scan() {
    const results = [];
    if (!libraryHandle) return results;

    async function walk(dirHandle, pathParts, topLevel) {
      for await (const [name, handle] of dirHandle.entries()) {
        if (name.startsWith('.')) continue;
        if (handle.kind === 'file') {
          const lower = name.toLowerCase();
          if (lower.endsWith('.epub') || lower.endsWith('.pdf')) {
            results.push({
              path: [...pathParts, name].join('/'),
              name,
              authorFolder: topLevel,
              handle
            });
          }
        } else if (handle.kind === 'directory') {
          await walk(handle, [...pathParts, name], topLevel === null ? name : topLevel);
        }
      }
    }

    await walk(libraryHandle, [], null);
    return results;
  }

  /* ── Datenverzeichnis (.leselampe/) ── */

  async function readDataFile(name) {
    try {
      const dir = await libraryHandle.getDirectoryHandle(DATA_DIR);
      const fh = await dir.getFileHandle(name);
      const file = await fh.getFile();
      return await file.text();
    } catch (e) {
      return null;
    }
  }

  async function writeDataFile(name, text) {
    const dir = await libraryHandle.getDirectoryHandle(DATA_DIR, { create: true });
    const fh = await dir.getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    await writable.write(text);
    await writable.close();
  }

  return {
    DATA_DIR, supported, hasLibrary, pickLibrary, restore, requestPermission, forgetLibrary,
    getFile, writeFile, writeBookFile, deleteFile, moveFile, scan,
    readDataFile, writeDataFile
  };
})();
