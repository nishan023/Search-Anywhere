// options.js — Search Anywhere Extension
// Full options page logic: render, add, edit, delete, toggle, drag-drop, import/export

// Storage shim
// When the page is opened outside a Chrome extension (e.g. via Live Server),
// chrome.storage is unavailable. We fall back to localStorage so every button
// still works during development.

const DEFAULT_SITES_SHIM = [
  { id: 'google',        name: 'Google',          category: 'General',     url: 'https://www.google.com/search?q=%s',                       enabled: true },
  { id: 'duckduckgo',    name: 'DuckDuckGo',      category: 'General',     url: 'https://duckduckgo.com/?q=%s',                             enabled: true },
  { id: 'wikipedia',     name: 'Wikipedia',        category: 'General',     url: 'https://en.wikipedia.org/wiki/Special:Search?search=%s',   enabled: true },
  { id: 'imdb',          name: 'IMDb',             category: 'Movies',      url: 'https://www.imdb.com/find?q=%s',                           enabled: true },
  { id: 'tmdb',          name: 'TMDb',             category: 'Movies',      url: 'https://www.themoviedb.org/search?query=%s',               enabled: true },
  { id: 'rottentomatoes',name: 'Rotten Tomatoes',  category: 'Movies',      url: 'https://www.rottentomatoes.com/search?search=%s',          enabled: true },
  { id: 'letterboxd',    name: 'Letterboxd',       category: 'Movies',      url: 'https://letterboxd.com/search/%s/',                        enabled: true },
  { id: 'moviebox',      name: 'MovieBox',         category: 'Movies',      url: 'https://moviebox.ph/web/searchResult?keyword=%s',          enabled: true },
  { id: 'hdhub4u',       name: 'HDHub4u',          category: 'Movies',      url: 'https://new2.hdhub4u.cl/search.html?q=%s',                 enabled: true },
  { id: 'youtube',       name: 'YouTube',          category: 'Video',       url: 'https://www.youtube.com/results?search_query=%s',          enabled: true },
  { id: 'amazon',        name: 'Amazon',           category: 'Shopping',    url: 'https://www.amazon.com/s?k=%s',                            enabled: true },
  { id: 'ebay',          name: 'eBay',             category: 'Shopping',    url: 'https://www.ebay.com/sch/i.html?_nkw=%s',                  enabled: true },
  { id: 'github',        name: 'GitHub',           category: 'Programming', url: 'https://github.com/search?q=%s',                          enabled: true },
  { id: 'stackoverflow', name: 'Stack Overflow',   category: 'Programming', url: 'https://stackoverflow.com/search?q=%s',                   enabled: true },
  { id: 'npm',           name: 'npm',              category: 'Programming', url: 'https://www.npmjs.com/search?q=%s',                       enabled: true },
  { id: 'mdn',           name: 'MDN',              category: 'Programming', url: 'https://developer.mozilla.org/en-US/search?q=%s',         enabled: true },
  { id: 'reddit',        name: 'Reddit',           category: 'Social',      url: 'https://www.reddit.com/search/?q=%s',                     enabled: true },
  { id: 'twitter',       name: 'X (Twitter)',      category: 'Social',      url: 'https://twitter.com/search?q=%s',                         enabled: true },
  { id: 'chatgpt',       name: 'ChatGPT',          category: 'AI',          url: 'https://chatgpt.com/?q=%s',                               enabled: true },
  { id: 'gemini',        name: 'Gemini',           category: 'AI',          url: 'https://gemini.google.com/app?q=%s',                      enabled: true },
  { id: 'claude',        name: 'Claude',           category: 'AI',          url: 'https://claude.ai/new?q=%s',                              enabled: true },
];

const IS_EXTENSION = (
  typeof chrome !== 'undefined' &&
  typeof chrome.storage !== 'undefined' &&
  typeof chrome.storage.sync !== 'undefined'
);

const storageShim = {
  get(key) {
    return new Promise((resolve) => {
      if (IS_EXTENSION) {
        chrome.storage.sync.get(key, resolve);
      } else {
        // localStorage fallback for development / Live Server
        try {
          const raw = localStorage.getItem(key);
          resolve(raw ? { [key]: JSON.parse(raw) } : {});
        } catch {
          resolve({});
        }
      }
    });
  },
  set(key, value) {
    return new Promise((resolve) => {
      if (IS_EXTENSION) {
        chrome.storage.sync.set({ [key]: value }, resolve);
      } else {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
        resolve();
      }
    });
  },
};

// Constants

