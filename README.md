# BookHaven

BookHaven is a lightweight, offline EPUB reader for Windows. It runs completely locally with no backend server, telemetry, external CDN calls, or user accounts. All books, bookmarks, highlights, and notes are saved directly on your device.

## Features

- **Offline Library**: Import `.epub` files via drag-and-drop or file picker. Search and sort your library by title, author, or recent reads.
- **Reader & Typography**: Switch between Light, Dark, and Sepia themes. Customize font sizes, margins, line spacing, and choose from 9 bundled offline fonts (Newsreader, Fraunces, EB Garamond, Crimson Pro, Alegreya, Literata, Source Serif, Atkinson Hyperlegible, Lexend).
- **Annotations & Bookmarks**: Save page bookmarks, highlight passages in multiple colors, add notes to selected text, and jump across sections via the Table of Contents.
- **In-Book Search**: Search text across EPUB chapters with snippet preview and instant navigation.

## Quick Start

Prerequisites: [Node.js](https://nodejs.org/) (v20+) and Git.

```powershell
git clone https://github.com/Arun2565/BookHaven.git
cd BookHaven
npm install
npm run desktop
```

After `npm install`, the app runs completely offline.

## Build Installer (.exe)

To package a standalone Windows installer (`BookHaven Setup 1.0.0.exe`):

```powershell
npm run desktop:build
```

The installer will be generated in `dist/` and `release/`.

## Scripts

- `npm run desktop` – Build frontend and launch the Electron desktop window.
- `npm run desktop:dev` – Launch Electron against Vite dev server (`localhost:5173`).
- `npm run build` – Build static production assets to `dist/`.
- `npm test` – Run production build check.

## Project Structure

```
BookHaven/
├── desktop/         Electron main process
├── src/             Reader application logic and CSS
├── bin/             CLI launcher
├── index.html       App entry shell
├── vite.config.js   Vite config (relative asset pathing for file://)
└── package.json     Dependencies and build scripts
```

## License

[MIT](LICENSE)
