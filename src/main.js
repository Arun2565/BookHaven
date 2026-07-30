import ePub from 'epubjs';
import localforage from 'localforage';
import JSZip from 'jszip';
import ebGaramondFont from '@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff2?url';
import frauncesFont from '@fontsource/fraunces/files/fraunces-latin-400-normal.woff2?url';
import newsreaderFont from '@fontsource/newsreader/files/newsreader-latin-400-normal.woff2?url';
import instrumentSerifFont from '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url';

const READER_FONT_CSS = [
  ['EB Garamond', ebGaramondFont],
  ['Fraunces', frauncesFont],
  ['Newsreader', newsreaderFont],
  ['Instrument Serif', instrumentSerifFont]
].map(([family, url]) => `@font-face { font-family: "${family}"; src: url("${url}") format("woff2"); font-style: normal; font-weight: 400; font-display: swap; }`).join('\n') + `
::selection { background: rgba(99, 102, 241, 0.3) !important; color: inherit !important; }
::-moz-selection { background: rgba(99, 102, 241, 0.3) !important; color: inherit !important; }

/* Custom styles for annotations inside the EPUB iframe */
.bookhaven-underline {
  transform: translateY(4px) !important;
}

.bookhaven-highlight {
  mix-blend-mode: multiply;
}
.theme-dark .bookhaven-highlight {
  mix-blend-mode: screen;
}
.bookhaven-highlight rect {
  rx: 4px !important;
  ry: 4px !important;
}`;

// App State
const state = {
  books: [],
  currentBook: null,
  currentBookId: null,
  rendition: null,
  theme: localStorage.getItem('bookhaven-theme') || 'light',
  fontSize: parseInt(localStorage.getItem('bookhaven-fontsize')) || 100,
  fontFamily: localStorage.getItem('bookhaven-fontfamily') || 'default',
  bold: localStorage.getItem('bookhaven-bold') === 'true',
  italic: localStorage.getItem('bookhaven-italic') === 'true',
  lineSpacing: localStorage.getItem('bookhaven-linespacing') || '1.8',
  margin: localStorage.getItem('bookhaven-margin') || 'normal',
  viewMode: 'grid',
  sortMode: 'recent',
  searchQuery: '',
  annotations: [],
  bookmarks: [],
  currentSelection: null,
  isLayoutRefreshing: false,
  pendingNavigation: null,
  layoutRefreshId: 0,
  sessionStart: null,
  readingStats: null,
  selectedHighlightColor: localStorage.getItem('bookhaven-hl-color') || '#FBF719'
};

let justSelected = false;

// DOM Elements
const els = {
  views: {
    library: document.getElementById('library-view'),
    reader: document.getElementById('reader-view')
  },
  library: {
    searchInput: document.getElementById('library-search'),
    viewToggleBtn: document.getElementById('view-toggle-btn'),
    sortBtn: document.getElementById('sort-btn'),
    sortDropdown: document.getElementById('sort-dropdown'),
    fileInput: document.getElementById('file-input'),
    grid: document.getElementById('book-grid'),
    emptyState: document.getElementById('empty-state'),
    dropOverlay: document.getElementById('drop-overlay'),
    bookCount: document.getElementById('library-book-count'),
    status: document.getElementById('library-status')
  },
  reader: {
    header: document.getElementById('reader-header'),
    backBtn: document.getElementById('reader-back-btn'),
    title: document.getElementById('reader-book-title'),
    area: document.getElementById('reader-area'),
    tocBtn: document.getElementById('reader-toc-btn'),
    bookmarkBtn: document.getElementById('reader-bookmark-btn'),
    searchBtn: document.getElementById('reader-search-btn'),
    annotationsBtn: document.getElementById('reader-annotations-btn'),
    settingsBtn: document.getElementById('reader-settings-btn')
  },
  sidebars: {
    overlay: document.getElementById('sidebar-overlay'),
    toc: document.getElementById('toc-sidebar'),
    bookmarks: document.getElementById('bookmarks-sidebar'),
    search: document.getElementById('search-sidebar'),
    annotations: document.getElementById('annotations-sidebar'),
    tocList: document.getElementById('toc-list'),
    bookmarksList: document.getElementById('bookmarks-list'),
    searchResults: document.getElementById('search-results'),
    searchInput: document.getElementById('book-search-input'),
    searchGo: document.getElementById('book-search-go'),
    annotationsList: document.getElementById('annotations-list')
  },
  settings: {
    panel: document.getElementById('settings-panel'),
    closeBtn: document.getElementById('settings-panel-close'),
    fontDec: document.getElementById('font-decrease'),
    fontInc: document.getElementById('font-increase'),
    fontVal: document.getElementById('font-size-value'),
    fontOpts: document.querySelectorAll('.font-option'),
    themeOpts: document.querySelectorAll('.theme-btn'),
    spacingOpts: document.querySelectorAll('.spacing-btn'),
    marginOpts: document.querySelectorAll('.margin-btn'),
    boldBtn: document.getElementById('btn-bold'),
    italicBtn: document.getElementById('btn-italic')
  },
  modals: {
    loading: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    bookInfo: document.getElementById('book-info-modal'),
    bookInfoContent: document.getElementById('book-info-content'),
    bookInfoClose: document.getElementById('book-info-close')
  },
  toastContainer: document.getElementById('toast-container'),
  annotations: {
    toolbar: document.getElementById('highlight-toolbar'),
    btns: document.querySelectorAll('.hl-btn'),
    noteModal: document.getElementById('note-modal'),
    noteExcerpt: document.getElementById('note-excerpt'),
    noteText: document.getElementById('note-text'),
    noteCancel: document.getElementById('note-cancel'),
    noteSave: document.getElementById('note-save'),
    noteClose: document.getElementById('note-modal-close'),
    exportBtn: document.getElementById('export-annotations-btn'),
    exportModal: document.getElementById('export-modal'),
    exportClose: document.getElementById('export-modal-close'),
    exportCancel: document.getElementById('export-modal-cancel'),
    exportConfirm: document.getElementById('export-modal-confirm'),
    exportHighlights: document.getElementById('export-include-highlights'),
    exportUnderlines: document.getElementById('export-include-underlines'),
    exportNotes: document.getElementById('export-include-notes'),
    exportChapters: document.getElementById('export-include-chapters'),
    exportPreview: document.getElementById('export-preview-content')
  }
};

// Initialize DB
localforage.config({
  name: 'BookHaven',
  storeName: 'books'
});

// App Initialization
async function init() {
  applyTheme(state.theme);
  setupEventListeners();
  syncStyleButtons();
  await loadBooks();
  loadReadingStats();
  // Restore selected highlight color indicator
  document.querySelectorAll('.hl-btn[data-color]').forEach(b => {
    if (b.dataset.color === state.selectedHighlightColor) b.classList.add('active');
  });
}

