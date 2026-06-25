import { scrollToMessage } from './navigation.js';
import { getSTModules } from './stModules.js';

const METADATA_KEY = 'storyRouteViewer';
const TIMELINE_VERSION = 1;
const MAX_PROMPT_MESSAGES = 180;
const MAX_MESSAGE_CHARS = 900;
const MAX_TOTAL_CHARS = 52000;
const DEFAULT_RESPONSE_LENGTH = 1800;

export async function getCurrentChatTimelineContext() {
  const { script, extensions } = await getSTModules();
  const context = extensions.getContext();
  const chat = Array.isArray(context?.chat) ? context.chat : [];
  const chatId = getCurrentChatId({ context, script });

  if (!chatId) {
    throw new Error('请先打开一个角色或群聊。');
  }

  const scope = context?.groupId ? 'group' : 'character';
  const fileName = getCurrentChatFileName({ scope, chatId });
  const metadata = context?.chatMetadata || {};
  const timeline = normalizeStoredTimeline(metadata?.[METADATA_KEY]?.timeline, chat.length);

  return {
    scope,
    chatId,
    fileName,
    title: getCurrentChatTitle({ context, script, scope, chatId, fileName }),
    messageCount: chat.length,
    messages: chat.map((message, index) => normalizeTimelineMessage(message, index)),
    metadata,
    timeline,
    isTimelineStale: Boolean(timeline && timeline.messageCountAtAnalysis !== chat.length),
  };
}

export async function analyzeCurrentChatTimeline() {
  const contextBefore = await getCurrentChatTimelineContext();
  if (contextBefore.messageCount === 0) {
    throw new Error('当前聊天没有可分析的消息。');
  }

  const promptPayload = makePromptMessages(contextBefore.messages);
  const prompt = buildTimelinePrompt(contextBefore, promptPayload);
  const { script } = await getSTModules();
  const raw = await script.generateQuietPrompt({
    quietPrompt: prompt,
    responseLength: DEFAULT_RESPONSE_LENGTH,
    jsonSchema: getTimelineJsonSchema(),
  });
  const timeline = parseTimelineResponse(raw, contextBefore);
  const contextAfter = await getCurrentChatTimelineContext();
  if (contextAfter.chatId !== contextBefore.chatId) {
    throw new Error('分析期间当前聊天已切换，已取消保存。');
  }

  await saveCurrentChatTimeline(timeline);
  return {
    context: await getCurrentChatTimelineContext(),
    raw,
  };
}

export async function saveCurrentChatTimeline(timeline) {
  const { script, extensions } = await getSTModules();
  const context = extensions.getContext();
  const currentMetadata = context?.chatMetadata || {};
  const currentNamespace = currentMetadata[METADATA_KEY] && typeof currentMetadata[METADATA_KEY] === 'object'
    ? currentMetadata[METADATA_KEY]
    : {};

  script.updateChatMetadata({
    [METADATA_KEY]: {
      ...currentNamespace,
      timeline,
    },
  }, false);
  await script.saveMetadata();
}

export function subscribeTimelineContextChanges(callback) {
  let disposed = false;
  let modulesPromise = null;
  let refreshTimer = null;
  const schedule = () => {
    if (disposed) return;
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => callback?.(), 140);
  };

  modulesPromise = getSTModules().then(({ extensions }) => {
    const context = extensions.getContext();
    const eventSource = context?.eventSource;
    const eventTypes = context?.eventTypes || context?.event_types || {};
    const events = [
      eventTypes.CHAT_CHANGED,
      eventTypes.MESSAGE_SENT,
      eventTypes.MESSAGE_RECEIVED,
      eventTypes.MESSAGE_EDITED,
      eventTypes.MESSAGE_DELETED,
      eventTypes.MESSAGE_UPDATED,
      eventTypes.MESSAGE_SWIPED,
    ].filter(Boolean);

    events.forEach((event) => eventSource?.on?.(event, schedule));
    return { eventSource, events };
  }).catch((error) => {
    console.warn('[Story Route Viewer] Failed to subscribe timeline context events', error);
    return null;
  });

  return () => {
    disposed = true;
    window.clearTimeout(refreshTimer);
    modulesPromise?.then((subscription) => {
      subscription?.events?.forEach((event) => {
        subscription.eventSource?.removeListener?.(event, schedule);
      });
    });
  };
}

export async function jumpToCurrentChatMessage(messageIndex) {
  return scrollToMessage(messageIndex);
}

