# ePUB-reader

A browser-based EPUB and PDF reader. Plain HTML, CSS and JS, no build step, no backend.
Your library is a normal folder on disk and imported books are filed under the author's name.

## Running it

```bash
npm start
```
## Easy install + start:
For easy installation, download the repo [here](https://github.com/herrlamatv/ePUB-reader/archive/refs/heads/master.zip).<br> After the download, you can extract the ZIP and start the<br>[**executables\install.bat**](https://github.com/herrlamatv/ePUB-reader/blob/master/.executables/install.bat). Then the [**start.bat**](https://github.com/herrlamatv/ePUB-reader/blob/master/.executables/start.bat)<br>Note: it will ask for admin perms to install **nodejs**

****
Open http://localhost:8420 in Chrome or Edge. On first run you pick a language and a library
folder. After a browser restart, click "Grant access" so the app can read the folder again.

Any static server works. Opening `index.html` directly works too, with the limits noted below.

## Files on disk

```
Library/
├── Thomas Mann/
│   └── Der Zauberberg.epub
├── Anna Autorin/
│   └── Example.pdf
└── .lamaepubreader/
    ├── data.json          progress, bookmarks, highlights, stats, settings
    └── data.backup.json   daily backup
```

Everything lives in that folder, so it travels with a USB stick or a sync service. Cover
thumbnails are cached in IndexedDB and regenerated when missing.

## Features

- EPUB and PDF, rendered locally by epub.js and pdf.js
- Import via button or drag and drop; author and title come from the metadata, falling back
  to an `Author - Title.epub` filename
- Grid and list view, sorting, search across the library
- Reading position per book, bookmarks, highlights in four colors, notes, Markdown export
- Full text search inside a book
- Read aloud through the Web Speech API
- Stats: time per day and per book, 30 day chart, streak
- Light, sepia and dark theme; font size, family, line height, margins
- English and German, switchable from the topbar or the settings, stored in the
  `leselampe_lang` cookie. In German the app is called Leselampe
- Renamed or moved files are matched by fingerprint, so progress and notes survive

## Browsers

Chrome and Edge on the desktop have full support through the File System Access API.
Firefox and Safari can only open single files and keep their data in browser storage.

Opened as `file://`, the PDF worker runs on the main thread, which is slower.

## Shortcuts

| Key | Action |
|---|---|
| `←` `→` `Space` | Turn page |
| `+` `−` `0` | Zoom (PDF) / font size (EPUB) |
| `T` | Table of contents |
| `B` | Toggle bookmark |
| `M` | Annotations |
| `S` / `Ctrl+F` | Search in book |
| `P` | Read aloud |
| `D` | Cycle theme |
| `Home` / `End` | Start / end of book |
| `Esc` | Close / back |
| `?` | This list |

## Code

Static files, `<script>` tags, one global `App` namespace. Vendored libraries are pinned:
epub.js 0.3.93, jszip 3.10.1 and pdf.js 3.11.174, the last UMD build (newer ones are ESM
only and would need a bundler). `serve.js` is a small static server on `node:http`.

```
index.html   library, reader, drawers, dialogs
css/         main, themes, pdf_viewer
vendor/      jszip, epub.js, pdf.js
js/          utils, i18n, db, fs, store, metadata, library, reader-epub,
             reader-pdf, annotations, search, tts, stats, settings,
             shortcuts, app
```
