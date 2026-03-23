// ========== State ==========
let allFonts = [];
let filteredFonts = [];
let selectedFont = null;
let favorites = new Set(JSON.parse(localStorage.getItem('fontViewerFavorites') || '[]'));
let activeFilters = new Set();
let catalogFilters = new Set();
let catalogFilteredFonts = [];
let expandedCatalogIndex = -1;
let expandedCatalogHeight = 0;
let focusedIndex = -1;
let currentView = 'detail';

// ========== DOM ==========
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const fontCount = document.getElementById('fontCount');
const fontListContainer = document.getElementById('fontListContainer');
const fontListInner = document.getElementById('fontListInner');
const loading = document.getElementById('loading');
const emptyState = document.getElementById('emptyState');
const previewContent = document.getElementById('previewContent');
const selectedFontName = document.getElementById('selectedFontName');
const previewText = document.getElementById('previewText');
const fontSize = document.getElementById('fontSize');
const fontSizeValue = document.getElementById('fontSizeValue');
const customPreview = document.getElementById('customPreview');
const favoriteBtn = document.getElementById('favoriteBtn');
const copyBtn = document.getElementById('copyBtn');
const themeToggle = document.getElementById('themeToggle');
const sidebar = document.getElementById('sidebar');
const resizeHandle = document.getElementById('resizeHandle');

// ========== Catalog DOM ==========
const catalogView = document.getElementById('catalogView');
const catalogSearchInput = document.getElementById('catalogSearchInput');
const catalogSearchClear = document.getElementById('catalogSearchClear');
const catalogText = document.getElementById('catalogText');
const catalogFontSize = document.getElementById('catalogFontSize');
const catalogFontSizeValue = document.getElementById('catalogFontSizeValue');
const catalogFontCount = document.getElementById('catalogFontCount');
const catalogListContainer = document.getElementById('catalogListContainer');
const catalogListInner = document.getElementById('catalogListInner');
const previewPanel = document.getElementById('previewPanel');

// ========== Constants ==========
const ITEM_HEIGHT = 68;
const CATALOG_ITEM_HEIGHT = 88;
const BUFFER = 8;

// ========== Theme ==========
function initTheme() {
  const saved = localStorage.getItem('fontViewerTheme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('fontViewerTheme', next);
});

initTheme();

// ========== Font Detection ==========
const detectionCanvas = document.createElement('canvas');
const detectionCtx = detectionCanvas.getContext('2d');

function supportsJapanese(fontFamily) {
  const testText = 'あ漢';
  detectionCtx.font = `24px "${fontFamily}"`;
  const testWidth = detectionCtx.measureText(testText).width;
  detectionCtx.font = '24px sans-serif';
  const fallbackWidth = detectionCtx.measureText(testText).width;
  return Math.abs(testWidth - fallbackWidth) > 1;
}

function isMonospace(fontFamily) {
  detectionCtx.font = `24px "${fontFamily}"`;
  const iWidth = detectionCtx.measureText('i').width;
  const mWidth = detectionCtx.measureText('m').width;
  return Math.abs(iWidth - mWidth) < 1;
}

// ========== Font Loading ==========
async function loadFonts() {
  loading.classList.add('visible');

  try {
    const rawFonts = await window.electronAPI.getFonts();
    allFonts = rawFonts.map(font => ({
      name: font.name,
      localizedName: font.localizedName || '',
      displayName: font.localizedName || font.name,
      supportsJapanese: null,
      isMonospace: null
    }));
    applyFilters();
  } catch (err) {
    console.error('Error loading fonts:', err);
    showToast('フォントの読み込みに失敗しました');
  } finally {
    loading.classList.remove('visible');
  }
}

function debounce(fn, delayMs = 120) {
  let timerId = null;
  return (...args) => {
    if (timerId) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => fn(...args), delayMs);
  };
}

function ensureFontClassification(font, { needsJapanese, needsMonospace }) {
  if (needsJapanese && font.supportsJapanese === null) {
    font.supportsJapanese = supportsJapanese(font.name);
  }
  if (needsMonospace && font.isMonospace === null) {
    font.isMonospace = isMonospace(font.name);
  }
}

const applyFiltersDebounced = debounce(applyFilters);
const applyCatalogFiltersDebounced = debounce(applyCatalogFilters);