// -----------------------------------------------------------------------------
// EVENT LISTENERS
// -----------------------------------------------------------------------------
function setupEventListeners() {
  // Library Events
  els.library.fileInput.addEventListener('change', handleFileUpload);
  els.library.searchInput.addEventListener('input', debounce(handleSearch, 300));
  els.library.viewToggleBtn.addEventListener('click', toggleViewMode);
  els.library.sortBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    els.library.sortDropdown.classList.toggle('show');
  });
  
  document.querySelectorAll('.sort-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      document.querySelectorAll('.sort-option').forEach(o => o.classList.remove('active'));
      e.target.classList.add('active');
      state.sortMode = e.target.dataset.sort;
      els.library.sortDropdown.classList.remove('show');
      renderBooks();
    });
  });

  // Drag & Drop
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (state.currentBook) return; // Don't show in reader
    els.library.dropOverlay.classList.add('active');
  });
  els.library.dropOverlay.addEventListener('dragleave', () => {
    els.library.dropOverlay.classList.remove('active');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    els.library.dropOverlay.classList.remove('active');
    if (state.currentBook) return;
    
    if (e.dataTransfer.files.length) {
      els.library.fileInput.files = e.dataTransfer.files;
      handleFileUpload({ target: els.library.fileInput });
    }
  });

  // Global clicks (close dropdowns)
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#sort-btn') && !e.target.closest('#sort-dropdown')) {
      els.library.sortDropdown.classList.remove('show');
    }
    if (!e.target.closest('#reader-settings-btn') && !e.target.closest('#settings-panel')) {
      els.settings.panel.classList.remove('show');
    }
  });

  // Reader Events
  els.reader.backBtn.addEventListener('click', closeBook);
  
  // A tap/click keeps the top controls available without covering the reading area.
  let uiVisible = true;
  els.reader.area.addEventListener('click', () => {
    uiVisible = !uiVisible;
    els.reader.header.classList.toggle('show', uiVisible);
  });
  
  // Start with UI visible
  els.reader.header.classList.add('show');

  // Sidebar toggles
  els.reader.tocBtn.addEventListener('click', () => openSidebar('toc'));
  els.reader.bookmarkBtn.addEventListener('click', toggleBookmark);
  els.reader.searchBtn.addEventListener('click', () => openSidebar('search'));
  els.reader.annotationsBtn.addEventListener('click', () => openSidebar('annotations'));
  els.annotations.exportBtn.addEventListener('click', openExportModal);
  els.annotations.exportClose.addEventListener('click', closeExportModal);
  els.annotations.exportCancel.addEventListener('click', closeExportModal);
  els.annotations.exportConfirm.addEventListener('click', doExportAnnotations);
  els.annotations.exportModal.addEventListener('click', (e) => {
    if (e.target === els.annotations.exportModal) closeExportModal();
  });
  els.sidebars.searchGo.addEventListener('click', executeBookSearch);
  els.sidebars.searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeBookSearch();
  });
  els.reader.settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    els.settings.panel.classList.toggle('show');
  });
  els.settings.closeBtn.addEventListener('click', () => {
    els.settings.panel.classList.remove('show');
  });


  document.querySelectorAll('.sidebar-close').forEach(btn => {
    btn.addEventListener('click', closeSidebars);
  });
  els.sidebars.overlay.addEventListener('click', closeSidebars);

  // Settings Events
  els.settings.fontDec.addEventListener('click', () => changeFontSize(-10));
  els.settings.fontInc.addEventListener('click', () => changeFontSize(10));
  
  els.settings.fontOpts.forEach(opt => {
    opt.addEventListener('click', (e) => {
      changeFontFamily(e.currentTarget.dataset.font);
      els.settings.panel.classList.remove('show');
    });
  });
  
  els.settings.themeOpts.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const themeBtn = e.target.closest('.theme-btn');
      if (themeBtn) applyTheme(themeBtn.dataset.theme);
    });
  });
  
  els.settings.spacingOpts.forEach(btn => {
    btn.addEventListener('click', (e) => changeSpacing(e.target.dataset.spacing));
  });
  
  els.settings.marginOpts.forEach(btn => {
    btn.addEventListener('click', (e) => changeMargin(e.target.dataset.margin));
  });

  els.settings.boldBtn.addEventListener('click', () => toggleStyle('bold'));
  els.settings.italicBtn.addEventListener('click', () => toggleStyle('italic'));

  // Annotations Events
  els.annotations.btns.forEach(btn => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget;
      if (target.classList.contains('hl-note')) {
        openNoteModal();
      } else if (target.classList.contains('hl-remove')) {
        removeSelectedAnnotations();
      } else if (target.classList.contains('hl-underline')) {
        addUnderline();
      } else if (target.dataset.color) {
        state.selectedHighlightColor = target.dataset.color;
        localStorage.setItem('bookhaven-hl-color', target.dataset.color);
        els.annotations.btns.forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        addHighlight(target.dataset.color);
      }
    });
  });

  els.annotations.noteCancel.addEventListener('click', closeNoteModal);
  els.annotations.noteClose.addEventListener('click', closeNoteModal);
  els.annotations.noteSave.addEventListener('click', saveNote);
  
  // Close toolbar on click outside
  document.addEventListener('click', (e) => {
    if (justSelected) return;
    if (!e.target.closest('#highlight-toolbar') && els.annotations.toolbar.classList.contains('show')) {
      els.annotations.toolbar.classList.remove('show');
    }
  });
  
  // Keyboard Navigation
  document.addEventListener('keydown', (e) => {
    // Ctrl+K for search (anywhere)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (state.rendition) {
        openSidebar('search');
      } else {
        els.library.searchInput.focus();
      }
      return;
    }

    // Library search
    if (!state.rendition && e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      els.library.searchInput.focus();
      return;
    }

    // Arrow keys in reader (document-level so it works even when iframe hasn't focused)
    if (state.rendition) {
      if (e.key === 'ArrowLeft' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        navigateReader('prev');
        return;
      }
      if (e.key === 'ArrowRight' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        navigateReader('next');
        return;
      }
    }

    if (e.key === 'Escape') {
      closeSidebars();
      els.settings.panel.classList.remove('show');
      if (state.rendition) closeBook();
    }
  });

  // Modals
  els.modals.bookInfoClose.addEventListener('click', () => {
    els.modals.bookInfo.classList.remove('show');
  });

  // Analytics
  document.getElementById('analytics-btn').addEventListener('click', openAnalytics);
  document.getElementById('analytics-modal-close').addEventListener('click', closeAnalytics);
  document.getElementById('analytics-modal-close-btn').addEventListener('click', closeAnalytics);
  document.getElementById('analytics-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAnalytics();
  });
}

// -----------------------------------------------------------------------------
// LIBRARY MANAGEMENT
// -----------------------------------------------------------------------------
async function loadBooks() {
  showLoading('Loading library...');
  try {
    const keys = await localforage.keys();
    state.books = [];
    
    for (const key of keys) {
      if (key.startsWith('book_info_')) {
        const bookInfo = await localforage.getItem(key);
        if (bookInfo) state.books.push(bookInfo);
      }
    }
    renderBooks();
  } catch (err) {
    console.error('Error loading books', err);
    showToast('Failed to load library');
  } finally {
    hideLoading();
  }
}

async function handleFileUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  
  showLoading(`Importing ${files.length} book(s)...`);
  
  let successCount = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.name.endsWith('.epub')) continue;
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const id = 'book_' + Date.now() + '_' + i;
      
      // Temporary epub instance to extract metadata and cover
      const book = ePub(arrayBuffer);
      await book.ready;
      
      const meta = await book.loaded.metadata;
      let coverUrl = null;
      
      try {
        const coverPath = await book.loaded.cover;
        if (coverPath) {
          const coverUrlData = await book.archive.createUrl(coverPath, { base64: true });
          coverUrl = coverUrlData;
        }
      } catch (e) {
        console.warn('Could not load cover for', file.name);
      }
      
      const bookInfo = {
        id,
        title: meta.title || file.name.replace('.epub', ''),
        author: meta.creator || 'Unknown Author',
        description: meta.description || '',
        coverUrl,
        addedAt: Date.now(),
        filename: file.name
      };
      
      // Save data and metadata
      await localforage.setItem(`book_data_${id}`, arrayBuffer);
      await localforage.setItem(`book_info_${id}`, bookInfo);
      
      state.books.push(bookInfo);
      successCount++;
    } catch (err) {
      console.error('Failed to parse EPUB', file.name, err);
      showToast(`Failed to import ${file.name}`);
    }
  }
  
  hideLoading();
  els.library.fileInput.value = ''; // Reset
  
  if (successCount > 0) {
    showToast(`Successfully imported ${successCount} book(s)`);
    renderBooks();
  } else {
    showToast('No books were imported. Check file format.');
  }
}