const CATEGORY_ORDER = ['General', 'Movies', 'Video', 'Shopping', 'Programming', 'Social', 'AI'];

const CATEGORY_ICONS = {
  General:     'fa-solid fa-globe',
  Movies:      'fa-solid fa-film',
  Video:       'fa-solid fa-play',
  Shopping:    'fa-solid fa-bag-shopping',
  Programming: 'fa-solid fa-code',
  Social:      'fa-solid fa-comments',
  AI:          'fa-solid fa-robot',
};

// Gradient pairs per category for card avatars
const CATEGORY_GRADIENTS = {
  General:     ['#4f46e5', '#818cf8'],
  Movies:      ['#be185d', '#f472b6'],
  Video:       ['#dc2626', '#fb923c'],
  Shopping:    ['#b45309', '#fbbf24'],
  Programming: ['#047857', '#34d399'],
  Social:      ['#0369a1', '#38bdf8'],
  AI:          ['#7c3aed', '#c084fc'],
};

// State

let sites = [];
let activeCategory = 'All';
let editingId = null;
let deletingId = null;
let dragSrcId = null;

// Storage

async function loadSites() {
  const data = await storageShim.get('sites');
  return data.sites || DEFAULT_SITES_SHIM;
}

async function saveSites() {
  await storageShim.set('sites', sites);
}

// Helpers

function generateId() {
  return 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function truncate(str, max = 52) {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

function getCategories() {
  const cats = [...new Set(sites.map((s) => s.category))];
  return cats.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function getFilteredSites() {
  if (activeCategory === 'All') return sites;
  return sites.filter((s) => s.category === activeCategory);
}

function getCardGradient(category) {
  const g = CATEGORY_GRADIENTS[category] || ['#7c3aed', '#06b6d4'];
  return `linear-gradient(135deg, ${g[0]}, ${g[1]})`;
}

// Extract hostname from a search URL (replaces %s before parsing)
function getDomain(url) {
  try {
    return new URL(url.replace('%s', 'x')).hostname;
  } catch {
    return null;
  }
}

// Google Favicon API — returns 32px favicon for any domain
function getFaviconUrl(url) {
  const domain = getDomain(url);
  return domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
    : null;
}

// Render: tabs

function renderTabs() {
  const container = document.getElementById('category-tabs');
  const cats = getCategories();
  const enabledCount = (cat) =>
    cat === 'All'
      ? sites.filter((s) => s.enabled).length
      : sites.filter((s) => s.category === cat && s.enabled).length;

  const tabHtml = (cat, label) => {
    const iconCls = cat === 'All' ? 'fa-solid fa-magnifying-glass' : (CATEGORY_ICONS[cat] || 'fa-solid fa-folder');
    return `
    <button class="tab ${activeCategory === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">
      <i class="${iconCls}"></i> ${escapeHtml(label)}
      <span class="tab-count">${enabledCount(cat)}</span>
    </button>`;
  };

  container.innerHTML =
    tabHtml('All', 'All') + cats.map((c) => tabHtml(c, c)).join('');

  container.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeCategory = tab.dataset.cat;
      render();
    });
  });
}

// Render: cards

function renderCards() {
  const grid = document.getElementById('sites-grid');
  const empty = document.getElementById('empty-state');
  const filtered = getFilteredSites();

  if (filtered.length === 0) {
    grid.innerHTML = '';
    grid.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }

  grid.style.display = 'grid';
  empty.style.display = 'none';

  grid.innerHTML = filtered
    .map((site) => {
      const faviconUrl = getFaviconUrl(site.url);
      const initials   = escapeHtml(site.name.slice(0, 2).toUpperCase());
      const iconCls    = CATEGORY_ICONS[site.category] || 'fa-solid fa-folder';
      const avatarHtml = faviconUrl
        ? `<img src="${faviconUrl}" alt="${escapeHtml(site.name)}" class="site-favicon"
                loading="lazy"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <span class="site-initials" style="display:none">${initials}</span>`
        : `<span class="site-initials">${initials}</span>`;

      return `
    <div class="site-card ${site.enabled ? '' : 'disabled'}"
         data-id="${escapeHtml(site.id)}"
         draggable="true"
         title="${escapeHtml(site.name)}">
      <div class="site-card-drag" aria-hidden="true"><i class="fa-solid fa-grip-vertical"></i></div>
      <div class="site-card-icon" aria-hidden="true">
        ${avatarHtml}
      </div>
      <div class="site-card-info">
        <div class="site-card-name">${escapeHtml(site.name)}</div>
        <div class="site-card-url">${escapeHtml(truncate(site.url))}</div>
        <span class="site-card-category">
          <i class="${iconCls}"></i> ${escapeHtml(site.category)}
        </span>
      </div>
      <div class="site-card-actions">
        <label class="toggle" title="${site.enabled ? 'Disable site' : 'Enable site'}">
          <input type="checkbox" class="toggle-input" data-id="${escapeHtml(site.id)}"
            ${site.enabled ? 'checked' : ''} aria-label="Toggle ${escapeHtml(site.name)}">
          <span class="toggle-slider"></span>
        </label>
        <button class="icon-btn edit-btn" data-id="${escapeHtml(site.id)}" title="Edit ${escapeHtml(site.name)}">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="icon-btn delete-btn" data-id="${escapeHtml(site.id)}" title="Delete ${escapeHtml(site.name)}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>`;
    })
    .join('');

  // Event listeners on cards
  grid.querySelectorAll('.toggle-input').forEach((input) => {
    input.addEventListener('change', async () => {
      const site = sites.find((s) => s.id === input.dataset.id);
      if (!site) return;
      site.enabled = input.checked;
      await saveSites();
      render();
      showToast(`${site.name} ${site.enabled ? 'enabled' : 'disabled'}`);
    });
  });

  grid.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => openModal(btn.dataset.id));
  });

  grid.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id));
  });

  setupDragDrop(grid);
}