// ========== Filters ==========
document.querySelectorAll('.filter-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    const filter = pill.dataset.filter;
    if (activeFilters.has(filter)) {
      activeFilters.delete(filter);
      pill.classList.remove('active');
    } else {
      activeFilters.add(filter);
      pill.classList.add('active');
    }
    applyFilters();
  });
});

function applyFilters() {
  const search = searchInput.value.toLowerCase().trim();
  const needsJapanese = activeFilters.has('japanese');
  const needsMonospace = activeFilters.has('monospace') || activeFilters.has('proportional');

  filteredFonts = allFonts.filter(font => {
    if (search) {
      const matchName = font.name.toLowerCase().includes(search);
      const matchLocalized = font.localizedName.toLowerCase().includes(search);
      if (!matchName && !matchLocalized) return false;
    }

    ensureFontClassification(font, { needsJapanese, needsMonospace });

    if (activeFilters.has('favorites') && !favorites.has(font.name)) return false;
    if (activeFilters.has('japanese') && !font.supportsJapanese) return false;
    if (activeFilters.has('monospace') && !font.isMonospace) return false;
    if (activeFilters.has('proportional') && font.isMonospace) return false;
    return true;
  });

  fontCount.textContent = filteredFonts.length;
  focusedIndex = -1;
  renderVirtualList();
}

// ========== Search ==========
searchInput.addEventListener('input', () => {
  searchClear.classList.toggle('visible', searchInput.value.length > 0);
  applyFiltersDebounced();
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  searchInput.focus();
  applyFilters();
});

// ========== Virtual Scroll ==========
function renderVirtualList() {
  const scrollTop = fontListContainer.scrollTop;
  const viewHeight = fontListContainer.clientHeight;
  const totalHeight = filteredFonts.length * ITEM_HEIGHT;

  fontListInner.style.height = `${totalHeight}px`;

  const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER);
  const endIdx = Math.min(filteredFonts.length, Math.ceil((scrollTop + viewHeight) / ITEM_HEIGHT) + BUFFER);

  // Remove items outside range
  const existing = fontListInner.querySelectorAll('.font-item');
  existing.forEach(el => {
    const idx = parseInt(el.dataset.index);
    if (idx < startIdx || idx >= endIdx) {
      el.remove();
    }
  });

  // Track existing indices
  const existingIndices = new Set();
  fontListInner.querySelectorAll('.font-item').forEach(el => {
    existingIndices.add(parseInt(el.dataset.index));
  });

  // Add new items
  const text = previewText.value || 'Abc 123';
  for (let i = startIdx; i < endIdx; i++) {
    if (existingIndices.has(i)) continue;
    const font = filteredFonts[i];
    const el = createFontElement(font, i, text);
    fontListInner.appendChild(el);
  }
}

function createFontElement(font, index, text) {
  const el = document.createElement('div');
  el.className = 'font-item';
  if (selectedFont && selectedFont.name === font.name) el.classList.add('selected');
  if (index === focusedIndex) el.classList.add('focused');
  el.dataset.index = index;
  el.style.top = `${index * ITEM_HEIGHT}px`;

  const header = document.createElement('div');
  header.className = 'font-item-header';

  const name = document.createElement('span');
  name.className = 'font-item-name';
  // Show localized name with English name, or just the name
  if (font.localizedName) {
    name.textContent = font.localizedName;
    const engName = document.createElement('span');
    engName.className = 'font-item-eng';
    engName.textContent = font.name;
    header.appendChild(name);
    header.appendChild(engName);
  } else {
    name.textContent = font.name;
    header.appendChild(name);
  }

  if (favorites.has(font.name)) {
    const fav = document.createElement('span');
    fav.className = 'font-item-fav';
    fav.textContent = '\u2665';
    header.appendChild(fav);
  }

  const preview = document.createElement('div');
  preview.className = 'font-item-preview';
  preview.style.fontFamily = `"${font.name}", sans-serif`;
  preview.textContent = text;

  el.appendChild(header);
  el.appendChild(preview);

  el.addEventListener('click', () => selectFont(font, index));

  return el;
}

fontListContainer.addEventListener('scroll', () => {
  requestAnimationFrame(renderVirtualList);
});

