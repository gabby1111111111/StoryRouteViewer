import { getSTModules } from './stModules.js';

export async function readCurrentChatCorpus({ suppressMissingContextLog = false } = {}) {
  const { script, extensions } = await getSTModules();
  const context = extensions.getContext();

  if (context?.groupId) {
    return readGroupCorpus({ context, script });
  }

  return readCharacterCorpus({ context, script, suppressMissingContextLog });
}

async function readCharacterCorpus({ context, script, suppressMissingContextLog }) {
  const character = getCurrentCharacter(context, script);

  if (!character) {
    if (!suppressMissingContextLog) {
      console.warn('[Story Route Viewer] Unable to resolve current character', {
        contextCharacterId: context?.characterId,
        scriptThisChid: script?.this_chid,
        contextKeys: Object.keys(context || {}),
      });
    }
    throw new Error('请先打开一个角色或群聊。');
  }

  const response = await fetch('/api/characters/chats', {
    method: 'POST',
    headers: script.getRequestHeaders(),
    body: JSON.stringify({ avatar_url: character.avatar }),
  });

  if (!response.ok) {
    throw new Error(`读取角色聊天列表失败：HTTP ${response.status}`);
  }

  const data = await response.json();
  const chatMetas = Object.values(data || {})
    .filter((item) => item?.file_name)
    .sort((a, b) => String(a.file_name).localeCompare(String(b.file_name)));

  const chats = [];
  for (const meta of chatMetas) {
    const fileName = String(meta.file_name);
    const rawMessages = await readCharacterChatFile({ script, character, fileName });
    const { metadata, messages } = normalizeChatPayload(rawMessages, { removeMetadata: true });
    chats.push({
      fileName,
      metadata,
      mainChat: getMainChatName(metadata),
      branchLinks: getBranchLinks(messages),
      messages,
    });
  }

  return makeCorpus({
    scope: 'character',
    title: character.name || 'Current Character',
    chats,
  });
}

async function readGroupCorpus({ context, script }) {
  const group = context.groups?.find((item) => item.id === context.groupId);
  if (!group) {
    throw new Error('无法读取当前群聊信息。');
  }

  const chatNames = Array.isArray(group.chats) ? group.chats : [];
  const chats = [];

  for (const chatName of chatNames) {
    const fileName = String(chatName);
    const rawMessages = await readGroupChatFile({ script, fileName });
    const { metadata, messages } = normalizeChatPayload(rawMessages, { removeMetadata: false });
    chats.push({
      fileName,
      metadata,
      mainChat: getMainChatName(metadata),
      branchLinks: getBranchLinks(messages),
      messages,
    });
  }

  return makeCorpus({
    scope: 'group',
    title: group.name || 'Current Group',
    chats,
  });
}

async function readCharacterChatFile({ script, character, fileName }) {
  const response = await fetch('/api/chats/get', {
    method: 'POST',
    headers: script.getRequestHeaders(),
    body: JSON.stringify({
      ch_name: character.name,
      file_name: fileName.replace(/\.jsonl$/i, ''),
      avatar_url: character.avatar,
    }),
    cache: 'no-cache',
  });

  if (!response.ok) {
    throw new Error(`读取聊天失败：${fileName}，HTTP ${response.status}`);
  }

  return response.json();
}

async function readGroupChatFile({ script, fileName }) {
  const response = await fetch('/api/chats/group/get', {
    method: 'POST',
    headers: script.getRequestHeaders(),
    body: JSON.stringify({ id: fileName }),
    cache: 'no-cache',
  });

  if (!response.ok) {
    throw new Error(`读取群聊失败：${fileName}，HTTP ${response.status}`);
  }

  return response.json();
}

function getCurrentCharacter(context, script) {
  const ids = [
    context?.characterId,
    script?.this_chid,
    toNumericId(context?.characterId),
    toNumericId(script?.this_chid),
  ].filter((id) => id !== undefined && id !== null && id !== '' && !Number.isNaN(id));

  for (const id of ids) {
    const character = context?.characters?.[id] || script?.characters?.[id];
    if (character) return character;
  }

  const chatId = context?.chatId;
  if (chatId) {
    const character = (context?.characters || script?.characters || []).find((item) => item?.chat === chatId);
    if (character) return character;
  }

  return null;
}

function toNumericId(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim() === '') return null;

  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeChatPayload(rawMessages, { removeMetadata }) {
  if (!Array.isArray(rawMessages)) {
    return { metadata: {}, messages: [] };
  }

  const messages = [...rawMessages];
  let metadata = {};
  if (removeMetadata && messages.length > 0 && !Object.prototype.hasOwnProperty.call(messages[0] || {}, 'mes')) {
    const header = messages.shift();
    metadata = header?.chat_metadata && typeof header.chat_metadata === 'object' ? header.chat_metadata : {};
  }

  return {
    metadata,
    messages: messages.filter((message) => message && typeof message === 'object' && typeof message.mes === 'string'),
  };
}

function getMainChatName(metadata) {
  return typeof metadata?.main_chat === 'string' && metadata.main_chat.trim() ? metadata.main_chat.trim() : null;
}

function getBranchLinks(messages) {
  return messages.flatMap((message, index) => {
    const branches = Array.isArray(message?.extra?.branches) ? message.extra.branches : [];
    return branches
      .filter((name) => typeof name === 'string' && name.trim())
      .map((name) => ({
        messageIndex: index,
        chatName: name.trim(),
      }));
  });
}

function makeCorpus({ scope, title, chats }) {
  const safeChats = chats.map((chat) => ({
    ...chat,
    messages: Array.isArray(chat.messages) ? chat.messages : [],
  }));
  const emptyChats = safeChats.filter((chat) => chat.messages.length === 0).map((chat) => chat.fileName);

  if (emptyChats.length > 0) {
    console.warn('[Story Route Viewer] Empty chat files', emptyChats);
  }

  return {
    scope,
    title,
    chats: safeChats,
    chatCount: safeChats.length,
    totalMessages: safeChats.reduce((sum, chat) => sum + chat.messages.length, 0),
    emptyChats,
  };
}
