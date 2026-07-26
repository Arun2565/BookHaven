# BookHaven 📖

**BookHaven** is a private, offline EPUB reader for Windows inspired by Apple Books and Kindle. Your books, highlights, notes, bookmarks, and reading progress remain strictly on your local device — no external servers, user accounts, or tracking required.

---

## ✨ Key Features

- 🔌 **100% Offline & Private** — All assets, fonts, and dependencies run locally. No data is sent to external servers or hosted websites.
- 📚 **Personal Library Manager** — Drag-and-drop or select `.epub` files. View library in custom Grid or List layout, search by title/author, and sort by recent, title, or author.
- 🎨 **Reading Customization**
  - **Themes**: Light, Dark, and Sepia modes tailored for any environment.
  - **Typography**: Bundled with 9 high-quality offline font choices (*Newsreader, Fraunces, EB Garamond, Crimson Pro, Alegreya, Literata, Source Serif, Atkinson Hyperlegible, Lexend*).
  - **Layout Controls**: Adjustable font sizes, line spacing (tight, normal, wide), and custom margins (narrow, normal, wide).
- ✍️ **Annotations & Bookmarks**
  - Highlight text in multiple colors (yellow, green, blue, pink) or add underlines.
  - Attach personal notes to selected excerpts.
  - Save page bookmarks and view/manage them from the sidebar.
  - Quick sidebar access to Table of Contents, Bookmarks, Annotations, and In-Book Search.
- 💻 **Desktop Native** — Packaged via Electron for a seamless Windows application window.

---

## 🚀 Quick Start (Running Offline from Repo)

### Prerequisites
- [Node.js](https://nodejs.org/) v20.19.0 or later installed on Windows.
- [Git](https://git-scm.com/) installed.

### Installation & Launch

1. **Clone the Repository:**
   ```powershell
   git clone https://github.com/YOUR-USERNAME/BookHaven.git
   cd BookHaven
   ```

2. **Install Dependencies (One-time step):**
   ```powershell
   npm install
   ```

3. **Run Desktop App:**
   ```powershell
   npm run desktop
   ```

> **Note:** After `npm install` completes, BookHaven operates **100% offline** without needing an active internet connection.

---

## 📦 Packaging & Building a Standalone Windows App

To build a standalone Windows executable (`BookHaven.exe`) or installer that users can launch without Node.js or Git:

```powershell
npm run desktop:build
```

The output build files will be generated inside the `dist/win-unpacked/` and `release/` folders. You can compress or upload the generated installer to **GitHub Releases** for direct downloading.

---

## 🛠️ Development Commands

- `npm run dev` — Start Vite dev server for browser-based development (`http://localhost:5173`).
- `npm run desktop:dev` — Open the Electron wrapper pointing to the Vite dev server.
- `npm run build` — Bundle static web assets into `dist/` with relative asset paths.
- `npm test` — Run the build check to verify project integrity.

---

## 📁 Project Architecture

```
BookHaven/
├── bin/              # CLI runner script (npm global / npx support)
├── desktop/          # Electron main process (main.cjs)
├── public/           # Static assets (favicons, icons)
├── src/
│   ├── main.js       # Core reader engine, state, annotations & IndexedDB logic
│   └── style.css     # Design system, themes & UI styling
├── index.html        # HTML shell
├── vite.config.js    # Vite configuration (relative path bundling for desktop file://)
└── package.json      # Dependencies & scripts
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