// Main render

function render() {
  renderTabs();
  renderCards();
  updateCategoryDatalist();
}

// Drag-and-drop

function setupDragDrop(grid) {
  const cards = grid.querySelectorAll('.site-card');

  cards.forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      dragSrcId = card.dataset.id;
      setTimeout(() => card.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      grid.querySelectorAll('.drag-over').forEach((c) => c.classList.remove('drag-over'));
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (card.dataset.id !== dragSrcId) {
        grid.querySelectorAll('.drag-over').forEach((c) => c.classList.remove('drag-over'));
        card.classList.add('drag-over');
      }
    });

    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));

    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (!dragSrcId || dragSrcId === card.dataset.id) return;

      const srcIdx = sites.findIndex((s) => s.id === dragSrcId);
      const dstIdx = sites.findIndex((s) => s.id === card.dataset.id);
      if (srcIdx === -1 || dstIdx === -1) return;

      const [moved] = sites.splice(srcIdx, 1);
      sites.splice(dstIdx, 0, moved);
      await saveSites();
      render();
    });
  });
}

// Delete

function confirmDelete(id) {
  const site = sites.find((s) => s.id === id);
  if (!site) return;
  deletingId = id;
  document.getElementById('confirm-modal-text').textContent = `Are you sure you want to delete "${site.name}"?`;
  document.getElementById('confirm-modal-overlay').classList.add('open');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal-overlay').classList.remove('open');
  deletingId = null;
}

async function executeDelete() {
  if (!deletingId) return;
  const site = sites.find((s) => s.id === deletingId);
  if (!site) return;
  sites = sites.filter((s) => s.id !== deletingId);
  await saveSites();
  closeConfirmModal();
  render();
  showToast(`${site.name} deleted`);
}

// Modal

function openModal(id = null) {
  editingId = id;
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const nameInput = document.getElementById('form-name');
  const catInput = document.getElementById('form-category');
  const urlInput = document.getElementById('form-url');

  if (id) {
    const site = sites.find((s) => s.id === id);
    if (!site) return;
    title.textContent = 'Edit Site';
    nameInput.value = site.name;
    catInput.value = site.category;
    urlInput.value = site.url;
  } else {
    title.textContent = 'Add Site';
    nameInput.value = '';
    catInput.value = activeCategory !== 'All' ? activeCategory : '';
    urlInput.value = '';
  }

  updateUrlPreview();
  overlay.classList.add('open');
  // Delay focus to avoid animation jank
  setTimeout(() => nameInput.focus(), 80);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  editingId = null;
}

function updateUrlPreview() {
  const url = document.getElementById('form-url').value.trim();
  const el = document.getElementById('preview-url-text');

  if (!url) {
    el.textContent = '—';
    el.style.color = '';
    return;
  }
  if (url.includes('%s')) {
    el.textContent = url.replace('%s', 'example+query');
    el.style.color = 'var(--success)';
  } else {
    el.textContent = url + '  ⚠ no %s placeholder';
    el.style.color = 'var(--warning)';
  }
}

