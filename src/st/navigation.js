import { getSTModules } from './stModules.js';

const CHAT_READY_TIMEOUT_MS = 10000;
const CHAT_READY_INTERVAL_MS = 80;
const SHOW_MORE_TIMEOUT_MS = 6000;
const SHOW_MORE_INTERVAL_MS = 80;

export async function openChat(fileName) {
  const { script, extensions } = await getSTModules();
  const context = extensions.getContext();
  const safeFileName = String(fileName || '').trim();

  if (!safeFileName) {
    throw new Error('Missing chat fileName.');
  }

  if (context?.groupId) {
    const groupChatsPath = '/scripts/group-chats.js';
    const { openGroupChat } = await import(/* @vite-ignore */ groupChatsPath);
    const chatId = normalizeGroupChatId(safeFileName, context);
    const currentGroup = context.groups?.find((group) => group.id === context.groupId);
    if (currentGroup?.chat_id === chatId) {
      return { fileName: safeFileName, chatId, scope: 'group', alreadyOpen: true };
    }

    await openGroupChat(context.groupId, chatId);
    return { fileName: safeFileName, chatId, scope: 'group' };
  }

  if (script.this_chid === undefined || script.this_chid === null) {
    throw new Error('No character is currently open.');
  }

  const chatId = safeFileName.replace(/\.jsonl$/i, '');
  if (script.characters?.[script.this_chid]?.chat === chatId) {
    return { fileName: safeFileName, chatId, scope: 'character', alreadyOpen: true };
  }

  await script.openCharacterChat(chatId);
  return { fileName: safeFileName, chatId, scope: 'character' };
}

export async function scrollToMessage(messageIndex) {
  if (!Number.isInteger(messageIndex) || messageIndex < 0) {
    return { ok: true, skipped: true };
  }

  const rendered = await ensureMessageRendered(messageIndex);
  const message = rendered ? findMessageElement(messageIndex) : null;
  if (!message) {
    throw new Error(`Cannot find message ${messageIndex}. The chat opened, but that floor was not rendered.`);
  }

  message.scrollIntoView({ behavior: 'smooth', block: 'center' });
  message.classList.add('story-route-viewer-jump-highlight');
  window.setTimeout(() => message.classList.remove('story-route-viewer-jump-highlight'), 1800);

  return { ok: true, messageIndex };
}

export async function openChatAndGoTo(fileName, messageIndex, fallbackMessageIndex = null) {
  const chatResult = await openChat(fileName);

  if (!Number.isInteger(messageIndex) || messageIndex < 0) {
    return {
      ok: true,
      action: 'opened_chat',
      fileName: chatResult.fileName,
      chatId: chatResult.chatId,
      scope: chatResult.scope,
      alreadyOpen: chatResult.alreadyOpen === true,
      openedOnly: true,
    };
  }

  try {
    const scrollResult = await scrollToMessage(messageIndex);
    return {
      ok: true,
      action: 'jumped_to_message',
      fileName: chatResult.fileName,
      chatId: chatResult.chatId,
      scope: chatResult.scope,
      alreadyOpen: chatResult.alreadyOpen === true,
      messageIndex: scrollResult.messageIndex,
    };
  } catch (error) {
    if (Number.isInteger(fallbackMessageIndex) && fallbackMessageIndex >= 0 && fallbackMessageIndex !== messageIndex) {
      const fallbackResult = await scrollToMessage(fallbackMessageIndex);
      return {
        ok: true,
        action: 'jumped_to_fallback',
        fileName: chatResult.fileName,
        chatId: chatResult.chatId,
        scope: chatResult.scope,
        alreadyOpen: chatResult.alreadyOpen === true,
        messageIndex: fallbackResult.messageIndex,
        requestedMessageIndex: messageIndex,
      };
    }
    throw new Error(`Opened ${chatResult.fileName}, but could not scroll to message ${messageIndex}: ${error?.message || error}`);
  }
}

function normalizeGroupChatId(fileName, context) {
  const chats = context?.groups?.find((group) => group.id === context.groupId)?.chats || [];
  if (chats.includes(fileName)) return fileName;

  const withoutExtension = fileName.replace(/\.jsonl$/i, '');
  if (chats.includes(withoutExtension)) return withoutExtension;

  return fileName;
}

async function ensureMessageRendered(messageIndex) {
  const { extensions } = await getSTModules();
  const chatReady = await waitFor(() => {
    try {
      const chat = extensions.getContext()?.chat;
      return Array.isArray(chat) && chat.length > messageIndex;
    } catch {
      return false;
    }
  }, CHAT_READY_TIMEOUT_MS, CHAT_READY_INTERVAL_MS);

  if (!chatReady) return false;
  if (findMessageElement(messageIndex)) return true;

  let firstDisplayed = getFirstDisplayedMessageId();
  const showMoreMessages = globalThis._showMoreMessages;
  if (firstDisplayed !== null && messageIndex < firstDisplayed && typeof showMoreMessages === 'function') {
    try {
      await showMoreMessages(firstDisplayed - messageIndex);
      await waitFor(() => {
        firstDisplayed = getFirstDisplayedMessageId();
        return firstDisplayed !== null && firstDisplayed <= messageIndex;
      }, SHOW_MORE_TIMEOUT_MS, SHOW_MORE_INTERVAL_MS);
    } catch (error) {
      console.warn('[Story Route Viewer] Failed to load earlier messages before jump', error);
      return false;
    }
  }

  return Boolean(findMessageElement(messageIndex));
}

function findMessageElement(messageIndex) {
  const chat = document.getElementById('chat') || document;
  const selectors = [
    `.mes[mesid="${messageIndex}"]`,
    `.mes[data-mesid="${messageIndex}"]`,
    `.mes[data-index="${messageIndex}"]`,
    `.mes[data-idx="${messageIndex}"]`,
    `.mes[data-message-id="${messageIndex}"]`,
  ];

  for (const selector of selectors) {
    const message = chat.querySelector(selector) || document.querySelector(selector);
    if (message) return message;
  }

  return Array.from(chat.querySelectorAll('.mes')).find((message) =>
    Number(message.getAttribute('mesid')) === messageIndex ||
    Number(message.dataset?.mesid) === messageIndex ||
    Number(message.dataset?.index) === messageIndex ||
    Number(message.dataset?.idx) === messageIndex ||
    Number(message.dataset?.messageId) === messageIndex,
  ) || null;
}

function getFirstDisplayedMessageId() {
  const getFirstDisplayedMessageId = globalThis._getFirstDisplayedMessageId;
  if (typeof getFirstDisplayedMessageId === 'function') {
    try {
      const id = Number(getFirstDisplayedMessageId());
      if (Number.isFinite(id)) return id;
    } catch {
      // Fall through to DOM scan.
    }
  }

  const ids = Array.from(document.querySelectorAll('#chat .mes'))
    .map((message) => Number(message.getAttribute('mesid')))
    .filter(Number.isFinite);
  return ids.length ? Math.min(...ids) : null;
}

async function waitFor(predicate, timeout = 3000, interval = 50) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return true;
    await wait(interval);
  }
  return Boolean(predicate());
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
