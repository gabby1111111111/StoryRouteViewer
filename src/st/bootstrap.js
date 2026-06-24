import React from 'react';
import { createRoot } from 'react-dom/client';
import { buildGraph } from '../graph/buildGraph.js';
import { App } from '../ui/App.jsx';
import { readCurrentChatCorpus } from './corpus.js';

const CONTEXT_RETRY_ATTEMPTS = 24;
const CONTEXT_RETRY_DELAY_MS = 500;

let root = null;
let modalElement = null;

export function initializeStoryRouteViewer() {
  window.StoryRouteViewer = {
    open: openModal,
    close: closeModal,
    refresh: refreshData,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountMenu);
  } else {
    mountMenu();
  }
}

function mountMenu() {
  if (document.getElementById('story_route_viewer_entry')) return;
  waitForExtensionsSettings().then((container) => {
    appendMenu(container);
  });
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
  `;

  container.appendChild(entry);

  document.getElementById('story_route_viewer_open')?.addEventListener('click', openModal);
  console.info('[Story Route Viewer] Menu mounted');
}

function ensureModal() {
  if (modalElement) return modalElement;

  modalElement = document.createElement('div');
  modalElement.id = 'story_route_viewer_modal';
  modalElement.className = 'story-route-viewer-modal';
  modalElement.innerHTML = '<div id="story_route_viewer_app"></div>';
  document.body.appendChild(modalElement);

  modalElement.addEventListener('click', (event) => {
    if (event.target === modalElement) closeModal();
  });

  const appElement = modalElement.querySelector('#story_route_viewer_app');
  root = createRoot(appElement);

  return modalElement;
}

function openModal(options = {}) {
  if (options?.auto) {
    return openAutoModal();
  }

  ensureModal();
  modalElement.classList.add('is-open');
  renderLoading();
  refreshData({ waitForContext: true });
  return true;
}

function closeModal() {
  modalElement?.classList.remove('is-open');
}

async function refreshData({ waitForContext = false } = {}) {
  try {
    renderLoading();
    const corpus = await readCorpusWhenReady({ waitForContext });
    const graph = buildGraph(corpus);
    renderApp({ status: 'ready', corpus, graph });
  } catch (error) {
    console.error('[Story Route Viewer] Failed to load chats', error);
    renderApp({ status: 'error', error: getErrorMessage(error) });
  }
}

async function openAutoModal() {
  ensureModal();
  modalElement.classList.add('is-open');
  renderLoading();

  try {
    const corpus = await readCorpusWhenReady({ waitForContext: true });
    const graph = buildGraph(corpus);
    renderApp({ status: 'ready', corpus, graph });
    return true;
  } catch (error) {
    if (isMissingContextError(error)) {
      console.info('[Story Route Viewer] Auto-open skipped: no active character or group chat.');
      closeModal();
      return false;
    }

    console.error('[Story Route Viewer] Auto-open failed', error);
    renderApp({ status: 'error', error: getErrorMessage(error) });
    return true;
  }
}

async function readCorpusWhenReady({ waitForContext }) {
  const attempts = waitForContext ? CONTEXT_RETRY_ATTEMPTS : 1;
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await readCurrentChatCorpus({ suppressMissingContextLog: waitForContext && attempt < attempts - 1 });
    } catch (error) {
      lastError = error;
      if (!waitForContext || !isMissingContextError(error)) break;
      await delay(CONTEXT_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

function renderLoading() {
  renderApp({ status: 'loading' });
}

function renderApp(props) {
  root?.render(
    React.createElement(App, {
      ...props,
      onClose: closeModal,
      onRefresh: refreshData,
    }),
  );
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error || '未知错误');
}

function isMissingContextError(error) {
  if (!(error instanceof Error)) return false;
  return error.message.includes('请先打开') || error.message.includes('角色或群聊');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