function getCurrentChatId({ context, script }) {
  try {
    const fromContext = context?.getCurrentChatId?.();
    if (fromContext) return String(fromContext);
  } catch {
    // Fall through.
  }

  if (context?.chatId) return String(context.chatId);
  if (script?.getCurrentChatId) {
    try {
      const fromScript = script.getCurrentChatId();
      if (fromScript) return String(fromScript);
    } catch {
      // Fall through.
    }
  }
  return '';
}

function getCurrentChatFileName({ scope, chatId }) {
  if (scope === 'group') return chatId;
  return chatId.endsWith('.jsonl') ? chatId : `${chatId}.jsonl`;
}

function getCurrentChatTitle({ context, script, scope, chatId, fileName }) {
  if (scope === 'group') {
    const group = context?.groups?.find((item) => item.id === context.groupId);
    return group?.name ? `${group.name} / ${chatId}` : fileName;
  }

  const character = context?.characters?.[context.characterId] || script?.characters?.[script.this_chid];
  return character?.name ? `${character.name} / ${fileName}` : fileName;
}

function normalizeTimelineMessage(message, index) {
  return {
    index,
    name: typeof message?.name === 'string' ? message.name : '',
    isUser: Boolean(message?.is_user),
    isSystem: Boolean(message?.is_system),
    text: normalizeMessageText(message?.mes),
  };
}

function normalizeMessageText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makePromptMessages(messages) {
  const selected = [];
  let totalChars = 0;
  const startIndex = Math.max(0, messages.length - MAX_PROMPT_MESSAGES);

  for (let index = startIndex; index < messages.length; index += 1) {
    const message = messages[index];
    const text = message.text.slice(0, MAX_MESSAGE_CHARS);
    if (!text) continue;
    const line = {
      index: message.index,
      speaker: message.name || (message.isUser ? 'User' : 'Character'),
      text,
    };
    const lineSize = JSON.stringify(line).length;
    if (selected.length > 0 && totalChars + lineSize > MAX_TOTAL_CHARS) break;
    selected.push(line);
    totalChars += lineSize;
  }

  return {
    messages: selected,
    truncatedBeforeIndex: startIndex > 0 ? startIndex : null,
  };
}

function buildTimelinePrompt(context, payload) {
  const rangeNote = payload.truncatedBeforeIndex === null
    ? 'The full current chat is included.'
    : `Only messages from index ${payload.truncatedBeforeIndex} onward are included because the chat is long.`;

  return [
    'You are analyzing a long SillyTavern roleplay chat for a visual-novel style route timeline.',
    'Return JSON only. Do not wrap it in markdown. Use zero-based message indexes exactly as provided.',
    '',
    'Goal:',
    '- Compress the chat into story segments that help the player remember what happened.',
    '- Identify distinctive key events, including small personal details the player may care about.',
    '- Treat good segment boundaries and key turning points as AI suggested branch points.',
    '- Do not over-focus on generic romance milestones like first hug/confession unless the chat makes them important.',
    '- Prefer concrete events: unusual objects, pets, exact remarks, user reactions, conflicts, choices, misunderstandings, promises, setting shifts.',
    '',
    'Output rules:',
    '- segments should cover the included message range without becoming a message list.',
    '- A typical 100-message chat should produce roughly 5-10 segments, but use story density as the guide.',
    '- keyEvents belong inside segments and should point to concrete message indexes.',
    '- suggestedBranchPoints should be places where replaying from there could create a meaningfully different route.',
    '- Keep Chinese summaries natural and concise if the chat is Chinese.',
    '',
    'Required JSON shape:',
    '{"segments":[{"title":"string","startIndex":0,"endIndex":9,"summary":"string","keyEvents":[{"messageIndex":3,"title":"string","summary":"string"}]}],"suggestedBranchPoints":[{"messageIndex":3,"title":"string","reason":"string","possibleRoutes":["string"]}]}',
    '',
    `Current chat: ${context.title}`,
    `Message count: ${context.messageCount}`,
    rangeNote,
    '',
    'Messages JSON:',
    JSON.stringify(payload.messages),
  ].join('\n');
}

function getTimelineJsonSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      segments: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            startIndex: { type: 'number' },
            endIndex: { type: 'number' },
            summary: { type: 'string' },
            keyEvents: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  messageIndex: { type: 'number' },
                  title: { type: 'string' },
                  summary: { type: 'string' },
                },
                required: ['messageIndex', 'title', 'summary'],
              },
            },
          },
          required: ['title', 'startIndex', 'endIndex', 'summary', 'keyEvents'],
        },
      },
      suggestedBranchPoints: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            messageIndex: { type: 'number' },
            title: { type: 'string' },
            reason: { type: 'string' },
            possibleRoutes: { type: 'array', items: { type: 'string' } },
          },
          required: ['messageIndex', 'title', 'reason', 'possibleRoutes'],
        },
      },
    },
    required: ['segments', 'suggestedBranchPoints'],
  };
}

