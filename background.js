// background.js — Search Anywhere Extension
// Manages context menus and handles search actions

const DEFAULT_SITES = [
  // General
  { id: 'google', name: 'Google', category: 'General', url: 'https://www.google.com/search?q=%s', enabled: true },
  { id: 'duckduckgo', name: 'DuckDuckGo', category: 'General', url: 'https://duckduckgo.com/?q=%s', enabled: true },
  { id: 'wikipedia', name: 'Wikipedia', category: 'General', url: 'https://en.wikipedia.org/wiki/Special:Search?search=%s', enabled: true },
  // Movies
  { id: 'imdb', name: 'IMDb', category: 'Movies', url: 'https://www.imdb.com/find?q=%s', enabled: true },
  { id: 'tmdb', name: 'TMDb', category: 'Movies', url: 'https://www.themoviedb.org/search?query=%s', enabled: true },
  { id: 'rottentomatoes', name: 'Rotten Tomatoes', category: 'Movies', url: 'https://www.rottentomatoes.com/search?search=%s', enabled: true },
  { id: 'letterboxd', name: 'Letterboxd', category: 'Movies', url: 'https://letterboxd.com/search/%s/', enabled: true },
  { id: 'moviebox', name: 'MovieBox', category: 'Movies', url: 'https://moviebox.ph/web/searchResult?keyword=%s', enabled: true },
  { id: 'hdhub4u', name: 'HDHub4u', category: 'Movies', url: 'https://new2.hdhub4u.cl/search.html?q=%s', enabled: true },
  // Video
  { id: 'youtube', name: 'YouTube', category: 'Video', url: 'https://www.youtube.com/results?search_query=%s', enabled: true },
  // Shopping
  { id: 'amazon', name: 'Amazon', category: 'Shopping', url: 'https://www.amazon.com/s?k=%s', enabled: true },
  { id: 'ebay', name: 'eBay', category: 'Shopping', url: 'https://www.ebay.com/sch/i.html?_nkw=%s', enabled: true },
  // Programming
  { id: 'github', name: 'GitHub', category: 'Programming', url: 'https://github.com/search?q=%s', enabled: true },
  { id: 'stackoverflow', name: 'Stack Overflow', category: 'Programming', url: 'https://stackoverflow.com/search?q=%s', enabled: true },
  { id: 'npm', name: 'npm', category: 'Programming', url: 'https://www.npmjs.com/search?q=%s', enabled: true },
  { id: 'mdn', name: 'MDN', category: 'Programming', url: 'https://developer.mozilla.org/en-US/search?q=%s', enabled: true },
  // Social
  { id: 'reddit', name: 'Reddit', category: 'Social', url: 'https://www.reddit.com/search/?q=%s', enabled: true },
  { id: 'twitter', name: 'X (Twitter)', category: 'Social', url: 'https://twitter.com/search?q=%s', enabled: true },
  // AI
  { id: 'chatgpt', name: 'ChatGPT', category: 'AI', url: 'https://chatgpt.com/?q=%s', enabled: true },
  { id: 'gemini', name: 'Gemini', category: 'AI', url: 'https://gemini.google.com/app?q=%s', enabled: true },
  { id: 'claude', name: 'Claude', category: 'AI', url: 'https://claude.ai/new?q=%s', enabled: true },
];

// Preferred category ordering for the menu
const CATEGORY_ORDER = ['General', 'Movies', 'Video', 'Shopping', 'Programming', 'Social', 'AI'];

// Storage helpers

function getSites() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('sites', (data) => {
      resolve(data.sites || DEFAULT_SITES);
    });
  });
}

// Context menu builder

// Mutex: prevents concurrent rebuild calls from creating duplicate IDs.
// Root cause: onInstalled calls storage.set → fires onChanged → both call
// rebuildMenus at the same time. The lock queues the second call.
let _rebuilding = false;
let _pendingRebuild = false;

async function rebuildMenus() {
  if (_rebuilding) {
    _pendingRebuild = true;
    return;
  }
  _rebuilding = true;
  _pendingRebuild = false;

  try {
    await chrome.contextMenus.removeAll();
    await _buildMenus();
  } finally {
    _rebuilding = false;
    if (_pendingRebuild) {
      _pendingRebuild = false;
      // Run the queued rebuild after a tick
      setTimeout(() => rebuildMenus(), 0);
    }
  }
}

async function _buildMenus() {
  const sites = await getSites();
  const enabledSites = sites.filter((s) => s.enabled);

  if (enabledSites.length === 0) return;

  // Group sites by category
  const categoryMap = {};
  for (const site of enabledSites) {
    if (!categoryMap[site.category]) categoryMap[site.category] = [];
    categoryMap[site.category].push(site);
  }

  // Sort categories
  const sortedCategories = Object.keys(categoryMap).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  // Root parent — shows the selected text in the title
  chrome.contextMenus.create({
    id: 'root',
    title: 'Search "%s" on…',
    contexts: ['selection'],
  });

  // One sub-menu per category, with one item per site
  for (const category of sortedCategories) {
    const catId = `cat__${category}`;

    chrome.contextMenus.create({
      id: catId,
      parentId: 'root',
      title: category,
      contexts: ['selection'],
    });

    for (const site of categoryMap[category]) {
      chrome.contextMenus.create({
        id: `site__${site.id}`,
        parentId: catId,
        title: site.name,
        contexts: ['selection'],
      });
    }
  }
} // end _buildMenus

// Event listeners

// First install → seed storage with defaults.
// onChanged will fire automatically and trigger rebuildMenus.
// If sites already exist, call rebuild directly (no change fires).
chrome.runtime.onInstalled.addListener(async () => {
  const data = await new Promise((resolve) =>
    chrome.storage.sync.get('sites', resolve)
  );
  if (!data.sites) {
    // Setting storage triggers onChanged → rebuildMenus automatically
    await chrome.storage.sync.set({ sites: DEFAULT_SITES });
  } else {
    // Sites already exist, onChanged won't fire — rebuild directly
    await rebuildMenus();
  }
});

// Service workers can be killed and restarted — rebuild on startup
chrome.runtime.onStartup.addListener(async () => {
  await rebuildMenus();
});

// Rebuild whenever settings change (triggered by the options page)
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'sync' && changes.sites) {
    await rebuildMenus();
  }
});


// Handle menu item click
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (!info.menuItemId.startsWith('site__')) return;

  const siteId = info.menuItemId.replace('site__', '');
  const sites = await getSites();
  const site = sites.find((s) => s.id === siteId);

  if (!site) return;

  const query = encodeURIComponent(info.selectionText.trim());
  const url = site.url.replace('%s', query);

  chrome.tabs.create({ url });
});