// ========== Font Selection ==========
function selectFont(font, index) {
  selectedFont = font;
  if (index !== undefined) focusedIndex = index;

  emptyState.style.display = 'none';
  previewContent.style.display = 'block';

  // Show display name with English subtitle
  if (font.localizedName) {
    selectedFontName.innerHTML = '';
    selectedFontName.textContent = font.localizedName;
    const sub = document.createElement('span');
    sub.className = 'preview-font-eng';
    sub.textContent = font.name;
    selectedFontName.appendChild(sub);
  } else {
    selectedFontName.textContent = font.name;
  }

  updateFavoriteButton();
  updatePreview();
  renderVirtualList();

  // Scroll selected into view
  if (index !== undefined) {
    const itemTop = index * ITEM_HEIGHT;
    const containerHeight = fontListContainer.clientHeight;
    const scrollTop = fontListContainer.scrollTop;
    if (itemTop < scrollTop) {
      fontListContainer.scrollTop = itemTop;
    } else if (itemTop + ITEM_HEIGHT > scrollTop + containerHeight) {
      fontListContainer.scrollTop = itemTop + ITEM_HEIGHT - containerHeight;
    }
  }
}

// ========== Preview ==========
function updatePreview() {
  if (!selectedFont) return;

  const text = previewText.value || 'Sample Text サンプル';
  const size = fontSize.value;
  const fontFamily = `"${selectedFont.name}", sans-serif`;

  // Main preview
  customPreview.style.fontFamily = fontFamily;
  customPreview.style.fontSize = `${size}px`;
  customPreview.textContent = text;

  // Size samples
  const sizeSamples = document.getElementById('sizeSamples');
  sizeSamples.innerHTML = '';
  [12, 16, 20, 28, 36, 48].forEach(s => {
    const row = document.createElement('div');
    row.className = 'size-sample';

    const label = document.createElement('span');
    label.className = 'size-label';
    label.textContent = `${s}px`;

    const sampleText = document.createElement('span');
    sampleText.className = 'size-text';
    sampleText.style.fontFamily = fontFamily;
    sampleText.style.fontSize = `${s}px`;
    sampleText.textContent = text;

    row.appendChild(label);
    row.appendChild(sampleText);
    sizeSamples.appendChild(row);
  });

  // Style samples
  const styleSamples = document.getElementById('styleSamples');
  styleSamples.innerHTML = '';
  const styles = [
    { label: 'Light', weight: '300', style: 'normal' },
    { label: 'Regular', weight: '400', style: 'normal' },
    { label: 'Medium', weight: '500', style: 'normal' },
    { label: 'Bold', weight: '700', style: 'normal' },
    { label: 'Italic', weight: '400', style: 'italic' },
    { label: 'Bold Italic', weight: '700', style: 'italic' },
  ];
  styles.forEach(s => {
    const row = document.createElement('div');
    row.className = 'style-sample';

    const label = document.createElement('span');
    label.className = 'style-label';
    label.textContent = s.label;

    const sampleText = document.createElement('span');
    sampleText.className = 'style-text';
    sampleText.style.fontFamily = fontFamily;
    sampleText.style.fontWeight = s.weight;
    sampleText.style.fontStyle = s.style;
    sampleText.textContent = text;

    row.appendChild(label);
    row.appendChild(sampleText);
    styleSamples.appendChild(row);
  });

  // Charset samples
  const charsetSamples = document.getElementById('charsetSamples');
  charsetSamples.innerHTML = '';
  const charsets = [
    { label: 'Uppercase', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
    { label: 'Lowercase', text: 'abcdefghijklmnopqrstuvwxyz' },
    { label: 'Numbers', text: '0123456789' },
    { label: 'Symbols', text: '!@#$%^&*()_+-=[]{}|;:\'",.<>?/' },
    { label: 'Hiragana', text: 'あいうえおかきくけこさしすせそ' },
    { label: 'Katakana', text: 'アイウエオカキクケコサシスセソ' },
    { label: 'Kanji', text: '永遠東京花鳥風月山川海空' },
  ];
  charsets.forEach(c => {
    const row = document.createElement('div');
    row.className = 'charset-row';

    const label = document.createElement('div');
    label.className = 'charset-label';
    label.textContent = c.label;

    const charText = document.createElement('div');
    charText.className = 'charset-text';
    charText.style.fontFamily = fontFamily;
    charText.textContent = c.text;

    row.appendChild(label);
    row.appendChild(charText);
    charsetSamples.appendChild(row);
  });
}

previewText.addEventListener('input', () => {
  updatePreview();
  renderVirtualList();
});

fontSize.addEventListener('input', () => {
  fontSizeValue.textContent = `${fontSize.value}px`;
  updatePreview();
});

// ========== Favorites ==========
function saveFavorites() {
  localStorage.setItem('fontViewerFavorites', JSON.stringify([...favorites]));
}

function updateFavoriteButton() {
  if (!selectedFont) return;
  favoriteBtn.classList.toggle('favorited', favorites.has(selectedFont.name));
}

favoriteBtn.addEventListener('click', () => {
  if (!selectedFont) return;
  if (favorites.has(selectedFont.name)) {
    favorites.delete(selectedFont.name);
  } else {
    favorites.add(selectedFont.name);
  }
  saveFavorites();
  updateFavoriteButton();
  if (activeFilters.has('favorites')) {
    applyFilters();
  } else {
    renderVirtualList();
  }
});

// ========== Copy ==========
copyBtn.addEventListener('click', async () => {
  if (!selectedFont) return;
  try {
    await navigator.clipboard.writeText(selectedFont.name);
    copyBtn.classList.add('copied');
    const label = copyBtn.querySelector('.copy-label');
    const originalText = label.textContent;
    label.textContent = 'コピー済み';
    setTimeout(() => {
      copyBtn.classList.remove('copied');
      label.textContent = originalText;
    }, 1500);
  } catch (err) {
    showToast('コピーに失敗しました');
  }
});

// ========== Keyboard Navigation ==========
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target !== searchInput) return;

  if (e.target === searchInput && e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== 'Escape') {
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (focusedIndex < filteredFonts.length - 1) {
      focusedIndex++;
      selectFont(filteredFonts[focusedIndex], focusedIndex);
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (focusedIndex > 0) {
      focusedIndex--;
      selectFont(filteredFonts[focusedIndex], focusedIndex);
    }
  } else if (e.key === 'Escape') {
    searchInput.blur();
  }

  if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

// ========== Resize Handle ==========
let isResizing = false;

resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  resizeHandle.classList.add('active');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const newWidth = Math.min(500, Math.max(260, e.clientX));
  sidebar.style.width = `${newWidth}px`;
  renderVirtualList();
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    resizeHandle.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
});