async function saveModalSite() {
  const name = document.getElementById('form-name').value.trim();
  const category = document.getElementById('form-category').value.trim();
  const url = document.getElementById('form-url').value.trim();

  if (!name) { showToast('Name is required', 'error'); return; }
  if (!category) { showToast('Category is required', 'error'); return; }
  if (!url) { showToast('URL is required', 'error'); return; }

  if (!url.includes('%s')) {
    const ok = confirm('The URL has no %s placeholder — the selected text won\'t be included. Save anyway?');
    if (!ok) return;
  }

  if (editingId) {
    const site = sites.find((s) => s.id === editingId);
    if (site) { site.name = name; site.category = category; site.url = url; }
    showToast(`${name} updated ✓`, 'success');
  } else {
    sites.push({ id: generateId(), name, category, url, enabled: true });
    showToast(`${name} added ✓`, 'success');
  }

  await saveSites();
  closeModal();
  // Switch to the saved category tab
  activeCategory = category;
  render();
}

// Category datalist

function updateCategoryDatalist() {
  const dl = document.getElementById('categories-datalist');
  if (!dl) return;
  dl.innerHTML = getCategories()
    .map((c) => `<option value="${escapeHtml(c)}">`)
    .join('');
}

// Export / Import

function exportSites() {
  const json = JSON.stringify(sites, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'search-anywhere-sites.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Sites exported ✓');
}

function triggerImport() {
  document.getElementById('import-file').click();
}

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = ''; // reset so same file can be re-imported

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('Top-level value must be an array');

    const validated = parsed.map((raw, i) => {
      if (typeof raw.name !== 'string' || !raw.name.trim())
        throw new Error(`Site #${i + 1} is missing a name`);
      if (typeof raw.url !== 'string' || !raw.url.trim())
        throw new Error(`Site #${i + 1} is missing a url`);
      if (typeof raw.category !== 'string' || !raw.category.trim())
        throw new Error(`Site #${i + 1} is missing a category`);
      return {
        id: raw.id || generateId(),
        name: raw.name.trim(),
        category: raw.category.trim(),
        url: raw.url.trim(),
        enabled: raw.enabled !== false,
      };
    });

    const replace = confirm(
      `Import ${validated.length} site(s)?\n\nThis will REPLACE your current list.\nExport first if you want to keep your current sites.`
    );
    if (!replace) return;

    sites = validated;
    await saveSites();
    activeCategory = 'All';
    render();
    showToast(`Imported ${validated.length} site(s) ✓`);
  } catch (err) {
    showToast('Import failed: ' + err.message, 'error');
  }
}

// Toast

let toastTimer = null;

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3200);
}

// Logo fallback

function initLogoFallback() {
  const img = document.getElementById('logo-img');
  if (!img) return;
  img.addEventListener('error', () => {
    const fallback = document.createElement('div');
    fallback.className = 'logo-fallback';
    fallback.textContent = '🔍';
    img.replaceWith(fallback);
  });
}

// Keyboard shortcuts

document.addEventListener('keydown', (e) => {
  const modalOpen = document.getElementById('modal-overlay').classList.contains('open');
  const confirmOpen = document.getElementById('confirm-modal-overlay').classList.contains('open');

  if (e.key === 'Escape') {
    if (modalOpen) { closeModal(); return; }
    if (confirmOpen) { closeConfirmModal(); return; }
  }
  if (e.key === 'Enter' && modalOpen && e.target.id !== 'modal-cancel') {
    e.preventDefault();
    saveModalSite();
    return;
  }
  // Ctrl/Cmd + N → add site
  if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !modalOpen) {
    e.preventDefault();
    openModal();
  }
});

// Init

async function init() {
  sites = await loadSites();
  render();
  initLogoFallback();

  // Header
  document.getElementById('add-btn').addEventListener('click', () => openModal());
  document.getElementById('export-btn').addEventListener('click', exportSites);
  document.getElementById('import-btn').addEventListener('click', triggerImport);

  // Empty state
  document.getElementById('empty-add-btn').addEventListener('click', () => openModal());

  // Modal
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveModalSite);

  // Confirm Delete Modal
  document.getElementById('confirm-modal-close').addEventListener('click', closeConfirmModal);
  document.getElementById('confirm-modal-cancel').addEventListener('click', closeConfirmModal);
  document.getElementById('confirm-modal-confirm').addEventListener('click', executeDelete);

  // Close modals on overlay click
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  document.getElementById('confirm-modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('confirm-modal-overlay')) closeConfirmModal();
  });

  // Live URL preview
  document.getElementById('form-url').addEventListener('input', updateUrlPreview);

  // File import
  document.getElementById('import-file').addEventListener('change', handleImport);
}

init();
