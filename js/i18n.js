/* App.I18n – Übersetzungen als reine JS-Objekte (funktioniert auch ohne fetch/Server) */
window.App = window.App || {};

App.I18N = {
  de: {
    'common.cancel': 'Abbrechen',
    'common.ok': 'OK',
    'common.save': 'Speichern',
    'common.close': 'Schließen',
    'common.delete': 'Löschen',
    'common.open': 'Öffnen',
    'common.loading': 'Wird geladen …',

    'library.allBooks': 'Alle Bücher',
    'library.authors': 'Autoren',
    'library.searchPlaceholder': 'Titel oder Autor suchen …',
    'library.sortRecent': 'Zuletzt gelesen',
    'library.sortTitle': 'Titel',
    'library.sortAuthor': 'Autor',
    'library.sortProgress': 'Fortschritt',
    'library.sortAdded': 'Hinzugefügt',
    'library.import': 'Importieren',
    'library.importing': 'Importiere {current}/{total} …',
    'library.imported': '{n} Buch/Bücher importiert',
    'library.importFailed': 'Import fehlgeschlagen: {name}',
    'library.duplicate': '„{title}" ist bereits in der Bibliothek',
    'library.toggleView': 'Ansicht wechseln',
    'library.toggleSidebar': 'Seitenleiste ein-/ausblenden',
    'library.rescan': 'Bibliothek neu einlesen',
    'library.scanning': 'Lese Bibliothek ein …',
    'library.newBooksFound': '{n} neue(s) Buch/Bücher gefunden',
    'library.permissionNeeded': 'Der Zugriff auf deinen Bibliotheksordner muss erneut erlaubt werden.',
    'library.permissionGrant': 'Zugriff erlauben',
    'library.permissionDenied': 'Zugriff wurde verweigert – Bibliothek ist schreibgeschützt.',
    'library.emptyTitle': 'Willkommen bei Leselampe',
    'library.emptyText': 'Wähle einen Ordner auf deinem Computer als Bibliothek. Importierte Bücher werden dort automatisch nach Autor sortiert abgelegt.',
    'library.pickFolder': 'Bibliotheksordner wählen',
    'library.fallbackNote': 'Dein Browser unterstützt keinen Ordnerzugriff (File System Access API). Mit Chrome oder Edge erhältst du die volle Bibliotheksfunktion – alternativ kannst du einzelne Dateien öffnen:',
    'library.openSingle': 'Einzelne Datei öffnen',
    'library.noResults': 'Keine Bücher gefunden.',
    'library.dropHere': 'Zum Importieren hier ablegen',
    'library.unsorted': 'Unsortiert',
    'library.unknownAuthor': 'Unbekannter Autor',
    'library.deleteConfirm': '„{title}" wirklich löschen? Die Datei wird aus dem Bibliotheksordner entfernt.',
    'library.deleted': '„{title}" gelöscht',
    'library.missing': 'Datei nicht gefunden',
    'library.missingHint': 'Die Datei wurde verschoben oder gelöscht. Erneut einlesen oder Eintrag entfernen?',
    'library.removeEntry': 'Eintrag entfernen',
    'library.sortIn': 'Einsortieren',
    'library.sortedIn': '„{title}" nach {author} einsortiert',
    'library.folderError': 'Ordner konnte nicht geöffnet werden.',
    'library.bookCount': '{n} Bücher',

    'reader.back': 'Zur Bibliothek',
    'reader.bookmark': 'Lesezeichen setzen/entfernen',
    'reader.toc': 'Inhaltsverzeichnis',
    'reader.annotations': 'Anmerkungen',
    'reader.search': 'Suche im Buch',
    'reader.zoomMode': 'Zoom-Modus wechseln',
    'reader.page': 'Seite',
    'reader.openError': 'Buch konnte nicht geöffnet werden: {error}',
    'reader.fitWidth': 'Breite',
    'reader.fitPage': 'Seite',
    'reader.noToc': 'Kein Inhaltsverzeichnis vorhanden.',

    'annotations.bookmarks': 'Lesezeichen',
    'annotations.highlights': 'Markierungen',
    'annotations.export': 'Als Markdown exportieren',
    'annotations.addNote': 'Notiz hinzufügen',
    'annotations.copy': 'Kopieren',
    'annotations.copied': 'In die Zwischenablage kopiert',
    'annotations.delete': 'Löschen',
    'annotations.notePlaceholder': 'Notiz hinzufügen …',
    'annotations.noneBookmarks': 'Noch keine Lesezeichen.',
    'annotations.noneHighlights': 'Noch keine Markierungen.',
    'annotations.bookmarkAdded': 'Lesezeichen gesetzt',
    'annotations.bookmarkRemoved': 'Lesezeichen entfernt',
    'annotations.exported': 'Anmerkungen exportiert',
    'annotations.position': 'Position {p} %',
    'annotations.pageN': 'Seite {n}',

    'search.placeholder': 'Suchbegriff …',
    'search.searching': 'Suche … ({current}/{total})',
    'search.results': '{n} Treffer',
    'search.noResults': 'Keine Treffer.',
    'search.tooShort': 'Mindestens 2 Zeichen eingeben.',

    'tts.title': 'Vorlesen',
    'tts.play': 'Vorlesen starten',
    'tts.pause': 'Pause',
    'tts.stop': 'Stopp',
    'tts.prev': 'Vorheriger Absatz',
    'tts.next': 'Nächster Absatz',
    'tts.voice': 'Stimme',
    'tts.rate': 'Geschwindigkeit',
    'tts.fromHere': 'Ab hier vorlesen',
    'tts.unsupported': 'Dein Browser unterstützt keine Sprachausgabe.',
    'tts.reading': 'Liest vor …',
    'tts.paused': 'Pausiert',
    'tts.noText': 'Kein vorlesbarer Text gefunden.',

    'settings.title': 'Einstellungen',
    'settings.appearance': 'Darstellung',
    'settings.theme': 'Design',
    'settings.themeLight': 'Hell',
    'settings.themeSepia': 'Sepia',
    'settings.themeDark': 'Dunkel',
    'settings.typography': 'Schrift (EPUB)',
    'settings.fontSize': 'Schriftgröße',
    'settings.fontFamily': 'Schriftart',
    'settings.fontOriginal': 'Original',
    'settings.lineHeight': 'Zeilenabstand',
    'settings.margins': 'Seitenränder',
    'settings.flow': 'Anzeige',
    'settings.flowPaginated': 'Seiten',
    'settings.flowScrolled': 'Fortlaufend',
    'settings.general': 'Allgemein',
    'settings.language': 'Sprache',
    'settings.pdfInvert': 'Im Dunkelmodus invertieren',

    'stats.title': 'Lesestatistik',
    'stats.today': 'Heute',
    'stats.week': 'Diese Woche',
    'stats.total': 'Gesamt',
    'stats.streak': 'Serie',
    'stats.days': '{n} Tage',
    'stats.perBook': 'Zeit pro Buch',
    'stats.noData': 'Noch keine Lesezeit erfasst.',

    'shortcuts.title': 'Tastaturkürzel',
    'shortcuts.turnPage': 'Blättern',
    'shortcuts.zoomFont': 'Zoom (PDF) / Schriftgröße (EPUB)',
    'shortcuts.toc': 'Inhaltsverzeichnis',
    'shortcuts.bookmark': 'Lesezeichen setzen',
    'shortcuts.annotations': 'Anmerkungen öffnen',
    'shortcuts.search': 'Suche im Buch',
    'shortcuts.tts': 'Vorlesen starten/pausieren',
    'shortcuts.theme': 'Design wechseln',
    'shortcuts.help': 'Diese Übersicht',
    'shortcuts.close': 'Schließen / Zurück',
    'shortcuts.startEnd': 'Anfang / Ende des Buchs',

    'details.title': 'Buchdetails',
    'details.bookTitle': 'Titel',
    'details.author': 'Autor',
    'details.delete': 'Löschen',
    'details.format': 'Format',
    'details.pages': 'Seiten',
    'details.pagesEstimate': 'ca. {n}',
    'details.path': 'Pfad',
    'details.size': 'Größe',
    'details.added': 'Hinzugefügt',
    'details.lastOpened': 'Zuletzt gelesen',
    'details.readingTime': 'Lesezeit',
    'details.moved': 'Datei nach „{author}" verschoben',
    'details.saved': 'Änderungen gespeichert',

    'app.fileUrlHint': 'Tipp: Starte die App mit „npm start" für die beste Erfahrung.',
    'app.dataSaveError': 'Speichern der Bibliotheksdaten fehlgeschlagen.',
    'app.dataRestored': 'Daten aus Sicherung wiederhergestellt.',
    'app.dataCorrupt': 'Die Bibliotheksdaten sind beschädigt. Aus Sicherung wiederherstellen?',
    'app.title': 'Leselampe – EPUB- & PDF-Reader',

    'welcome.title': 'Sprache wählen',
    'welcome.subtitle': 'In welcher Sprache möchtest du Leselampe nutzen? Du kannst die Sprache später jederzeit in den Einstellungen ändern.',
    'welcome.continue': 'Weiter'
  },

  en: {
    'common.cancel': 'Cancel',
    'common.ok': 'OK',
    'common.save': 'Save',
    'common.close': 'Close',
    'common.delete': 'Delete',
    'common.open': 'Open',
    'common.loading': 'Loading …',

    'library.allBooks': 'All books',
    'library.authors': 'Authors',
    'library.searchPlaceholder': 'Search title or author …',
    'library.sortRecent': 'Recently read',
    'library.sortTitle': 'Title',
    'library.sortAuthor': 'Author',
    'library.sortProgress': 'Progress',
    'library.sortAdded': 'Date added',
    'library.import': 'Import',
    'library.importing': 'Importing {current}/{total} …',
    'library.imported': 'Imported {n} book(s)',
    'library.importFailed': 'Import failed: {name}',
    'library.duplicate': '"{title}" is already in your library',
    'library.toggleView': 'Toggle view',
    'library.toggleSidebar': 'Toggle sidebar',
    'library.rescan': 'Rescan library',
    'library.scanning': 'Scanning library …',
    'library.newBooksFound': 'Found {n} new book(s)',
    'library.permissionNeeded': 'Access to your library folder needs to be granted again.',
    'library.permissionGrant': 'Grant access',
    'library.permissionDenied': 'Access denied – library is read-only.',
    'library.emptyTitle': 'Welcome to Leselampe',
    'library.emptyText': 'Choose a folder on your computer as your library. Imported books are automatically organized into author folders there.',
    'library.pickFolder': 'Choose library folder',
    'library.fallbackNote': 'Your browser does not support folder access (File System Access API). Use Chrome or Edge for the full library experience – alternatively you can open single files:',
    'library.openSingle': 'Open a single file',
    'library.noResults': 'No books found.',
    'library.dropHere': 'Drop here to import',
    'library.unsorted': 'Unsorted',
    'library.unknownAuthor': 'Unknown author',
    'library.deleteConfirm': 'Really delete "{title}"? The file will be removed from your library folder.',
    'library.deleted': 'Deleted "{title}"',
    'library.missing': 'File not found',
    'library.missingHint': 'The file was moved or deleted. Rescan or remove the entry?',
    'library.removeEntry': 'Remove entry',
    'library.sortIn': 'File into folder',
    'library.sortedIn': 'Filed "{title}" under {author}',
    'library.folderError': 'Could not open folder.',
    'library.bookCount': '{n} books',

    'reader.back': 'Back to library',
    'reader.bookmark': 'Toggle bookmark',
    'reader.toc': 'Table of contents',
    'reader.annotations': 'Annotations',
    'reader.search': 'Search in book',
    'reader.zoomMode': 'Switch zoom mode',
    'reader.page': 'Page',
    'reader.openError': 'Could not open book: {error}',
    'reader.fitWidth': 'Width',
    'reader.fitPage': 'Page',
    'reader.noToc': 'No table of contents available.',

    'annotations.bookmarks': 'Bookmarks',
    'annotations.highlights': 'Highlights',
    'annotations.export': 'Export as Markdown',
    'annotations.addNote': 'Add note',
    'annotations.copy': 'Copy',
    'annotations.copied': 'Copied to clipboard',
    'annotations.delete': 'Delete',
    'annotations.notePlaceholder': 'Add a note …',
    'annotations.noneBookmarks': 'No bookmarks yet.',
    'annotations.noneHighlights': 'No highlights yet.',
    'annotations.bookmarkAdded': 'Bookmark added',
    'annotations.bookmarkRemoved': 'Bookmark removed',
    'annotations.exported': 'Annotations exported',
    'annotations.position': 'Position {p} %',
    'annotations.pageN': 'Page {n}',

    'search.placeholder': 'Search term …',
    'search.searching': 'Searching … ({current}/{total})',
    'search.results': '{n} results',
    'search.noResults': 'No results.',
    'search.tooShort': 'Enter at least 2 characters.',

    'tts.title': 'Read aloud',
    'tts.play': 'Start reading aloud',
    'tts.pause': 'Pause',
    'tts.stop': 'Stop',
    'tts.prev': 'Previous paragraph',
    'tts.next': 'Next paragraph',
    'tts.voice': 'Voice',
    'tts.rate': 'Speed',
    'tts.fromHere': 'Read from here',
    'tts.unsupported': 'Your browser does not support speech synthesis.',
    'tts.reading': 'Reading …',
    'tts.paused': 'Paused',
    'tts.noText': 'No readable text found.',

    'settings.title': 'Settings',
    'settings.appearance': 'Appearance',
    'settings.theme': 'Theme',
    'settings.themeLight': 'Light',
    'settings.themeSepia': 'Sepia',
    'settings.themeDark': 'Dark',
    'settings.typography': 'Typography (EPUB)',
    'settings.fontSize': 'Font size',
    'settings.fontFamily': 'Font family',
    'settings.fontOriginal': 'Original',
    'settings.lineHeight': 'Line height',
    'settings.margins': 'Margins',
    'settings.flow': 'Layout',
    'settings.flowPaginated': 'Pages',
    'settings.flowScrolled': 'Scrolled',
    'settings.general': 'General',
    'settings.language': 'Language',
    'settings.pdfInvert': 'Invert in dark mode',

    'stats.title': 'Reading statistics',
    'stats.today': 'Today',
    'stats.week': 'This week',
    'stats.total': 'Total',
    'stats.streak': 'Streak',
    'stats.days': '{n} days',
    'stats.perBook': 'Time per book',
    'stats.noData': 'No reading time recorded yet.',

    'shortcuts.title': 'Keyboard shortcuts',
    'shortcuts.turnPage': 'Turn page',
    'shortcuts.zoomFont': 'Zoom (PDF) / font size (EPUB)',
    'shortcuts.toc': 'Table of contents',
    'shortcuts.bookmark': 'Toggle bookmark',
    'shortcuts.annotations': 'Open annotations',
    'shortcuts.search': 'Search in book',
    'shortcuts.tts': 'Start/pause read aloud',
    'shortcuts.theme': 'Cycle theme',
    'shortcuts.help': 'This overview',
    'shortcuts.close': 'Close / back',
    'shortcuts.startEnd': 'Start / end of book',

    'details.title': 'Book details',
    'details.bookTitle': 'Title',
    'details.author': 'Author',
    'details.delete': 'Delete',
    'details.format': 'Format',
    'details.pages': 'Pages',
    'details.pagesEstimate': 'approx. {n}',
    'details.path': 'Path',
    'details.size': 'Size',
    'details.added': 'Added',
    'details.lastOpened': 'Last read',
    'details.readingTime': 'Reading time',
    'details.moved': 'File moved to "{author}"',
    'details.saved': 'Changes saved',

    'app.fileUrlHint': 'Tip: start the app with "npm start" for the best experience.',
    'app.dataSaveError': 'Failed to save library data.',
    'app.dataRestored': 'Data restored from backup.',
    'app.dataCorrupt': 'Library data is corrupted. Restore from backup?',
    'app.title': 'Leselampe – EPUB & PDF reader',

    'welcome.title': 'Choose your language',
    'welcome.subtitle': 'Which language would you like to use Leselampe in? You can change the language at any time in the settings.',
    'welcome.continue': 'Continue'
  }
};