function renderBooks() {
  const bookCount = state.books.length;
  els.library.bookCount.textContent = `${bookCount} ${bookCount === 1 ? 'book' : 'books'}`;
  els.library.status.textContent = bookCount
    ? `${bookCount === 1 ? 'One book is' : `${bookCount} books are`} ready whenever you are.`
    : 'Your books stay private, right here on this device.';

  let filtered = state.books.filter(b => 
    b.title.toLowerCase().includes(state.searchQuery) || 
    b.author.toLowerCase().includes(state.searchQuery)
  );
  
  // Sorting
  if (state.sortMode === 'recent') {
    filtered.sort((a, b) => b.addedAt - a.addedAt);
  } else if (state.sortMode === 'title') {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else if (state.sortMode === 'author') {
    filtered.sort((a, b) => a.author.localeCompare(b.author));
  }
  
  if (filtered.length === 0) {
    els.library.grid.style.display = 'none';
    els.library.emptyState.classList.add('show');
    if (state.books.length > 0) {
      els.library.emptyState.querySelector('h2').textContent = 'No books found';
      els.library.emptyState.querySelector('p').textContent = 'Try adjusting your search';
    }
    return;
  }
  
  els.library.emptyState.classList.remove('show');
  els.library.grid.style.display = state.viewMode === 'list' ? 'flex' : 'grid';
  els.library.grid.innerHTML = '';
  
  filtered.forEach(book => {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.dataset.id = book.id;
    
    const pct = book.percentRead || 0;

    // Build the card with DOM APIs to avoid XSS via EPUB metadata
    const wrapper = document.createElement('div');
    wrapper.className = 'book-cover-wrapper';

    if (pct > 0) {
      const badge = document.createElement('span');
      badge.className = 'continue-badge';
      badge.textContent = 'Continue';
      wrapper.appendChild(badge);
    }

    if (book.coverUrl) {
      const img = document.createElement('img');
      img.src = book.coverUrl;
      img.className = 'book-cover';
      img.alt = `Cover of ${book.title}`;
      img.loading = 'lazy';
      wrapper.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'book-cover-placeholder';
      ph.textContent = book.title.substring(0, 2).toUpperCase();
      wrapper.appendChild(ph);
    }

    const progressBar = document.createElement('div');
    progressBar.className = 'book-progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'book-progress-fill';
    progressFill.style.width = `${pct}%`;
    progressBar.appendChild(progressFill);
    wrapper.appendChild(progressBar);

    const actions = document.createElement('div');
    actions.className = 'book-actions';
    let infoBtn = document.createElement('button');
    infoBtn.className = 'book-action-btn btn-info';
    infoBtn.title = 'Info';
    infoBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`;
    actions.appendChild(infoBtn);
    wrapper.appendChild(actions);

    card.appendChild(wrapper);

    const info = document.createElement('div');
    info.className = 'book-info';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'book-title';
    titleDiv.textContent = book.title;
    titleDiv.title = book.title;
    info.appendChild(titleDiv);

    const authorDiv = document.createElement('div');
    authorDiv.className = 'book-author';
    authorDiv.textContent = book.author + (pct > 0 ? ` · ${pct}%` : '');
    info.appendChild(authorDiv);

    card.appendChild(info);
    
    // Read on click
    card.addEventListener('click', (e) => {
      if (e.target.closest('.book-action-btn')) return;
      openBook(book.id);
    });
    
    // Info button (infoBtn already declared above)
    infoBtn = card.querySelector('.btn-info');
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showBookInfo(book);
    });
    
    els.library.grid.appendChild(card);
  });
}

function handleSearch(e) {
  state.searchQuery = e.target.value.toLowerCase();
  renderBooks();
}

function toggleViewMode() {
  state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
  if (state.viewMode === 'list') {
    els.library.grid.classList.add('list-view');
  } else {
    els.library.grid.classList.remove('list-view');
  }
  renderBooks();
}

function showBookInfo(book) {
  const dateAdded = new Date(book.addedAt).toLocaleDateString();

  // Build modal content with DOM APIs — never innerHTML with user data
  els.modals.bookInfoContent.innerHTML = '';

  // --- Header ---
  const header = document.createElement('div');
  header.className = 'book-info-header';

  const bg = document.createElement('div');
  bg.className = 'book-info-bg';
  if (book.coverUrl) {
    bg.style.backgroundImage = `url(${book.coverUrl})`;
  } else {
    bg.style.backgroundColor = 'var(--accent-color)';
  }
  header.appendChild(bg);

  const headerContent = document.createElement('div');
  headerContent.className = 'book-info-header-content';

  if (book.coverUrl) {
    const img = document.createElement('img');
    img.src = book.coverUrl;
    img.className = 'book-info-cover';
    img.alt = 'Cover';
    headerContent.appendChild(img);
  } else {
    const noCover = document.createElement('div');
    noCover.className = 'book-info-cover';
    noCover.style.cssText = 'height:150px;background:#ddd;display:flex;align-items:center;justify-content:center';
    noCover.textContent = 'No Cover';
    headerContent.appendChild(noCover);
  }

  const titles = document.createElement('div');
  titles.className = 'book-info-titles';
  const titleEl = document.createElement('h2');
  titleEl.textContent = book.title;
  titles.appendChild(titleEl);
  const authorEl = document.createElement('p');
  authorEl.textContent = book.author;
  titles.appendChild(authorEl);
  headerContent.appendChild(titles);
  header.appendChild(headerContent);
  els.modals.bookInfoContent.appendChild(header);

  // --- Details ---
  const details = document.createElement('div');
  details.className = 'book-info-details';

  const metadata = document.createElement('div');
  metadata.className = 'book-metadata';

  const addMeta = (label, value) => {
    const item = document.createElement('div');
    item.className = 'meta-item';
    const lbl = document.createElement('span');
    lbl.className = 'meta-label';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'meta-value';
    val.textContent = value;
    item.appendChild(lbl);
    item.appendChild(val);
    metadata.appendChild(item);
  };
  addMeta('Added', dateAdded);
  addMeta('Format', 'EPUB');

  details.appendChild(metadata);

  if (book.description) {
    const desc = document.createElement('div');
    desc.className = 'book-description';
    desc.textContent = book.description;
    details.appendChild(desc);
  }

  els.modals.bookInfoContent.appendChild(details);

  // --- Actions ---
  const actions = document.createElement('div');
  actions.className = 'book-info-actions';

  const readBtn = document.createElement('button');
  readBtn.className = 'read-btn';
  readBtn.id = 'modal-read-btn';
  readBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg> Read Now';
  actions.appendChild(readBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.id = 'modal-delete-btn';
  deleteBtn.title = 'Remove Book';
  deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>';
  actions.appendChild(deleteBtn);

  els.modals.bookInfoContent.appendChild(actions);
  
  els.modals.bookInfo.classList.add('show');
  
  document.getElementById('modal-read-btn').addEventListener('click', () => {
    els.modals.bookInfo.classList.remove('show');
    openBook(book.id);
  });
  
  document.getElementById('modal-delete-btn').addEventListener('click', async () => {
    if (confirm(`Are you sure you want to remove "${book.title}" from your library?`)) {
      await localforage.removeItem(`book_info_${book.id}`);
      await localforage.removeItem(`book_data_${book.id}`);
      await localforage.removeItem(`book_locations_${book.id}`);
      await localforage.removeItem(`book_annotations_${book.id}`);
      
      state.books = state.books.filter(b => b.id !== book.id);
      els.modals.bookInfo.classList.remove('show');
      renderBooks();
      showToast('Book removed');
    }
  });
}

// -----------------------------------------------------------------------------
// READER MANAGEMENT
// -----------------------------------------------------------------------------
async function openBook(id) {
  showLoading('Opening book...');
  try {
    const bookInfo = state.books.find(b => b.id === id);
    if (!bookInfo) throw new Error('Book not found in state');
    
    const arrayBuffer = await localforage.getItem(`book_data_${id}`);
    if (!arrayBuffer) throw new Error('Book data not found');
    
    // Clear previous
    els.reader.area.innerHTML = '';
    if (state.rendition) {
      state.rendition.destroy();
      state.currentBook.destroy();
    }
    
    state.currentBook = ePub(arrayBuffer);
    state.currentBookId = id;
    
    // Wait for book to be ready
    await state.currentBook.ready;
    
    state.rendition = state.currentBook.renderTo(els.reader.area, {
      width: '100%',
      height: '100%',
      spread: 'none',
      manager: 'continuous',
      flow: 'paginated'
    });

    // EPUB chapters render in their own documents, so bundle and inject each
    // reading font instead of relying on a network font request.
    state.rendition.hooks.content.register((contents) => {
      contents.addStylesheetCss(READER_FONT_CSS, 'bookhaven-reader-fonts');
      if (contents.document && contents.document.body) {
        contents.document.body.classList.remove('theme-light', 'theme-sepia', 'theme-dark');
        contents.document.body.classList.add(`theme-${state.theme}`);
      }

      // Every EPUB section runs in its own iframe. A font change re-creates
      // those frames, so keyboard navigation must be attached when each
      // document loads rather than only to whichever iframe appeared first.
      const chapterDocument = contents.document;
      if (!chapterDocument || chapterDocument.documentElement.dataset.bookhavenNavListener) return;
      chapterDocument.documentElement.dataset.bookhavenNavListener = 'true';
      chapterDocument.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          navigateReader('prev');
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          navigateReader('next');
        }
      });
    });
    
    // Setup Styling
    setupRenditionTheme();

    state.annotations = await localforage.getItem(`book_annotations_${id}`) || [];
    restoreAnnotations();
    state.bookmarks = await localforage.getItem(`book_bookmarks_${id}`) || [];
    renderBookmarks();

    // Start reading session
    state.sessionStart = Date.now();
    
    // Generate Locations for pagination
    const savedLocations = await localforage.getItem(`book_locations_${id}`);
    if (savedLocations) {
      state.currentBook.locations.load(savedLocations);
    } else {
      await state.currentBook.locations.generate(1600); // Generate based on chars
      await localforage.setItem(`book_locations_${id}`, state.currentBook.locations.save());
    }
    
    // Try to restore previous location
    const lastLocation = await localforage.getItem(`last_location_${id}`);
    if (lastLocation) {
      state.rendition.display(lastLocation);
    } else {
      state.rendition.display();
    }
    
    // Set UI
    els.reader.title.textContent = bookInfo.title;
    els.views.library.classList.remove('active');
    els.views.reader.classList.add('active');
    
    // Events
    state.rendition.on('relocated', handleRelocated);
    
    state.rendition.on('selected', (cfiRange, contents) => {
      state.currentSelection = { cfiRange, contents };
      const selection = contents.window.getSelection();
      if (!selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const iframe = els.reader.area.querySelector('iframe');
      if (!iframe) return;
      const iframeRect = iframe.getBoundingClientRect();
      
      const toolbarWidth = els.annotations.toolbar.offsetWidth || 240;
      const top = Math.max(16, iframeRect.top + rect.top - 54);
      const left = Math.max(16, Math.min(window.innerWidth - toolbarWidth - 16, iframeRect.left + rect.left + (rect.width / 2) - (toolbarWidth / 2)));
      
      els.annotations.toolbar.style.top = `${top}px`;
      els.annotations.toolbar.style.left = `${left}px`;
      els.annotations.toolbar.classList.add('show');

      justSelected = true;
      setTimeout(() => { justSelected = false; }, 400);
    });

    state.rendition.on('markClicked', (cfiRange, data, contents) => {
      if (data?.annotationId) openSidebar('annotations');
    });

    // Setup TOC
    setupTOC();
    renderAnnotations();
    
    hideLoading();
  } catch (err) {
    console.error('Error opening book', err);
    showToast('Failed to open book');
    hideLoading();
  }
}

function closeBook() {
  // End reading session
  if (state.sessionStart && state.rendition) {
    const elapsed = Date.now() - state.sessionStart;
    if (elapsed > 5000) {
      const stats = loadReadingStats();
      stats.totalReadMs += elapsed;
      stats.sessions += 1;
      const today = new Date().toISOString().slice(0, 10);
      stats.lastReadDate = today;
      stats.streakDays = calcStreak(stats.lastReadDate, stats.streakDays);
      stats.weeklyMinutes = updateWeeklyMinutes(stats.weeklyMinutes, today, elapsed);
      saveReadingStats(stats);
    }
    state.sessionStart = null;
  }

  if (state.rendition) {
    state.rendition.destroy();
    state.currentBook.destroy();
    state.rendition = null;
    state.currentBook = null;
    state.currentBookId = null;
    state.annotations = [];
    state.isLayoutRefreshing = false;
    state.pendingNavigation = null;
    state.bookmarks = [];
  }
  
  els.views.reader.classList.remove('active');
  els.views.library.classList.add('active');
  closeSidebars();
}

// -----------------------------------------------------------------------------
// READING STATISTICS / ANALYTICS
// -----------------------------------------------------------------------------
function loadReadingStats() {
  if (state.readingStats) return state.readingStats;
  const saved = localStorage.getItem('bookhaven-reading-stats');
  const defaults = {
    totalReadMs: 0,
    totalWordsRead: 0,
    sessions: 0,
    lastReadDate: null,
    streakDays: 0,
    weeklyMinutes: [0, 0, 0, 0, 0, 0, 0]
  };
  state.readingStats = saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  return state.readingStats;
}

function saveReadingStats(stats) {
  state.readingStats = stats;
  localStorage.setItem('bookhaven-reading-stats', JSON.stringify(stats));
}

function calcStreak(lastDate, streak) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (!lastDate) return 1;
  const last = new Date(lastDate + 'T00:00:00');
  const diff = Math.round((new Date(today + 'T00:00:00') - last) / 86400000);
  if (diff === 0) return streak;
  if (diff === 1) return streak + 1;
  return 1;
}

function updateWeeklyMinutes(weekly, today, elapsedMs) {
  const dayIndex = new Date(today).getDay();
  const sundayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
  const mins = Math.round(elapsedMs / 60000);
  weekly[sundayIndex] = (weekly[sundayIndex] || 0) + mins;
  return weekly;
}

function openAnalytics() {
  const stats = loadReadingStats();
  const totalHours = (stats.totalReadMs / 3600000).toFixed(1);
  const streakLabel = stats.streakDays === 1 ? '1 day' : `${stats.streakDays} days`;
  const avgWpm = stats.totalReadMs > 0 && stats.totalWordsRead > 0
    ? Math.round(stats.totalWordsRead / (stats.totalReadMs / 60000))
    : 0;

  document.getElementById('analytics-time').textContent = `${totalHours} hrs`;
  document.getElementById('analytics-streak').textContent = streakLabel;
  document.getElementById('analytics-speed').textContent = `${avgWpm} wpm`;

  // Weekly chart
  const chartEl = document.querySelector('.chart-container > div');
  if (chartEl) {
    const maxMin = Math.max(...stats.weeklyMinutes, 1);
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    chartEl.innerHTML = dayLabels.map((label, i) => {
      const barH = Math.max(4, (stats.weeklyMinutes[i] || 0) / maxMin * 80);
      return `<div class="chart-bar-container"><div class="chart-bar" style="height:${barH}px;"></div><span class="chart-bar-label">${label}</span></div>`;
    }).join('');
  }

  document.getElementById('analytics-modal').classList.add('show');
}

function closeAnalytics() {
  document.getElementById('analytics-modal').classList.remove('show');
}

async function handleRelocated(location) {
  if (!state.currentBook) return;
  
  // Track words read (estimate ~250 words per page)
  // Only count unique page visits within a session
  if (state.currentBookId && state.sessionStart) {
    if (!state.visitedCfi) state.visitedCfi = new Set();
    const cfiKey = location.start.cfi.replace(/!$/, '');
    if (!state.visitedCfi.has(cfiKey)) {
      state.visitedCfi.add(cfiKey);
      const stats = loadReadingStats();
      stats.totalWordsRead = (stats.totalWordsRead || 0) + Math.round(250);
      saveReadingStats(stats);
    }
  }
  
  // Update bookmark button active status
  updateBookmarkIconState();

  // Save location and reading progress
  const bookInfo = state.currentBookId
    ? state.books.find(b => b.id === state.currentBookId)
    : state.books.find(b => b.title === els.reader.title.textContent);
  if (bookInfo) {
    await localforage.setItem(`last_location_${bookInfo.id}`, location.start.cfi);
    if (percentageStr > (bookInfo.percentRead || 0)) {
      bookInfo.percentRead = percentageStr;
      await localforage.setItem(`book_info_${bookInfo.id}`, bookInfo);
      renderBooks();
    }
  }
}

async function setupTOC() {
  if (!state.currentBook) return;
  
  const nav = await state.currentBook.loaded.navigation;
  els.sidebars.tocList.innerHTML = '';
  
  if (nav.toc && nav.toc.length > 0) {
    renderTOC(nav.toc, els.sidebars.tocList);
  } else {
    els.sidebars.tocList.innerHTML = '<p class="empty-sidebar">No Table of Contents</p>';
  }
}

function renderTOC(items, container, level = 0) {
  items.forEach(item => {
    const link = document.createElement('a');
    link.className = 'toc-item';
    link.textContent = item.label.trim();
    link.style.paddingLeft = `${20 + (level * 16)}px`;
    link.href = "#";
    
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (state.rendition) {
        state.rendition.display(item.href);
        closeSidebars();
      }
    });
    
    container.appendChild(link);
    
    if (item.subitems && item.subitems.length > 0) {
      renderTOC(item.subitems, container, level + 1);
    }
  });
}

function updateBookmarkIconState() {
  if (!els.reader.bookmarkBtn || !state.rendition) return;
  const location = state.rendition.currentLocation();
  if (!location || !location.start) {
    els.reader.bookmarkBtn.classList.remove('active');
    return;
  }
  const cfi = location.start.cfi;
  const isBookmarked = state.bookmarks.some(b => b.cfi === cfi);
  els.reader.bookmarkBtn.classList.toggle('active', isBookmarked);
}

async function toggleBookmark() {
  if (!state.currentBook || !state.rendition || !state.currentBookId) return;
  const location = state.rendition.currentLocation();
  if (!location || !location.start) return;

  const cfi = location.start.cfi;
  const existingIndex = state.bookmarks.findIndex(b => b.cfi === cfi);

  if (existingIndex >= 0) {
    state.bookmarks.splice(existingIndex, 1);
    await saveBookmarks();
    renderBookmarks();
    updateBookmarkIconState();
  } else {
    let percent = 0;
    if (state.currentBook.locations && state.currentBook.locations.total) {
      percent = Math.round((state.currentBook.locations.percentageFromCfi(cfi) || 0) * 100);
    }
    const totalPages = (state.currentBook.locations && state.currentBook.locations.total) || 1;
    const pageNum = Math.round((percent / 100) * totalPages) || 1;
    
    const bookmark = {
      id: 'bm_' + Date.now(),
      cfi,
      page: pageNum,
      percent,
      label: `Page ${pageNum} (${percent}%)`,
      createdAt: Date.now()
    };
    
    state.bookmarks.push(bookmark);
    await saveBookmarks();
    renderBookmarks();
    updateBookmarkIconState();
  }
}

async function saveBookmarks() {
  if (state.currentBookId) {
    await localforage.setItem(`book_bookmarks_${state.currentBookId}`, state.bookmarks);
  }
}

function renderBookmarks() {
  const container = els.sidebars.bookmarksList;
  if (!container) return;
  container.innerHTML = '';

  if (!state.bookmarks.length) {
    container.innerHTML = '<p class="empty-sidebar">No bookmarks yet</p>';
    return;
  }

  [...state.bookmarks].sort((a, b) => b.createdAt - a.createdAt).forEach(bm => {
    const item = document.createElement('div');
    item.className = 'bookmark-item';

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('width', '18');
    icon.setAttribute('height', '18');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.cssText = 'flex-shrink:0;margin-top:2px';
    const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    iconPath.setAttribute('d', 'M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z');
    iconPath.setAttribute('fill', '#3b82f6');
    icon.appendChild(iconPath);

    const info = document.createElement('div');
    info.className = 'bookmark-info';
    
    const text = document.createElement('div');
    text.className = 'bookmark-text';
    text.textContent = bm.label;

    const date = document.createElement('div');
    date.className = 'bookmark-date';
    date.textContent = new Date(bm.createdAt).toLocaleDateString();

    info.appendChild(text);
    info.appendChild(date);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'bookmark-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove bookmark';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeBookmark(bm.id);
    });

    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(removeBtn);

    item.addEventListener('click', () => {
      if (state.rendition) {
        state.rendition.display(bm.cfi);
        closeSidebars();
      }
    });

    container.appendChild(item);
  });
}

async function removeBookmark(id) {
  state.bookmarks = state.bookmarks.filter(b => b.id !== id);
  await saveBookmarks();
  renderBookmarks();
  updateBookmarkIconState();
}

async function executeBookSearch() {
  if (!state.currentBook) return;
  const query = els.sidebars.searchInput.value.trim();
  if (!query) return;

  const container = els.sidebars.searchResults;
  container.innerHTML = '<p class="empty-sidebar">Searching...</p>';

  try {
    const results = await Promise.all(
      state.currentBook.spine.spineItems.map(async (item) => {
        await item.load(state.currentBook.load.bind(state.currentBook));
        const docResults = item.find(query);
        item.unload();
        return docResults;
      })
    );

    const flatResults = results.flat();

    if (!flatResults.length) {
      const noResP = document.createElement('p');
      noResP.className = 'empty-sidebar';
      noResP.textContent = `No results for "${query}"`;
      container.appendChild(noResP);
      return;
    }

    container.innerHTML = '';
    flatResults.forEach(res => {
      const div = document.createElement('div');
      div.className = 'search-result-item';

      const excerpt = document.createElement('div');
      excerpt.className = 'search-result-excerpt';
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      // Build highlighting with DOM APIs — no innerHTML from EPUB text
      const parts = res.excerpt.split(regex);
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 1) {
          const mark = document.createElement('mark');
          mark.textContent = parts[i];
          excerpt.appendChild(mark);
        } else {
          excerpt.appendChild(document.createTextNode(parts[i]));
        }
      }

      div.appendChild(excerpt);

      div.addEventListener('click', () => {
        if (state.rendition) {
          state.rendition.display(res.cfi);
          closeSidebars();
        }
      });

      container.appendChild(div);
    });
  } catch (err) {
    console.error('Search error:', err);
    container.innerHTML = '<p class="empty-sidebar">Failed to complete search</p>';
  }
}

// -----------------------------------------------------------------------------
// SETTINGS & THEMES
// -----------------------------------------------------------------------------
function applyTheme(themeName) {
  state.theme = themeName;
  document.body.setAttribute('data-theme', themeName);
  localStorage.setItem('bookhaven-theme', themeName);
  
  els.settings.themeOpts.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === themeName);
  });
  
  if (state.rendition) {
    setupRenditionTheme();
    refreshReaderPagination();
  }
}

function changeFontSize(delta) {
  state.fontSize = Math.max(50, Math.min(300, state.fontSize + delta));
  els.settings.fontVal.textContent = `${state.fontSize}%`;
  localStorage.setItem('bookhaven-fontsize', state.fontSize);

  if (state.rendition) {
    setupRenditionTheme();
    refreshReaderPagination();
  }
}

function changeFontFamily(font) {
  state.fontFamily = font;
  localStorage.setItem('bookhaven-fontfamily', font);
  
  els.settings.fontOpts.forEach(opt => {
    opt.classList.toggle('active', opt.dataset.font === font);
  });
  
  if (state.rendition) {
    setupRenditionTheme();
    refreshReaderPagination();
  }
}

function changeSpacing(spacing) {
  state.lineSpacing = spacing;
  localStorage.setItem('bookhaven-linespacing', spacing);
  
  els.settings.spacingOpts.forEach(opt => {
    opt.classList.toggle('active', opt.dataset.spacing === spacing);
  });
  
  if (state.rendition) {
    setupRenditionTheme();
    refreshReaderPagination();
  }
}

function changeMargin(margin) {
  state.margin = margin;
  localStorage.setItem('bookhaven-margin', margin);
  
  els.settings.marginOpts.forEach(opt => {
    opt.classList.toggle('active', opt.dataset.margin === margin);
  });
  
  // Need to recreate rendition for margin changes or hack container padding
  if (state.rendition) {
    // Quick hack for demo
    const paddingMap = { 'narrow': '0 20px', 'normal': '0 40px', 'wide': '0 80px' };
    const epubView = els.reader.area.querySelector('.epub-view');
    if (epubView) epubView.style.padding = paddingMap[margin];
    refreshReaderPagination();
  }
}

function setupRenditionTheme() {
  if (!state.rendition) return;
  
  // Map font-family choices
  const fontMap = {
    'default': '"Newsreader", Georgia, serif',
    'newsreader': '"Newsreader", Georgia, serif',
    'fraunces': '"Fraunces", Georgia, serif',
    'ebgaramond': '"EB Garamond", Georgia, serif',
    'instrumentserif': '"Instrument Serif", serif'
  };
  
  // Map theme colors
  const themeColors = {
    'light': { bg: '#ffffff', text: '#333333' },
    'dark': { bg: '#000000', text: '#dedede' },
    'sepia': { bg: '#faeed9', text: '#433422' }
  };
  
  const currentColors = themeColors[state.theme] || themeColors['light'];
  const fontFamily = fontMap[state.fontFamily] || fontMap.default;
  
  // Register theme with epub.js
  const bodyStyles = {
    'font-family': fontFamily + ' !important',
    'line-height': state.lineSpacing + ' !important',
    'color': currentColors.text + ' !important',
  };

  state.rendition.themes.register('custom', {
    'html, body': {
      'background': currentColors.bg + ' !important',
      'color': currentColors.text + ' !important',
      'font-family': fontFamily + ' !important',
      'line-height': state.lineSpacing + ' !important',
      'font-weight': state.bold ? '700 !important' : '400 !important',
      'font-style': state.italic ? 'italic !important' : 'normal !important',
    },
    'body, body *': bodyStyles,
    'h1, h2, h3, h4, h5, h6': {
      'color': currentColors.text + ' !important',
      'font-family': fontFamily + ' !important',
    }
  });
  
  state.rendition.themes.select('custom');
  state.rendition.themes.font(fontFamily);
  state.rendition.themes.fontSize(`${state.fontSize}%`);
  
  // Initial margin setup
  const paddingMap = { 'narrow': '0 20px', 'normal': '0 40px', 'wide': '0 80px' };
  setTimeout(() => {
    const epubView = els.reader.area.querySelector('.epub-view');
    if (epubView) epubView.style.padding = paddingMap[state.margin];
  }, 100);

  // Sync theme classes to all active iframe bodies dynamically
  if (state.rendition.views) {
    state.rendition.views().forEach(view => {
      if (view.iframe && view.iframe.contentDocument) {
        const body = view.iframe.contentDocument.body;
        if (body) {
          body.classList.remove('theme-light', 'theme-sepia', 'theme-dark');
          body.classList.add(`theme-${state.theme}`);
        }
      }
    });
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      reRenderAnnotations();
    });
  });
}

// -----------------------------------------------------------------------------
// UTILS & UI
// -----------------------------------------------------------------------------
function openSidebar(id) {
  closeSidebars();
  const target = id === 'toc' ? els.sidebars.toc : 
                 id === 'bookmarks' ? els.sidebars.bookmarks : 
                 id === 'annotations' ? els.sidebars.annotations :
                 els.sidebars.search;
  
  if (id === 'search') {
    target.classList.add('centered');
    setTimeout(() => document.getElementById('book-search-input').focus(), 100);
  }
  target.classList.add('open');
  els.sidebars.overlay.classList.add('show');
}

function closeSidebars() {
  const searchSidebar = els.sidebars.search;
  searchSidebar.classList.remove('centered');
  els.sidebars.toc.classList.remove('open');
  els.sidebars.bookmarks.classList.remove('open');
  searchSidebar.classList.remove('open');
  els.sidebars.annotations.classList.remove('open');
  els.sidebars.overlay.classList.remove('show');
}

function syncStyleButtons() {
  els.settings.boldBtn.classList.toggle('active', state.bold);
  els.settings.boldBtn.setAttribute('aria-checked', state.bold);
  els.settings.italicBtn.classList.toggle('active', state.italic);
  els.settings.italicBtn.setAttribute('aria-checked', state.italic);
}

function toggleStyle(style) {
  state[style] = !state[style];
  localStorage.setItem(`bookhaven-${style}`, state[style]);
  syncStyleButtons();
  setupRenditionTheme();
  refreshReaderPagination();
}

function navigateReader(direction) {
  if (!state.rendition) return;

  // A style change rebuilds the paginated chapter views. Remember a key press
  // made during that short rebuild instead of asking EPUB.js to navigate stale
  // page dimensions.
  if (state.isLayoutRefreshing) {
    state.pendingNavigation = direction;
    return;
  }

  state.rendition[direction]().catch((error) => {
    console.error(`Could not move to the ${direction} page`, error);
  });
}

function refreshReaderPagination() {
  const rendition = state.rendition;
  const cfi = rendition?.currentLocation()?.start?.cfi;
  if (!rendition || !cfi) return;

  const refreshId = ++state.layoutRefreshId;
  state.isLayoutRefreshing = true;

  // Let the EPUB iframe apply its new font metrics before re-creating the
  // paginated views at the same CFI.
  requestAnimationFrame(() => requestAnimationFrame(async () => {
    if (refreshId !== state.layoutRefreshId || rendition !== state.rendition) return;

    try {
      rendition.manager.clear();
      await rendition.display(cfi);
      reRenderAnnotations();
    } catch (error) {
      console.error('Could not refresh reader pagination', error);
    } finally {
      if (refreshId !== state.layoutRefreshId || rendition !== state.rendition) return;
      state.isLayoutRefreshing = false;
      const pendingDirection = state.pendingNavigation;
      state.pendingNavigation = null;
      if (pendingDirection) navigateReader(pendingDirection);
    }
  }));
}

function reRenderAnnotations() {
  if (!state.rendition) return;
  state.annotations.forEach(a => {
    const renderType = a.type === 'underline' ? 'underline' : 'highlight';
    state.rendition.annotations.remove(a.cfiRange, renderType);
  });
  state.annotations.forEach(drawAnnotation);
}

function showLoading(text = 'Loading...') {
  els.modals.loadingText.textContent = text;
  // Restart the page turn every time the loader opens instead of revealing a
  // hidden animation halfway through its cycle.
  els.modals.loading.classList.remove('active');
  void els.modals.loading.offsetWidth;
  els.modals.loading.classList.add('active');
}

function hideLoading() {
  els.modals.loading.classList.remove('active');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  // SVG icon is fully static — safe to use innerHTML
  toast.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M9 12l2 2 4-4"/></svg>';
  toast.appendChild(document.createTextNode(' ' + message));
  
  els.toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// -----------------------------------------------------------------------------
// UPDATE NOTIFICATION BANNER
// -----------------------------------------------------------------------------
const updateBanner = document.getElementById('update-banner');
if (updateBanner) {
  const updateBannerTitle = document.getElementById('update-banner-title');
  const updateBannerInstall = document.getElementById('update-banner-install');
  const updateBannerLater = document.getElementById('update-banner-later');
  const updateBannerClose = document.getElementById('update-banner-close');

  if (window.electronAPI) {
    window.electronAPI.onUpdateAvailable((info) => {
      updateBannerTitle.textContent = `A new version of BookHaven is available! (${info.currentVersion} → ${info.version})`;
      updateBanner.classList.add('show');
    });

    updateBannerInstall.addEventListener('click', () => {
      updateBanner.classList.remove('show');
      window.electronAPI.installUpdate();
    });

    const dismissUpdate = () => {
      updateBanner.classList.remove('show');
      window.electronAPI.dismissUpdate();
    };

    updateBannerLater.addEventListener('click', dismissUpdate);
    updateBannerClose.addEventListener('click', dismissUpdate);
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);

// -----------------------------------------------------------------------------
// ANNOTATIONS
// -----------------------------------------------------------------------------
function selectedText() {
  return state.currentSelection?.contents?.window.getSelection().toString().trim() || '';
}

function clearSelection() {
  els.annotations.toolbar.classList.remove('show');
  if (state.currentSelection?.contents) {
    state.currentSelection.contents.window.getSelection().removeAllRanges();
  }
  state.currentSelection = null;
}

function annotationData(annotation) {
  return { annotationId: annotation.id, note: annotation.note || '' };
}

function drawAnnotation(annotation) {
  if (!state.rendition) return;

  const onClick = () => openSidebar('annotations');
  if (annotation.type === 'underline') {
    state.rendition.annotations.underline(
      annotation.cfiRange,
      annotationData(annotation),
      onClick,
      'bookhaven-underline',
      { stroke: annotation.color, 'stroke-width': '2', 'stroke-opacity': '1.0', 'mix-blend-mode': 'normal' }
    );
  } else {
    state.rendition.annotations.highlight(
      annotation.cfiRange,
      annotationData(annotation),
      onClick,
      'bookhaven-highlight',
      { fill: annotation.color, 'fill-opacity': '0.55', 'mix-blend-mode': state.theme === 'dark' ? 'screen' : 'multiply' }
    );
  }
}

function restoreAnnotations() {
  state.annotations.forEach(drawAnnotation);
}

async function saveAnnotations() {
  if (state.currentBookId) {
    await localforage.setItem(`book_annotations_${state.currentBookId}`, state.annotations);
  }
}

async function addAnnotation(type, color, note = '') {
  if (!state.currentSelection || !state.rendition) return;

  const { cfiRange } = state.currentSelection;

  // Look up current chapter from TOC
  let chapter = '';
  try {
    const toc = state.currentBook?.navigation?.toc;
    if (toc && toc.length) {
      const docMatch = cfiRange.match(/\/[46]\/[^!]+/);
      if (docMatch) {
        const docPath = docMatch[0];
        let bestLen = 0;
        toc.forEach(item => {
          const href = item.href.split('#')[0];
          if (docPath.endsWith(href) && href.length > bestLen) {
            chapter = item.label;
            bestLen = href.length;
          }
        });
      }
    }
  } catch (_) {}

  const annotation = {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    cfiRange,
    text: selectedText(),
    color,
    note,
    chapter,
    createdAt: Date.now()
  };

  // A text range may only have one SVG annotation of each render type.
  const renderType = type === 'underline' ? 'underline' : 'highlight';
  const replaced = state.annotations.filter(item =>
    !(item.cfiRange === cfiRange && (item.type === 'underline' ? 'underline' : 'highlight') === renderType)
  );
  state.annotations = replaced;
  state.rendition.annotations.remove(cfiRange, renderType);
  state.annotations.push(annotation);
  drawAnnotation(annotation);
  await saveAnnotations();
  renderAnnotations();
  clearSelection();
}

async function addHighlight(color) {
  await addAnnotation('highlight', color);
}

async function addUnderline() {
  await addAnnotation('underline', '#dc2626');
}

async function removeSelectedAnnotations() {
  if (!state.currentSelection || !state.rendition) return;
  const { cfiRange } = state.currentSelection;
  state.rendition.annotations.remove(cfiRange, 'highlight');
  state.rendition.annotations.remove(cfiRange, 'underline');
  state.annotations = state.annotations.filter(item => item.cfiRange !== cfiRange);
  await saveAnnotations();
  renderAnnotations();
  clearSelection();
}

function renderAnnotations() {
  const list = els.sidebars.annotationsList;
  list.innerHTML = '';

  if (!state.annotations.length) {
    list.innerHTML = '<p class="empty-sidebar">Select text, then choose a highlight, underline, or note.</p>';
    return;
  }

  [...state.annotations].sort((a, b) => b.createdAt - a.createdAt).forEach(annotation => {
    const item = document.createElement('article');
    item.className = 'annotation-item';

    const action = document.createElement('button');
    action.className = 'annotation-open';
    action.type = 'button';
    action.addEventListener('click', () => {
      state.rendition?.display(annotation.cfiRange);
      closeSidebars();
    });

    const label = document.createElement('span');
    label.className = `annotation-type ${annotation.type}`;
    label.textContent = annotation.type === 'underline' ? 'Underlined' : annotation.type === 'note' ? 'Note' : 'Highlighted';
    label.style.setProperty('--annotation-color', annotation.color);

    const quote = document.createElement('p');
    quote.className = 'annotation-quote';
    quote.textContent = annotation.text || 'Selected text';
    action.append(label, quote);

    if (annotation.note) {
      const note = document.createElement('p');
      note.className = 'annotation-note';
      note.textContent = annotation.note;
      action.append(note);
    }

    const remove = document.createElement('button');
    remove.className = 'annotation-remove';
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove annotation');
    remove.innerHTML = '&times;';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      removeAnnotation(annotation.id);
    });

    item.append(action, remove);
    list.appendChild(item);
  });
}

async function removeAnnotation(id) {
  const annotation = state.annotations.find(item => item.id === id);
  if (!annotation || !state.rendition) return;
  state.rendition.annotations.remove(annotation.cfiRange, annotation.type === 'underline' ? 'underline' : 'highlight');
  state.annotations = state.annotations.filter(item => item.id !== id);
  await saveAnnotations();
  renderAnnotations();
}

function openNoteModal() {
  if (!state.currentSelection) return;
  const selection = state.currentSelection.contents.window.getSelection();
  const text = selection.toString();
  els.annotations.noteExcerpt.textContent = `"${text}"`;
  els.annotations.noteText.value = '';
  els.annotations.noteModal.classList.add('show');
  els.annotations.toolbar.classList.remove('show');
}

function closeNoteModal() {
  els.annotations.noteModal.classList.remove('show');
  if (state.currentSelection && state.currentSelection.contents) {
    state.currentSelection.contents.window.getSelection().removeAllRanges();
  }
  state.currentSelection = null;
}

function saveNote() {
  if (!state.currentSelection || !state.rendition) return;
  const note = els.annotations.noteText.value.trim();
  if (!note) return;
  addAnnotation('note', '#fde68a', note);
  closeNoteModal();
}

// -----------------------------------------------------------------------------
// EXPORT ANNOTATIONS
// -----------------------------------------------------------------------------
function openExportModal() {
  if (!state.annotations || !state.annotations.length) {
    showToast('No annotations to export');
    return;
  }
  updateExportPreview();
  els.annotations.exportModal.classList.add('show');
}

function closeExportModal() {
  els.annotations.exportModal.classList.remove('show');
}

function updateExportPreview() {
  const md = generateAnnotationsMarkdown(state.annotations, state.books.find(b => b.id === state.currentBookId));
  els.annotations.exportPreview.innerHTML = renderMarkdownPreview(md);
}

function getAnnotationColorLabel(color) {
  const map = {
    '#FBF719': 'Yellow',
    '#39FB19': 'Green',
    '#1920FB': 'Blue',
    '#FB198A': 'Pink',
    '#dc2626': 'Red',
    '#fde68a': 'Note'
  };
  return map[color] || '';
}

function generateAnnotationsMarkdown(annotations, bookInfo) {
  const includeHighlights = els.annotations.exportHighlights.checked;
  const includeUnderlines = els.annotations.exportUnderlines.checked;
  const includeNotes = els.annotations.exportNotes.checked;
  const includeChapters = els.annotations.exportChapters.checked;

  let filtered = annotations.filter(a => {
    if (a.type === 'highlight' && !includeHighlights) return false;
    if (a.type === 'underline' && !includeUnderlines) return false;
    if (a.type === 'note' && !includeNotes) return false;
    return true;
  });

  if (!filtered.length) return 'No annotations match your filters.';

  let lines = [];
  let title = bookInfo ? `${bookInfo.title} — ${bookInfo.author}` : 'Annotations';
  let count = filtered.length;
  lines.push(`# ${title}`);
  lines.push(`*Exported ${new Date().toLocaleDateString()} · ${count} ${count === 1 ? 'annotation' : 'annotations'}*`);
  lines.push('');

  let lastChapter = '';
  let chapterNum = 0;

  filtered.sort((a, b) => a.createdAt - b.createdAt);

  filtered.forEach(a => {
    const date = new Date(a.createdAt).toLocaleDateString();
    const typeLabel = a.type === 'underline' ? 'Underline' : a.type === 'note' ? 'Note' : 'Highlight';
    const colorLabel = getAnnotationColorLabel(a.color);

    if (includeChapters && a.chapter && a.chapter !== lastChapter) {
      lastChapter = a.chapter;
      chapterNum++;
      lines.push(`## ${a.chapter}${a.page ? ` (Page ${a.page})` : ''}`);
      lines.push('');
    }

    let block = `> **${typeLabel}**`;
    if (colorLabel) block += ` (${colorLabel})`;
    block += ` — *${date}*`;

    if (a.text) {
      const textLines = a.text.split('\n').map(l => l.trim()).filter(Boolean);
      textLines.forEach(l => {
        block += `\n> ${l}`;
      });
    }

    if (a.note) {
      block += `\n>\n> **Note:** ${a.note}`;
    }

    lines.push(block);
    lines.push('');
  });

  return lines.join('\n');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderMarkdownPreview(md) {
  const lines = md.split('\n');
  let html = '';
  let inBlockquote = false;

  const esc = escapeHtml;

  lines.forEach(line => {
    if (line.startsWith('# ')) {
      if (inBlockquote) { html += '</div>'; inBlockquote = false; }
      html += `<div class="md-h1">${esc(line.slice(2))}</div>`;
    } else if (line.startsWith('## ')) {
      if (inBlockquote) { html += '</div>'; inBlockquote = false; }
      html += `<div class="md-h2">${esc(line.slice(3))}</div>`;
    } else if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      if (inBlockquote) { html += '</div>'; inBlockquote = false; }
      html += `<div class="md-italic">${esc(line.slice(1, -1))}</div>`;
    } else if (line.startsWith('> **')) {
      // Escape the text first, then apply safe bold/italic formatting
      const rest = esc(line.slice(2)).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
      if (!inBlockquote) { html += '<div class="md-blockquote">'; inBlockquote = true; }
      html += `<div class="md-bq-header">${rest}</div>`;
    } else if (line.startsWith('> **Note:**')) {
      const noteText = esc(line.slice(2)).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html += `<div class="md-note">${noteText}</div>`;
    } else if (line.startsWith('> ') && inBlockquote) {
      html += `<div class="md-bq-text">${esc(line.slice(2))}</div>`;
    } else if (line.startsWith('>') && !line.slice(1).trim()) {
      // Empty blockquote line - just spacing
    } else if (line === '') {
      if (inBlockquote) { html += '</div>'; inBlockquote = false; }
    } else {
      if (inBlockquote) { html += '</div>'; inBlockquote = false; }
    }
  });

  if (inBlockquote) html += '</div>';
  return html || '<p style="color:var(--text-secondary);font-style:italic;">Select at least one type above.</p>';
}

async function doExportAnnotations() {
  if (!state.currentBookId || !state.annotations.length) {
    showToast('No annotations to export');
    closeExportModal();
    return;
  }

  const bookInfo = state.books.find(b => b.id === state.currentBookId);
  const md = generateAnnotationsMarkdown(state.annotations, bookInfo);
  const sanitized = bookInfo ? bookInfo.title.replace(/[^\w\s-]/g, '').trim() : 'BookHaven';
  const filename = `${sanitized}-Annotations.md`;

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  closeExportModal();
  showToast(`Exported ${sanitized}-Annotations.md`);
}
