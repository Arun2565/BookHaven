# BookHaven

BookHaven is a lightweight, offline EPUB reader for Windows built with Tauri v2 and Vite. It runs completely locally with no backend server, telemetry, external CDN calls, or user accounts. All books, bookmarks, highlights, and notes are saved directly on your device.

## Features

- **Offline Library**: Import `.epub` files via drag-and-drop or file picker. Search and sort your library by title, author, or recent reads.
- **Reader & Typography**: Switch between Light, Dark, and Sepia themes. Customize font sizes, margins, line spacing, and choose between bundled offline fonts (Fraunces, Newsreader, EB Garamond).
- **Annotations & Bookmarks**: Save page bookmarks, highlight passages in multiple colors, add red underlines, add notes to selected text, and jump across sections via the Table of Contents.
- **In-Book Search**: Search text across EPUB chapters with snippet preview and instant navigation.
- **Tauri Native**: Extremely lightweight (~15MB installer size and ~30MB RAM usage).

## Automated GitHub Releases

This repository includes a GitHub Actions workflow (`.github/workflows/tauri-release.yml`). Whenever a release tag (e.g. `v1.0.0`) is published on GitHub, GitHub Cloud automatically compiles the **~15MB Windows Tauri installer** and attaches it directly to the release page.

## Quick Start (Development)

Prerequisites: [Node.js](https://nodejs.org/) (v20+) and Git.

```powershell
git clone https://github.com/Arun2565/BookHaven.git
cd BookHaven
npm install
npm run desktop
```

After `npm install`, the app runs completely offline.

## Scripts

- `npm run desktop` – Build frontend and launch the desktop window.
- `npm run tauri:dev` – Launch Tauri dev server.
- `npm run tauri:build` – Compile native Tauri binary locally (requires Rust).
- `npm run build` – Build static production assets to `dist/`.
- `npm test` – Run production build check.

## Project Structure

```
BookHaven/
├── src-tauri/       Tauri v2 Rust configuration & native manifest
├── desktop/         Electron compatibility layer
├── src/             Reader application logic and CSS
├── index.html       App entry shell
├── vite.config.js   Vite config (relative asset pathing for file://)
└── package.json     Dependencies and build scripts
```

## License

[MIT](LICENSE)