// ========== Toast ==========
function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}

// ========== View Switching ==========
document.querySelectorAll('.view-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view;
    if (view === currentView) return;
    currentView = view;
    document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    updateViewVisibility();
  });
});

function updateViewVisibility() {
  if (currentView === 'detail') {
    sidebar.style.display = '';
    resizeHandle.style.display = '';
    previewPanel.style.display = '';
    catalogView.style.display = 'none';
  } else {
    sidebar.style.display = 'none';
    resizeHandle.style.display = 'none';
    previewPanel.style.display = 'none';
    catalogView.style.display = 'flex';
    applyCatalogFilters();
  }
}

// ========== Catalog Filters ==========
document.querySelectorAll('[data-catalog-filter]').forEach(pill => {
  pill.addEventListener('click', () => {
    const filter = pill.dataset.catalogFilter;
    if (catalogFilters.has(filter)) {
      catalogFilters.delete(filter);
      pill.classList.remove('active');
    } else {
      catalogFilters.add(filter);
      pill.classList.add('active');
    }
    applyCatalogFilters();
  });
});

catalogSearchInput.addEventListener('input', () => {
  catalogSearchClear.classList.toggle('visible', catalogSearchInput.value.length > 0);
  applyCatalogFiltersDebounced();
});

catalogSearchClear.addEventListener('click', () => {
  catalogSearchInput.value = '';
  catalogSearchClear.classList.remove('visible');
  catalogSearchInput.focus();
  applyCatalogFilters();
});

