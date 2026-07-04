// popup.js — Search Anywhere Extension
// Compact popup: site list with category tabs and toggle controls

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

let sites = [];
let activeCategory = 'All';

// Load sites from chrome.storage.sync
function loadSites() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('sites', (data) => {
      resolve(Array.isArray(data.sites) ? data.sites : []);
    });
  });
}

// Persist sites (triggers background.js to rebuild context menus)
function saveSites() {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ sites }, resolve);
  });
}

// Extract hostname from a search URL
function getDomain(url) {
  try {
    return new URL(url.replace('%s', 'x')).hostname;
  } catch(e) {
    return null;
  }
}

// Google Favicon API
function getFaviconUrl(url) {
  const domain = getDomain(url);
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : null;
}

// Get sorted unique categories from sites
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

// Get sites for the active category tab
function getFilteredSites() {
  return activeCategory === 'All' ? sites : sites.filter((s) => s.category === activeCategory);
}

// Render category tabs
function renderTabs() {
  const container = document.getElementById('popup-tabs');
  container.innerHTML = '';

  const makeTab = (cat) => {
    const iconCls = cat === 'All'
      ? 'fa-solid fa-magnifying-glass'
      : (CATEGORY_ICONS[cat] || 'fa-solid fa-folder');
    const btn = document.createElement('button');
    btn.className = 'popup-tab' + (activeCategory === cat ? ' active' : '');
    btn.innerHTML = `<i class="${iconCls}"></i> ${cat}`;
    btn.addEventListener('click', () => {
      activeCategory = cat;
      render();
    });
    return btn;
  };

  container.appendChild(makeTab('All'));
  getCategories().forEach((c) => container.appendChild(makeTab(c)));
}

// Render sites list
function renderList() {
  const list = document.getElementById('popup-list');
  list.innerHTML = '';

  const filtered = getFilteredSites();

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'popup-empty';
    empty.textContent = 'No sites in this category';
    list.appendChild(empty);
    return;
  }

  filtered.forEach((site) => {
    const faviconUrl = getFaviconUrl(site.url);
    const initials = site.name.slice(0, 2).toUpperCase();

    const item = document.createElement('div');
    item.className = 'popup-item' + (site.enabled ? '' : ' disabled-item');

    // Icon (favicon or initials fallback)
    const iconWrap = document.createElement('div');
    iconWrap.className = 'popup-item-icon';

    if (faviconUrl) {
      const img = document.createElement('img');
      img.src = faviconUrl;
      img.alt = site.name;
      img.className = 'popup-item-favicon';
      img.loading = 'lazy';

      const fallback = document.createElement('div');
      fallback.className = 'popup-item-initials';
      fallback.textContent = initials;
      fallback.style.display = 'none';

      img.addEventListener('error', () => {
        img.style.display = 'none';
        fallback.style.display = 'flex';
      });

      iconWrap.appendChild(img);
      iconWrap.appendChild(fallback);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'popup-item-initials';
      fallback.textContent = initials;
      iconWrap.appendChild(fallback);
    }

    // Name
    const nameEl = document.createElement('span');
    nameEl.className = 'popup-item-name';
    nameEl.textContent = site.name;
    nameEl.title = site.url;

    // Toggle
    const label = document.createElement('label');
    label.className = 'toggle';
    label.title = site.enabled ? 'Disable' : 'Enable';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'toggle-input';
    input.checked = site.enabled;

    input.addEventListener('change', async () => {
      site.enabled = input.checked;
      item.classList.toggle('disabled-item', !site.enabled);
      label.title = site.enabled ? 'Disable' : 'Enable';
      await saveSites();
      // Background.js listens to storage.onChanged → rebuilds context menus automatically
    });

    const slider = document.createElement('span');
    slider.className = 'toggle-slider';

    label.appendChild(input);
    label.appendChild(slider);

    item.appendChild(iconWrap);
    item.appendChild(nameEl);
    item.appendChild(label);
    list.appendChild(item);
  });
}

function render() {
  renderTabs();
  renderList();
}

async function init() {
  sites = await loadSites();
  render();

  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('full-settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Hide logo if icon not found
  const logo = document.getElementById('popup-logo');
  if (logo) {
    logo.addEventListener('error', () => { logo.style.display = 'none'; });
  }
}

init();
