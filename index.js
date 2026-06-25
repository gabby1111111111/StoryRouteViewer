const DIST_ENTRY = '/scripts/extensions/third-party/StoryRouteViewer/dist/index.iife.js';
const AUTO_OPEN_ON_LOAD = false;
const AUTO_OPEN_DELAY_MS = 2500;
const AUTO_OPEN_RETRY_MS = 3000;
const AUTO_OPEN_MAX_ATTEMPTS = 10;

let appLoadPromise = null;
let autoOpenStarted = false;
let autoOpenSucceeded = false;

console.warn('[Story Route Viewer] root entry loaded');
ensureBrowserProcessShim();

mountFallbackMenu();

function ensureBrowserProcessShim() {
  globalThis.process ||= {};
  globalThis.process.env ||= {};
  globalThis.process.env.NODE_ENV ||= 'production';
}

function mountFallbackMenu() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => waitForExtensionsSettings().then(appendMenu));
    return;
  }

  waitForExtensionsSettings().then(appendMenu);
}

async function waitForExtensionsSettings() {
  const existing = document.getElementById('extensions_settings');
  if (existing) return existing;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    await delay(100);
    const container = document.getElementById('extensions_settings');
    if (container) return container;
  }

  return document.body;
}

function appendMenu(container) {
  if (document.getElementById('story_route_viewer_entry')) return;

  const entry = document.createElement('div');
  entry.id = 'story_route_viewer_entry';
  entry.className = 'story-route-viewer-entry';
  entry.innerHTML = `
    <div id="story_route_viewer_open" class="menu_button story-route-viewer-menu-button">
      <i class="fa-solid fa-route"></i>
      <span>剧情分叉地图</span>
    </div>
    <div id="story_route_viewer_timeline_open" class="menu_button story-route-viewer-menu-button">
      <i class="fa-solid fa-timeline"></i>
      <span>AI Timeline</span>
    </div>
  `;
  container.appendChild(entry);

  document.getElementById('story_route_viewer_open')?.addEventListener('click', openStoryRouteViewer);
  document.getElementById('story_route_viewer_timeline_open')?.addEventListener('click', toggleStoryRouteTimeline);
  console.warn('[Story Route Viewer] fallback menu mounted');
  scheduleDebugAutoOpen();
}

function scheduleDebugAutoOpen() {
  if (!AUTO_OPEN_ON_LOAD || autoOpenStarted) return;
  autoOpenStarted = true;
  setTimeout(() => {
    runDebugAutoOpenAttempts();
  }, AUTO_OPEN_DELAY_MS);
}

async function runDebugAutoOpenAttempts() {
  for (let attempt = 1; attempt <= AUTO_OPEN_MAX_ATTEMPTS; attempt += 1) {
    if (autoOpenSucceeded) return;

    console.warn(`[Story Route Viewer] debug auto-open attempt ${attempt}/${AUTO_OPEN_MAX_ATTEMPTS}`);
    const opened = await openStoryRouteViewer({ auto: true });
    if (opened) {
      autoOpenSucceeded = true;
      return;
    }

    await delay(AUTO_OPEN_RETRY_MS);
  }

  console.warn('[Story Route Viewer] debug auto-open stopped: no active character or group chat was ready.');
}

async function openStoryRouteViewer(options = {}) {
  try {
    await loadApp();
    if (window.StoryRouteViewer?.open) {
      return await window.StoryRouteViewer.open(options);
    }
    throw new Error('StoryRouteViewer.open was not registered');
  } catch (error) {
    console.error('[Story Route Viewer] failed to open', error);
    showFallbackError(error);
    return false;
  }
}

async function toggleStoryRouteTimeline() {
  try {
    await loadApp();
    if (window.StoryRouteViewer?.toggleTimeline) {
      return await window.StoryRouteViewer.toggleTimeline();
    }
    throw new Error('StoryRouteViewer.toggleTimeline was not registered');
  } catch (error) {
    console.error('[Story Route Viewer] failed to toggle timeline', error);
    showFallbackError(error);
    return false;
  }
}

function loadApp() {
  if (!appLoadPromise) {
    ensureBrowserProcessShim();
    appLoadPromise = import(`${DIST_ENTRY}?v=${Date.now()}`);
  }
  return appLoadPromise;
}

function showFallbackError(error) {
  const modal = document.createElement('div');
  modal.className = 'story-route-viewer-modal is-open';
  modal.innerHTML = `
    <div class="story-route-viewer-shell">
      <header class="story-route-viewer-header">
        <div>
          <h2>剧情分叉地图</h2>
          <p>插件应用加载失败</p>
        </div>
      </header>
      <main class="story-route-viewer-content">
        <div class="story-route-viewer-state error">${escapeHtml(error?.message || String(error))}</div>
      </main>
    </div>
  `;
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