function applyCatalogFilters() {
  const search = catalogSearchInput.value.toLowerCase().trim();
  const needsJapanese = catalogFilters.has('japanese');
  const needsMonospace = catalogFilters.has('monospace') || catalogFilters.has('proportional');

  catalogFilteredFonts = allFonts.filter(font => {
    if (search) {
      const matchName = font.name.toLowerCase().includes(search);
      const matchLocalized = font.localizedName.toLowerCase().includes(search);
      if (!matchName && !matchLocalized) return false;
    }

    ensureFontClassification(font, { needsJapanese, needsMonospace });

    if (catalogFilters.has('favorites') && !favorites.has(font.name)) return false;
    if (catalogFilters.has('japanese') && !font.supportsJapanese) return false;
    if (catalogFilters.has('monospace') && !font.isMonospace) return false;
    if (catalogFilters.has('proportional') && font.isMonospace) return false;
    return true;
  });

  catalogFontCount.textContent = catalogFilteredFonts.length;
  expandedCatalogIndex = -1;
  catalogListInner.innerHTML = '';
  renderCatalogList();
}

// ========== Catalog Virtual Scroll ==========
function getCatalogItemTop(index) {
  if (expandedCatalogIndex < 0 || index <= expandedCatalogIndex) {
    return index * CATALOG_ITEM_HEIGHT;
  }
  return expandedCatalogIndex * CATALOG_ITEM_HEIGHT + expandedCatalogHeight + (index - expandedCatalogIndex - 1) * CATALOG_ITEM_HEIGHT;
}

function getCatalogTotalHeight() {
  const count = catalogFilteredFonts.length;
  if (expandedCatalogIndex < 0) return count * CATALOG_ITEM_HEIGHT;
  return (count - 1) * CATALOG_ITEM_HEIGHT + expandedCatalogHeight;
}

function getCatalogItemHeight(index) {
  return index === expandedCatalogIndex ? expandedCatalogHeight : CATALOG_ITEM_HEIGHT;
}

function findCatalogIndexAtScroll(scrollTop) {
  if (expandedCatalogIndex < 0) {
    return Math.floor(scrollTop / CATALOG_ITEM_HEIGHT);
  }
  const expTop = expandedCatalogIndex * CATALOG_ITEM_HEIGHT;
  if (scrollTop < expTop) {
    return Math.floor(scrollTop / CATALOG_ITEM_HEIGHT);
  }
  if (scrollTop < expTop + expandedCatalogHeight) {
    return expandedCatalogIndex;
  }
  return expandedCatalogIndex + 1 + Math.floor((scrollTop - expTop - expandedCatalogHeight) / CATALOG_ITEM_HEIGHT);
}

function renderCatalogList() {
  const scrollTop = catalogListContainer.scrollTop;
  const viewHeight = catalogListContainer.clientHeight;

  catalogListInner.style.height = `${getCatalogTotalHeight()}px`;

  const rawStart = findCatalogIndexAtScroll(scrollTop);
  const rawEnd = findCatalogIndexAtScroll(scrollTop + viewHeight);
  const startIdx = Math.max(0, rawStart - BUFFER);
  const endIdx = Math.min(catalogFilteredFonts.length, rawEnd + BUFFER + 1);

  const existing = catalogListInner.querySelectorAll('.catalog-item');
  existing.forEach(el => {
    const idx = parseInt(el.dataset.index);
    if (idx < startIdx || idx >= endIdx) el.remove();
  });

  const existingIndices = new Set();
  catalogListInner.querySelectorAll('.catalog-item').forEach(el => {
    existingIndices.add(parseInt(el.dataset.index));
  });

  const text = catalogText.value || 'あいうえお ABC abc 0123456789';
  const size = catalogFontSize.value;

  for (let i = startIdx; i < endIdx; i++) {
    if (existingIndices.has(i)) continue;
    const font = catalogFilteredFonts[i];
    const isExpanded = i === expandedCatalogIndex;

    const el = document.createElement('div');
    el.className = 'catalog-item' + (isExpanded ? ' expanded' : '');
    el.dataset.index = i;
    el.style.top = `${getCatalogItemTop(i)}px`;
    if (!isExpanded) {
      el.style.height = `${CATALOG_ITEM_HEIGHT}px`;
    }

    const headerEl = document.createElement('div');
    headerEl.className = 'catalog-item-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'catalog-item-header-left';

    const nameEl = document.createElement('div');
    nameEl.className = 'catalog-item-name';
    nameEl.textContent = font.localizedName ? `${font.localizedName} (${font.name})` : font.name;

    const sampleEl = document.createElement('div');
    sampleEl.className = 'catalog-item-sample';
    sampleEl.style.fontFamily = `"${font.name}", sans-serif`;
    sampleEl.style.fontSize = `${size}px`;
    sampleEl.textContent = text;

    headerLeft.appendChild(nameEl);
    headerLeft.appendChild(sampleEl);
    headerEl.appendChild(headerLeft);

    headerEl.addEventListener('click', () => {
      toggleCatalogExpand(i);
    });

    el.appendChild(headerEl);

    if (isExpanded) {
      el.appendChild(buildCatalogDetail(font, text));
    }

    catalogListInner.appendChild(el);
  }
}