App.I18n = (function () {
  'use strict';

  const SUPPORTED = ['de', 'en'];
  const FALLBACK = 'de';
  const COOKIE_KEY = 'leselampe_lang';
  const COOKIE_DAYS = 365;
  const STORAGE_KEY = 'leselampe-lang'; // Notnagel, wenn Cookies blockiert sind (z. B. file://)

  let lang = FALLBACK;
  let chosen = false; // true, sobald eine Sprache bewusst gewählt und gespeichert wurde

  /* ══════════ Persistenz: Cookie (führend) + localStorage ══════════ */

  function readCookie(name) {
    const parts = (document.cookie || '').split(';');
    for (let i = 0; i < parts.length; i += 1) {
      const eq = parts[i].indexOf('=');
      if (eq < 0) continue;
      if (parts[i].slice(0, eq).trim() === name) {
        return decodeURIComponent(parts[i].slice(eq + 1).trim());
      }
    }
    return null;
  }

  function writeCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value)
      + '; expires=' + expires + '; path=/; SameSite=Lax';
  }

  function persist(l) {
    try { writeCookie(COOKIE_KEY, l, COOKIE_DAYS); } catch (e) { /* egal */ }
    try { localStorage.setItem(STORAGE_KEY, l); } catch (e) { /* egal */ }
  }

  function readPersisted() {
    let v = null;
    try { v = readCookie(COOKIE_KEY); } catch (e) { v = null; }
    if (SUPPORTED.indexOf(v) >= 0) return v;
    try { v = localStorage.getItem(STORAGE_KEY); } catch (e) { v = null; }
    return SUPPORTED.indexOf(v) >= 0 ? v : null;
  }

  /* Browsersprache als Vorauswahl für den Startdialog */
  function detect() {
    const cands = (navigator.languages && navigator.languages.length)
      ? navigator.languages
      : [navigator.language || ''];
    for (let i = 0; i < cands.length; i += 1) {
      const base = String(cands[i]).toLowerCase().split('-')[0];
      if (SUPPORTED.indexOf(base) >= 0) return base;
    }
    return FALLBACK;
  }

  /* ══════════ Übersetzen ══════════ */

  function t(key, params) {
    const dict = App.I18N[lang] || App.I18N[FALLBACK];
    let s = dict[key] || App.I18N[FALLBACK][key] || key;
    if (params) {
      Object.keys(params).forEach((k) => {
        s = s.replace(new RegExp('\{' + k + '\}', 'g'), params[k]);
      });
    }
    return s;
  }

  function locale() { return lang === 'de' ? 'de-DE' : 'en-US'; }

  function language() { return lang; }

  function supported() { return SUPPORTED.slice(); }

  /* Wurde schon einmal bewusst eine Sprache gewählt? Steuert die Abfrage beim ersten Start. */
  function hasStoredPreference() { return chosen; }

  /* Aktuell angezeigte Sprache festschreiben (Bestätigung im Startdialog) */
  function confirmChoice() {
    persist(lang);
    chosen = true;
  }

  /* Alle data-i18n / data-i18n-title / data-i18n-placeholder im DOM aktualisieren */
  function applyToDom(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    if (!root) document.title = t('app.title');
  }

  /* Alle Sprachschalter der Oberfläche auf den aktuellen Stand bringen */
  function syncControls() {
    document.querySelectorAll('.lang-btn').forEach((el) => {
      el.textContent = lang.toUpperCase();
    });
    const langSelect = document.getElementById('setting-language');
    if (langSelect) langSelect.value = lang;
    document.querySelectorAll('.lang-choice').forEach((el) => {
      const on = el.dataset.lang === lang;
      el.classList.toggle('active', on);
      el.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  /**
   * Sprache umschalten.
   * opts.silent  – kein 'lang:changed'-Event (beim Init)
   * opts.persist – false: nur anzeigen, noch nicht im Cookie speichern (Vorschau im Startdialog)
   */
  function setLanguage(newLang, opts) {
    if (SUPPORTED.indexOf(newLang) < 0) return;
    const o = opts || {};
    lang = newLang;
    document.documentElement.lang = newLang;
    if (o.persist !== false) {
      persist(newLang);
      chosen = true;
    }
    applyToDom();
    syncControls();
    if (!o.silent) App.Utils.emit('lang:changed', newLang);
  }

  /**
   * Start: gespeicherte Sprache anwenden (Cookie → localStorage).
   * Ohne gespeicherte Sprache wird die Browsersprache nur vorgeblendet –
   * geschrieben wird erst, wenn der Nutzer im Startdialog bestätigt.
   */
  function init(preferred) {
    const stored = SUPPORTED.indexOf(preferred) >= 0 ? preferred : readPersisted();
    if (stored) {
      setLanguage(stored, { silent: true });
    } else {
      setLanguage(detect(), { silent: true, persist: false });
    }
  }

  return {
    t, locale, language, supported, setLanguage, applyToDom, syncControls,
    init, hasStoredPreference, confirmChoice
  };
})();
