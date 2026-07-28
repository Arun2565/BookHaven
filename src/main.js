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
  fill-opacity: 0.55 !important;
  mix-blend-mode: normal !important;
}
.bookhaven-highlight rect {
  rx: 4px !important;
  ry: 4px !important;
}

.theme-dark .bookhaven-highlight rect {
  fill-opacity: 0.28 !important;
}

.theme-sepia .bookhaven-highlight rect {
  fill-opacity: 0.4 !important;
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
  currentSelection: null
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
    footer: document.getElementById('reader-footer'),
    backBtn: document.getElementById('reader-back-btn'),
    title: document.getElementById('reader-book-title'),
    area: document.getElementById('reader-area'),
    prevBtn: document.getElementById('page-prev'),
    nextBtn: document.getElementById('page-next'),
    location: document.getElementById('reader-location'),
    percent: document.getElementById('reader-percent'),
    progress: document.getElementById('reader-progress'),
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
    noteClose: document.getElementById('note-modal-close')
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
  els.reader.prevBtn.addEventListener('click', () => state.rendition && state.rendition.prev());
  els.reader.nextBtn.addEventListener('click', () => state.rendition && state.rendition.next());
  
  // Progress slider
  els.reader.progress.addEventListener('change', (e) => {
    if (state.currentBook && state.rendition) {
      const percentage = e.target.value / 100;
      const cfi = state.currentBook.locations.cfiFromPercentage(percentage);
      if (cfi) state.rendition.display(cfi);
    }
  });

  // UI Toggles
  let uiVisible = true;
  els.reader.area.addEventListener('click', () => {
    uiVisible = !uiVisible;
    els.reader.header.classList.toggle('show', uiVisible);
    els.reader.footer.classList.toggle('show', uiVisible);
  });
  
  // Start with UI visible
  els.reader.header.classList.add('show');
  els.reader.footer.classList.add('show');

  // Sidebar toggles
  els.reader.tocBtn.addEventListener('click', () => openSidebar('toc'));
  els.reader.bookmarkBtn.addEventListener('click', toggleBookmark);
  els.reader.searchBtn.addEventListener('click', () => openSidebar('search'));
  els.reader.annotationsBtn.addEventListener('click', () => openSidebar('annotations'));
  els.sidebars.searchGo.addEventListener('click', executeBookSearch);
  els.sidebars.searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeBookSearch();
  });
  els.reader.settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    els.settings.panel.classList.toggle('show');
  });
  
  document.querySelectorAll('.sidebar-close').forEach(btn => {
    btn.addEventListener('click', closeSidebars);
  });
  els.sidebars.overlay.addEventListener('click', closeSidebars);

  // Settings Events
  els.settings.fontDec.addEventListener('click', () => changeFontSize(-10));
  els.settings.fontInc.addEventListener('click', () => changeFontSize(10));
  
  els.settings.fontOpts.forEach(opt => {
    opt.addEventListener('click', (e) => changeFontFamily(e.target.dataset.font));
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
      } else {
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
  
  // Keyboard Navigation (only library search and Escape on parent document)
  document.addEventListener('keydown', (e) => {
    if (!state.rendition && e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      els.library.searchInput.focus();
      return;
    }

    if (e.key === 'Escape') {
      closeSidebars();
      els.settings.panel.classList.remove('show');
    }
  });

  // Modals
  els.modals.bookInfoClose.addEventListener('click', () => {
    els.modals.bookInfo.classList.remove('show');
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
    
    let coverHtml = '';
    if (book.coverUrl) {
      coverHtml = `<img src="${book.coverUrl}" class="book-cover" alt="Cover of ${book.title}" loading="lazy">`;
    } else {
      coverHtml = `<div class="book-cover-placeholder">${book.title.substring(0, 2).toUpperCase()}</div>`;
    }
    
    card.innerHTML = `
      <div class="book-cover-wrapper">
        ${coverHtml}
        <div class="book-actions">
          <button class="book-action-btn btn-info" title="Info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="book-info">
        <div class="book-title" title="${book.title}">${book.title}</div>
        <div class="book-author">${book.author}</div>
      </div>
    `;
    
    // Read on click
    card.addEventListener('click', (e) => {
      if (e.target.closest('.book-action-btn')) return;
      openBook(book.id);
    });
    
    // Info button
    const infoBtn = card.querySelector('.btn-info');
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
  const coverHtml = book.coverUrl 
    ? `<img src="${book.coverUrl}" class="book-info-cover" alt="Cover">`
    : `<div class="book-info-cover" style="height: 150px; background: #ddd; display: flex; align-items:center; justify-content:center;">No Cover</div>`;
    
  const bgStyle = book.coverUrl ? `background-image: url(${book.coverUrl})` : 'background-color: var(--accent-color)';

  const dateAdded = new Date(book.addedAt).toLocaleDateString();

  els.modals.bookInfoContent.innerHTML = `
    <div class="book-info-header">
      <div class="book-info-bg" style="${bgStyle}"></div>
      <div class="book-info-header-content">
        ${coverHtml}
        <div class="book-info-titles">
          <h2>${book.title}</h2>
          <p>${book.author}</p>
        </div>
      </div>
    </div>
    <div class="book-info-details">
      <div class="book-metadata">
        <div class="meta-item">
          <span class="meta-label">Added</span>
          <span class="meta-value">${dateAdded}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Format</span>
          <span class="meta-value">EPUB</span>
        </div>
      </div>
      ${book.description ? `<div class="book-description">${book.description}</div>` : ''}
    </div>
    <div class="book-info-actions">
      <button class="read-btn" id="modal-read-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
        </svg>
        Read Now
      </button>
      <button class="delete-btn" id="modal-delete-btn" title="Remove Book">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/>
        </svg>
      </button>
    </div>
  `;
  
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
    });
    
    // Setup Styling
    setupRenditionTheme();

    state.annotations = await localforage.getItem(`book_annotations_${id}`) || [];
    restoreAnnotations();
    state.bookmarks = await localforage.getItem(`book_bookmarks_${id}`) || [];
    renderBookmarks();
    
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

    state.rendition.on('relocated', () => {
      const iframe = els.reader.area.querySelector('iframe');
      if (!iframe || iframe.dataset.navListener) return;
      iframe.dataset.navListener = '1';
      iframe.contentWindow.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); state.rendition.prev(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); state.rendition.next(); }
      });
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
  if (state.rendition) {
    state.rendition.destroy();
    state.currentBook.destroy();
    state.rendition = null;
    state.currentBook = null;
    state.currentBookId = null;
    state.annotations = [];
    state.bookmarks = [];
  }
  
  els.views.reader.classList.remove('active');
  els.views.library.classList.add('active');
  closeSidebars();
}