function buildCatalogDetail(font, text) {
  const fontFamily = `"${font.name}", sans-serif`;
  const detail = document.createElement('div');
  detail.className = 'catalog-item-detail';

  // Size variations
  const sizeSection = document.createElement('div');
  sizeSection.className = 'catalog-detail-section';
  const sizeTitle = document.createElement('div');
  sizeTitle.className = 'catalog-detail-title';
  sizeTitle.textContent = 'サイズバリエーション';
  sizeSection.appendChild(sizeTitle);

  [12, 16, 20, 28, 36, 48].forEach(s => {
    const row = document.createElement('div');
    row.className = 'catalog-detail-row';
    const label = document.createElement('span');
    label.className = 'catalog-detail-label';
    label.textContent = `${s}px`;
    const sample = document.createElement('span');
    sample.className = 'catalog-detail-text';
    sample.style.fontFamily = fontFamily;
    sample.style.fontSize = `${s}px`;
    sample.textContent = text;
    row.appendChild(label);
    row.appendChild(sample);
    sizeSection.appendChild(row);
  });
  detail.appendChild(sizeSection);

  // Weight & Style
  const styleSection = document.createElement('div');
  styleSection.className = 'catalog-detail-section';
  const styleTitle = document.createElement('div');
  styleTitle.className = 'catalog-detail-title';
  styleTitle.textContent = 'ウェイト & スタイル';
  styleSection.appendChild(styleTitle);

  [
    { label: 'Light', weight: '300', style: 'normal' },
    { label: 'Regular', weight: '400', style: 'normal' },
    { label: 'Bold', weight: '700', style: 'normal' },
    { label: 'Italic', weight: '400', style: 'italic' },
  ].forEach(s => {
    const row = document.createElement('div');
    row.className = 'catalog-detail-row';
    const label = document.createElement('span');
    label.className = 'catalog-detail-label';
    label.textContent = s.label;
    const sample = document.createElement('span');
    sample.className = 'catalog-detail-text';
    sample.style.fontFamily = fontFamily;
    sample.style.fontWeight = s.weight;
    sample.style.fontStyle = s.style;
    sample.style.fontSize = '20px';
    sample.textContent = text;
    row.appendChild(label);
    row.appendChild(sample);
    styleSection.appendChild(row);
  });
  detail.appendChild(styleSection);

  return detail;
}

function toggleCatalogExpand(index) {
  catalogListInner.innerHTML = '';
  if (expandedCatalogIndex === index) {
    expandedCatalogIndex = -1;
    expandedCatalogHeight = 0;
    renderCatalogList();
  } else {
    expandedCatalogIndex = index;
    // First pass: render to measure expanded height
    expandedCatalogHeight = 600; // temporary
    renderCatalogList();
    // Measure actual height
    const expandedEl = catalogListInner.querySelector('.catalog-item.expanded');
    if (expandedEl) {
      expandedCatalogHeight = expandedEl.scrollHeight;
      // Re-render with correct height
      catalogListInner.innerHTML = '';
      renderCatalogList();
    }
  }
}

catalogListContainer.addEventListener('scroll', () => {
  requestAnimationFrame(renderCatalogList);
});

catalogText.addEventListener('input', () => {
  catalogListInner.innerHTML = '';
  renderCatalogList();
});

catalogFontSize.addEventListener('input', () => {
  catalogFontSizeValue.textContent = `${catalogFontSize.value}px`;
  catalogListInner.innerHTML = '';
  renderCatalogList();
});

// ========== Init ==========
window.addEventListener('DOMContentLoaded', () => {
  // Add platform class for CSS adjustments
  const platform = navigator.userAgent.includes('Windows') ? 'win'
    : navigator.userAgent.includes('Linux') ? 'linux' : 'mac';
  document.body.classList.add(`platform-${platform}`);

  loadFonts();
});
