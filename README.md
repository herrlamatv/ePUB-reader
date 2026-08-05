# Leselampe – EPUB- & PDF-Reader

Ein webbasierter E-Book-Reader aus reinen HTML/CSS/JS-Dateien – ohne Build-Tools, ohne Framework, ohne Backend. Deine Bibliothek ist ein ganz normaler Ordner auf deinem Computer: Importierte Bücher werden automatisch **nach Autor sortiert** abgelegt (`Bibliothek/Autor/Titel.epub`) und diese Ordnerstruktur siehst du sowohl im Datei-Explorer als auch in der App.

## Start

```bash
npm start
```

Dann `http://localhost:8420` in **Chrome oder Edge** öffnen. (Alternativ funktioniert jeder statische Webserver – oder das direkte Öffnen von `index.html`, dann mit kleinen Einschränkungen.)

Beim ersten Start wählst du einen Bibliotheksordner. Die App merkt sich den Ordner; nach einem Browser-Neustart genügt ein Klick auf „Zugriff erlauben".

## Features

- **EPUB & PDF lesen** – epub.js bzw. pdf.js, komplett lokal (kein CDN, keine Cloud)
- **Bibliothek nach Autor** – Import per Button oder Drag & Drop; Autor/Titel werden aus den Metadaten gelesen (Fallback: Dateiname `Autor - Titel.epub`), die Datei landet im passenden Autorenordner
- **Cover-Grid & Listenansicht**, Sortierung, Live-Suche in der Bibliothek, Autoren-Seitenleiste
- **Lesefortschritt** wird pro Buch gespeichert (EPUB: Position/CFI, PDF: Seite)
- **Lesezeichen, Highlights in 4 Farben & Notizen** – inklusive Markdown-Export
- **Volltextsuche im Buch** mit Trefferliste und Sprung zur Stelle
- **Vorlesen (Text-to-Speech)** über die Browser-Sprachausgabe, mit Stimmen-/Tempo-Wahl
- **Lesestatistik** – Lesezeit pro Tag/Buch, 30-Tage-Diagramm, Lese-Serie
- **3 Themes** (Hell/Sepia/Dunkel), Schriftgröße, Schriftart, Zeilenabstand, Seitenränder
- **Tastaturkürzel** (Übersicht mit `?`)
- **Zweisprachig** – Deutsch/Englisch umschaltbar
- Umbenennen/Verschieben erkennt die App per Datei-Fingerprint – Fortschritt und Notizen bleiben erhalten

## Wo liegen meine Daten?

Alles liegt in deinem Bibliotheksordner und ist damit portabel (z. B. per USB-Stick oder Sync-Dienst):

```
Bibliothek/
├── Thomas Mann/
│   └── Der Zauberberg.epub
├── Anna Autorin/
│   └── Beispielbuch.pdf
└── .leselampe/
    ├── data.json          ← Fortschritt, Lesezeichen, Highlights, Statistik, Einstellungen
    └── data.backup.json   ← tägliche Sicherung
```

Cover-Miniaturen werden nur im Browser zwischengespeichert (IndexedDB) und bei Bedarf neu erzeugt.

## Browser-Unterstützung

| Browser | Unterstützung |
|---|---|
| Chrome / Edge (Desktop) | ✅ Voll (File System Access API) |
| Firefox / Safari | ⚠️ Eingeschränkt: einzelne Dateien öffnen, Daten im Browser-Speicher |

Hinweis bei Öffnen per Doppelklick (`file://`): Der PDF-Worker läuft dann im Hauptthread (langsamer). Mit `npm start` läuft alles optimal.

## Technik

- Reine statische Dateien, klassische `<script>`-Tags, ein globaler `App`-Namespace (IIFE-Module)
- Vendor-Bibliotheken (lokal in `vendor/`, Versionen bewusst gepinnt):
  - epub.js **0.3.93** + jszip **3.10.1**
  - pdf.js **3.11.174** – letzte UMD-Version; neuere Versionen sind ESM-only und bräuchten einen Build-Schritt. Da ausschließlich lokale, selbst gewählte Dateien geöffnet werden, ist das Sicherheitsrisiko akzeptabel.
- `serve.js`: ~50-zeiliger statischer Server ohne Abhängigkeiten (`node:http`)

### Projektstruktur

```
index.html        Single Page (Bibliothek + Reader + Drawer/Dialoge)
serve.js          Mini-Webserver (npm start)
css/              main.css, themes.css, pdf_viewer.css (Text-Layer von pdf.js)
vendor/           jszip, epub.js, pdf.js (+ Worker)
js/
  utils.js        Helfer, Icons, Event-Bus, Toasts
  i18n.js         DE/EN-Wörterbücher
  db.js           IndexedDB-Cache (Ordner-Handle, Cover, Locations)
  fs.js           File System Access: Scan, Lesen/Schreiben, Verschieben
  store.js        data.json laden/speichern (atomar, debounced, Backup)
  metadata.js     Metadaten- & Cover-Extraktion (EPUB/PDF)
  library.js      Bibliothek: Import, Autoren-Sortierung, Ansichten
  reader-epub.js  epub.js-Reader (Themes, TOC, Locations)
  reader-pdf.js   pdf.js-Reader (virtualisierte Seiten, Text-Layer, Zoom)
  annotations.js  Lesezeichen, Highlights, Notizen, Export
  search.js       Volltextsuche im Buch
  tts.js          Vorlesen (Web Speech API)
  stats.js        Lesestatistik
  settings.js     Themes, Typografie, Sprache
  shortcuts.js    Tastaturkürzel
  app.js          Bootstrap, View-Wechsel, Drawer, Drag & Drop
```

## Tastaturkürzel

| Taste | Funktion |
|---|---|
| `←` `→` `Leertaste` | Blättern |
| `+` `−` `0` | Zoom (PDF) / Schriftgröße (EPUB) |
| `T` | Inhaltsverzeichnis |
| `B` | Lesezeichen setzen |
| `M` | Anmerkungen |
| `S` / `Strg+F` | Suche im Buch |
| `P` | Vorlesen starten/pausieren |
| `D` | Design wechseln |
| `Pos1` / `Ende` | Buchanfang / -ende |
| `Esc` | Schließen / zurück |
| `?` | Kürzel-Übersicht |