function parseTimelineResponse(raw, context) {
  const parsed = parseJsonFromText(raw);
  const maxIndex = context.messageCount - 1;
  const segments = sanitizeSegments(parsed?.segments, maxIndex);
  if (segments.length === 0) {
    throw new Error('AI 没有返回可用的剧情段。');
  }

  const suggestedBranchPoints = sanitizeBranchPoints(parsed?.suggestedBranchPoints, maxIndex);
  return {
    version: TIMELINE_VERSION,
    updatedAt: new Date().toISOString(),
    source: 'ai',
    chatFileName: context.fileName,
    chatId: context.chatId,
    messageCountAtAnalysis: context.messageCount,
    segments,
    suggestedBranchPoints,
  };
}

function parseJsonFromText(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('AI 返回为空。');

  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last <= first) {
      throw new Error('AI 返回不是 JSON。');
    }
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch (error) {
      throw new Error(`AI JSON 解析失败：${error?.message || error}`);
    }
  }
}

function sanitizeSegments(value, maxIndex) {
  if (!Array.isArray(value) || maxIndex < 0) return [];
  return value
    .map((segment, index) => {
      const startIndex = clampIndex(segment?.startIndex, maxIndex);
      const endIndex = clampIndex(segment?.endIndex, maxIndex);
      const start = Math.min(startIndex, endIndex);
      const end = Math.max(startIndex, endIndex);
      return {
        id: `seg_${index + 1}`,
        title: cleanText(segment?.title) || `剧情段 ${index + 1}`,
        startIndex: start,
        endIndex: end,
        summary: cleanText(segment?.summary) || 'AI 未提供摘要。',
        keyEvents: sanitizeKeyEvents(segment?.keyEvents, maxIndex).filter((event) => event.messageIndex >= start && event.messageIndex <= end).slice(0, 6),
      };
    })
    .filter((segment) => segment.startIndex <= maxIndex && segment.endIndex >= 0)
    .sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);
}

function sanitizeKeyEvents(value, maxIndex) {
  if (!Array.isArray(value)) return [];
  return value
    .map((event, index) => ({
      id: `event_${index + 1}`,
      messageIndex: clampIndex(event?.messageIndex, maxIndex),
      title: cleanText(event?.title) || `关键事件 ${index + 1}`,
      summary: cleanText(event?.summary) || '',
    }))
    .filter((event) => event.messageIndex >= 0);
}

function sanitizeBranchPoints(value, maxIndex) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((point, index) => ({
      id: `bp_${index + 1}`,
      messageIndex: clampIndex(point?.messageIndex, maxIndex),
      title: cleanText(point?.title) || `建议分支点 ${index + 1}`,
      reason: cleanText(point?.reason) || '这里可能适合探索不同回应。',
      possibleRoutes: Array.isArray(point?.possibleRoutes)
        ? point.possibleRoutes.map(cleanText).filter(Boolean).slice(0, 4)
        : [],
    }))
    .filter((point) => {
      if (point.messageIndex < 0 || seen.has(point.messageIndex)) return false;
      seen.add(point.messageIndex);
      return true;
    })
    .sort((a, b) => a.messageIndex - b.messageIndex)
    .slice(0, 16);
}

function normalizeStoredTimeline(timeline, currentMessageCount) {
  if (!timeline || typeof timeline !== 'object') return null;
  const maxIndex = Math.max(0, currentMessageCount - 1);
  const segments = sanitizeSegments(timeline.segments, maxIndex);
  if (segments.length === 0) return null;
  return {
    version: Number(timeline.version) || TIMELINE_VERSION,
    updatedAt: typeof timeline.updatedAt === 'string' ? timeline.updatedAt : '',
    source: timeline.source || 'ai',
    chatFileName: timeline.chatFileName || '',
    chatId: timeline.chatId || '',
    messageCountAtAnalysis: Number.isInteger(timeline.messageCountAtAnalysis) ? timeline.messageCountAtAnalysis : currentMessageCount,
    segments,
    suggestedBranchPoints: sanitizeBranchPoints(timeline.suggestedBranchPoints, maxIndex),
  };
}

function clampIndex(value, maxIndex) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(Math.round(number), maxIndex));
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