async function handleRelocated(location) {
  if (!state.currentBook) return;
  
  // Update progress
  const percent = state.currentBook.locations.percentageFromCfi(location.start.cfi);
  const percentageStr = Math.round(percent * 100);
  
  els.reader.progress.value = percentageStr;
  els.reader.percent.textContent = `${percentageStr}%`;
  
  // Page number estimation
  const totalPages = state.currentBook.locations.total;
  const currentPage = Math.round(percent * totalPages) || 1;
  els.reader.location.textContent = `Page ${currentPage} / ${totalPages}`;
  
  // Update bookmark button active status
  updateBookmarkIconState();

  // Save location
  const bookInfo = state.books.find(b => b.title === els.reader.title.textContent);
  if (bookInfo) {
    await localforage.setItem(`last_location_${bookInfo.id}`, location.start.cfi);
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
    showToast('Bookmark removed');
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
    showToast('Bookmark added');
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
  showToast('Bookmark removed');
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
      container.innerHTML = `<p class="empty-sidebar">No results for "${query}"</p>`;
      return;
    }

    container.innerHTML = '';
    flatResults.forEach(res => {
      const div = document.createElement('div');
      div.className = 'search-result-item';

      const excerpt = document.createElement('div');
      excerpt.className = 'search-result-excerpt';
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      excerpt.innerHTML = res.excerpt.replace(regex, '<mark>$1</mark>');

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
  }
}

function changeFontSize(delta) {
  state.fontSize = Math.max(50, Math.min(300, state.fontSize + delta));
  els.settings.fontVal.textContent = `${state.fontSize}%`;
  localStorage.setItem('bookhaven-fontsize', state.fontSize);

  if (state.rendition) {
    setupRenditionTheme();
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

  requestAnimationFrame(() => reRenderAnnotations());
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
  
  target.classList.add('open');
  els.sidebars.overlay.classList.add('show');
}

function closeSidebars() {
  els.sidebars.toc.classList.remove('open');
  els.sidebars.bookmarks.classList.remove('open');
  els.sidebars.search.classList.remove('open');
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
}

function reRenderAnnotations() {
  if (!state.rendition) return;
  state.annotations.filter(a => a.type === 'underline').forEach(a => {
    state.rendition.annotations.remove(a.cfiRange, 'underline');
  });
  state.annotations.filter(a => a.type === 'underline').forEach(drawAnnotation);
}

function showLoading(text = 'Loading...') {
  els.modals.loadingText.textContent = text;
  els.modals.loading.classList.add('active');
}

function hideLoading() {
  els.modals.loading.classList.remove('active');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
    ${message}
  `;
  
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
      { fill: annotation.color, 'fill-opacity': annotation.type === 'note' ? '0.42' : '0.55' }
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
  const annotation = {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    cfiRange,
    text: selectedText(),
    color,
    note,
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
  showToast('Highlight saved');
}

async function addUnderline() {
  await addAnnotation('underline', '#dc2626');
  showToast('Underline saved');
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
  showToast('Annotation removed');
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
  showToast('Annotation removed');
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
  showToast('Note saved');
}
