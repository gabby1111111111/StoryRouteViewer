const ROOT_X = 0;
const FIRST_CONTENT_X = 300;
const COLUMN_WIDTH = 320;
const ROW_HEIGHT = 132;
const TITLE_PREVIEW_LENGTH = 36;
const INSPECTOR_PREVIEW_LENGTH = 160;
const CHAT_END_KEY = '[chat-end]';
const MIN_SHARED_PREFIX_MESSAGES = 2;
const MIN_SHARED_PREFIX_TEXT_LENGTH = 80;
const MIN_FAMILY_LOOSE_PREFIX_CHARS = 300;
const MIN_FAMILY_LOOSE_PREFIX_RATIO = 0.5;
const NODE_WIDTH = 178;
const NODE_HEIGHT = 92;

export function buildGraph(corpus) {
  const chats = Array.isArray(corpus.chats) ? corpus.chats : [];
  const routes = chats.map((chat, index) => normalizeRoute(chat, index));
  const centerY = routes.length > 1 ? ((routes.length - 1) * ROW_HEIGHT) / 2 : 0;

  const root = {
    id: 'root',
    type: 'root',
    position: { x: ROOT_X, y: centerY },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
    sourcePosition: 'right',
    data: {
      title: corpus.title,
      subtitle: corpus.scope === 'group' ? '当前群聊' : '当前角色',
      detail: `${corpus.chatCount} chats · ${corpus.totalMessages} messages`,
      inspectorType: 'root',
    },
  };

  const builder = createGraphBuilder(root);
  let rowIndex = 0;

  groupRoutesByFirstMessage(routes)
    .sort((a, b) => a.routes[0].index - b.routes[0].index)
    .forEach((group) => {
      if (group.kind === 'empty') {
        group.routes.forEach((route) => {
          builder.addChatEnd({
            parentId: root.id,
            route,
            column: 1,
            row: rowIndex,
          });
          rowIndex += 1;
        });
        return;
      }

      builder.addRouteTree({
        parentId: root.id,
        routes: group.routes,
        depth: 0,
        column: 1,
        rowStart: rowIndex,
      });
      rowIndex += group.routes.length;
    });

  return builder.getGraph();
}

function createGraphBuilder(root) {
  const nodes = [root];
  const edges = [];
  const debug = {
    candidateBranchCount: 0,
    acceptedBranchCount: 0,
    rejectedBranchCount: 0,
    rejectedReasons: {
      prefix_too_short: 0,
      prefix_text_too_short: 0,
      metadata_only: 0,
    },
    candidates: [],
  };
  let segmentCount = 0;
  let branchCount = 0;

  function addRouteTree({ parentId, routes, depth, column, rowStart, routeLane = null, incomingEdgeLabel = '' }) {
    if (routes.length === 0) return;
    if (routes.length === 1) {
      addSingleRoute({ parentId, route: routes[0], depth, column, row: rowStart, routeLane, incomingEdgeLabel });
      return;
    }

    const rowCenter = getRowCenter(rowStart, routes.length);
    const sharedLength = getCommonPrefixLength(routes, depth);
    const branchDepth = depth + sharedLength;
    const nextGroups = sharedLength > 0 ? groupRoutesByNextMessage(routes, branchDepth) : [];

    if (sharedLength > 0 && nextGroups.length > 1) {
      debug.candidateBranchCount += 1;
      const validation = validateSharedPrefix(routes[0].messages, depth, sharedLength);
      if (!validation.accepted) {
        rejectCandidate(validation.reason);
        recordCandidate({
          status: 'rejected',
          reason: validation.reason,
          routes,
          depth,
          sharedLength,
          validation,
        });
        addIndependentRoutes({ parentId, routes, depth, column, rowStart });
        return;
      }

      debug.acceptedBranchCount += 1;
      recordCandidate({
        status: 'accepted',
        reason: '',
        routes,
        depth,
        sharedLength,
        validation,
      });
      addAcceptedBranch({
        parentId,
        routes,
        depth,
        sharedLength,
        branchDepth,
        nextGroups,
        column,
        rowStart,
        rowCenter,
        routeLane,
        incomingEdgeLabel,
      });
      return;
    }

    const onlyGroup = nextGroups[0];
    if (!onlyGroup || onlyGroup.key === CHAT_END_KEY || sharedLength === 0) {
      addIndependentRoutes({ parentId, routes, depth, column, rowStart });
      return;
    }

    addRouteTree({
      parentId,
      routes: onlyGroup.routes,
      depth: branchDepth,
      column,
      rowStart,
      routeLane,
      incomingEdgeLabel,
    });
  }

  function addAcceptedBranch({ parentId, routes, depth, sharedLength, branchDepth, nextGroups, column, rowStart, rowCenter, routeLane, incomingEdgeLabel }) {
    const sharedSegment = createSegmentNode({
      id: `segment-${segmentCount}`,
      typeLabel: '共同开头',
      title: makeSegmentTitle(routes[0].messages, depth, depth + sharedLength - 1),
      detail: `${routes.length} chats · ${sharedLength} shared messages`,
      fileName: `${routes.length} chats`,
      chatFiles: routes.map((route) => route.fileName),
      messages: routes[0].messages,
      startIndex: depth,
      endIndex: depth + sharedLength - 1,
      x: getColumnX(column),
      y: rowCenter,
      routeLane,
    });
    segmentCount += 1;
    nodes.push(sharedSegment);
    edges.push(createEdge(`${parentId}-to-${sharedSegment.id}`, parentId, sharedSegment.id, {
      label: incomingEdgeLabel,
    }));

    const branch = createBranchNode({
      id: `branch-${branchCount}`,
      routes,
      depth: branchDepth,
      nextGroups,
      x: getColumnX(column + 1),
      y: rowCenter,
    });
    branchCount += 1;
    nodes.push(branch);
    edges.push(createEdge(`${sharedSegment.id}-to-${branch.id}`, sharedSegment.id, branch.id));

    let branchRowStart = rowStart;
    nextGroups.forEach((group, groupIndex) => {
      const lane = createRouteLane(group, groupIndex, nextGroups.length, branchDepth);
      if (group.key === CHAT_END_KEY) {
        group.routes.forEach((route, index) => {
          addChatEnd({
            parentId: branch.id,
            route,
            column: column + 2,
            row: branchRowStart + index,
            routeLane: lane,
            incomingEdgeLabel: lane.label,
          });
        });
      } else {
        addRouteTree({
          parentId: branch.id,
          routes: group.routes,
          depth: branchDepth,
          column: column + 2,
          rowStart: branchRowStart,
          routeLane: lane,
          incomingEdgeLabel: lane.label,
        });
      }

      branchRowStart += group.routes.length;
    });
  }

  function addIndependentRoutes({ parentId, routes, depth, column, rowStart }) {
    routes.forEach((route, index) => {
      addSingleRoute({
        parentId,
        route,
        depth,
        column,
        row: rowStart + index,
      });
    });
  }

  function rejectCandidate(reason) {
    debug.rejectedBranchCount += 1;
    debug.rejectedReasons[reason] = (debug.rejectedReasons[reason] || 0) + 1;
  }

  function recordCandidate({ status, reason, routes, depth, sharedLength, validation }) {
    debug.candidates.push({
      id: `candidate-${debug.candidates.length + 1}`,
      status,
      reason,
      fileNames: routes.map((route) => route.fileName),
      fileCount: routes.length,
      sharedPrefixRange: `${depth} - ${depth + sharedLength - 1}`,
      sharedPrefixMessages: sharedLength,
      sharedPrefixTextLength: validation.textLength,
      sharedPrefixPreview: validation.preview,
      prefixSamples: makePrefixSamples(routes[0].messages, depth, sharedLength),
      nextPreviews: routes.map((route) => ({
        fileName: route.fileName,
        preview: depth + sharedLength < route.messages.length
          ? makeMessagePreview(route.messages[depth + sharedLength], TITLE_PREVIEW_LENGTH)
          : 'Chat End',
      })),
    });
  }

  function addSingleRoute({ parentId, route, depth, column, row, routeLane = null, incomingEdgeLabel = '' }) {
    if (depth >= route.messages.length) {
      addChatEnd({ parentId, route, column, row, routeLane, incomingEdgeLabel });
      return;
    }

    const segment = createSegmentNode({
      id: `segment-${segmentCount}`,
      typeLabel: '分支剧情段',
      title: makeSegmentTitle(route.messages, depth, route.messages.length - 1),
      detail: `${route.fileName} · ${route.messages.length - depth} messages`,
      fileName: route.fileName,
      messages: route.messages,
      startIndex: depth,
      endIndex: route.messages.length - 1,
      x: getColumnX(column),
      y: getRowY(row),
      routeLane,
    });
    segmentCount += 1;

    nodes.push(segment);
    edges.push(createEdge(`${parentId}-to-${segment.id}`, parentId, segment.id, {
      label: incomingEdgeLabel,
    }));
    addChatEnd({
      parentId: segment.id,
      route,
      column: column + 1,
      row,
      routeLane,
    });
  }

  function addChatEnd({ parentId, route, column, row, routeLane = null, incomingEdgeLabel = '' }) {
    const chatEnd = createChatEndNode({
      index: route.index,
      fileName: route.fileName,
      messages: route.messages,
      x: getColumnX(column),
      y: getRowY(row),
      routeLane,
    });

    nodes.push(chatEnd);
    edges.push(createEdge(`${parentId}-to-${chatEnd.id}`, parentId, chatEnd.id, {
      label: incomingEdgeLabel,
    }));
  }

  return {
    addRouteTree,
    addChatEnd,
    getGraph: () => {
      const graph = { nodes, edges, debug };
      console.info('[Story Route Viewer] Branch detection debug', debug);
      if (debug.candidates.length > 0) {
        console.table(debug.candidates.map((candidate) => ({
          id: candidate.id,
          status: candidate.status,
          reason: candidate.reason || 'accepted',
          files: candidate.fileNames.join(' | '),
          prefixRange: candidate.sharedPrefixRange,
          prefixMessages: candidate.sharedPrefixMessages,
          prefixTextLength: candidate.sharedPrefixTextLength,
          preview: candidate.sharedPrefixPreview,
          samples: candidate.prefixSamples.map((sample) => sample.summary).join(' || '),
        })));
      }
      return graph;
    },
  };
}

function normalizeRoute(chat, index) {
  const messages = Array.isArray(chat.messages) ? chat.messages : [];
  const fileName = chat.fileName || `chat-${index + 1}`;
  const chatName = getChatNameFromFileName(fileName);
  const normalizedTexts = messages.map((message) => normalizeMessageText(message));

  return {
    index,
    fileName,
    chatName,
    mainChatName: normalizeChatName(chat.mainChat),
    branchLinks: Array.isArray(chat.branchLinks) ? chat.branchLinks : [],
    metadata: chat.metadata || {},
    metadataBranchFamilyKey: null,
    familyKey: getBranchFamilyKey(fileName),
    messages,
    normalizedTexts,
    textHashes: normalizedTexts.map((text) => hashText(text)),
  };
}

function groupRoutesByFirstMessage(routes) {
  const exactFirstMessageGroups = new Map();
  const familyGroups = new Map();
  const emptyRoutes = [];
  const groupedRoutes = new Set();
  const result = [];
  const metadataGroups = getMetadataBranchGroups(routes);

  metadataGroups.forEach((groupRoutes) => {
    groupRoutes.forEach((route) => groupedRoutes.add(route.index));
    result.push({
      kind: 'nonEmpty',
      source: 'st_metadata',
      routes: groupRoutes,
    });
  });

  routes.forEach((route) => {
    if (route.messages.length === 0) {
      emptyRoutes.push(route);
      return;
    }
    if (groupedRoutes.has(route.index)) return;

    if (!familyGroups.has(route.familyKey)) familyGroups.set(route.familyKey, []);
    familyGroups.get(route.familyKey).push(route);
  });

  familyGroups.forEach((groupRoutes) => {
    if (groupRoutes.length < 2) return;
    groupRoutes.forEach((route) => groupedRoutes.add(route.index));
    result.push({
      kind: 'nonEmpty',
      source: 'filename_family',
      routes: groupRoutes,
    });
  });

  routes.forEach((route) => {
    if (route.messages.length === 0 || groupedRoutes.has(route.index)) return;

    const key = route.textHashes[0];
    if (!exactFirstMessageGroups.has(key)) exactFirstMessageGroups.set(key, []);
    exactFirstMessageGroups.get(key).push(route);
  });

  exactFirstMessageGroups.forEach((groupRoutes) => {
    result.push({
      kind: 'nonEmpty',
      source: 'exact_prefix',
      routes: groupRoutes,
    });
  });

  if (emptyRoutes.length > 0) {
    result.push({
      kind: 'empty',
      routes: emptyRoutes,
    });
  }

  return result;
}

function getMetadataBranchGroups(routes) {
  const nonEmptyRoutes = routes.filter((route) => route.messages.length > 0);
  const routeByName = new Map(nonEmptyRoutes.map((route) => [route.chatName, route]));
  const parent = new Map(nonEmptyRoutes.map((route) => [route.index, route.index]));
  const hasMetadataLink = new Set();
  const routesByMainChatName = new Map();

  function find(index) {
    const value = parent.get(index);
    if (value === index) return index;
    const root = find(value);
    parent.set(index, root);
    return root;
  }

  function union(left, right) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  }

  nonEmptyRoutes.forEach((route) => {
    if (route.mainChatName) {
      if (!routesByMainChatName.has(route.mainChatName)) {
        routesByMainChatName.set(route.mainChatName, []);
      }
      routesByMainChatName.get(route.mainChatName).push(route);

      if (routeByName.has(route.mainChatName)) {
        const parentRoute = routeByName.get(route.mainChatName);
        union(parentRoute.index, route.index);
        hasMetadataLink.add(parentRoute.index);
        hasMetadataLink.add(route.index);
      }
    }

    route.branchLinks.forEach((link) => {
      const childName = normalizeChatName(link.chatName);
      if (!childName || !routeByName.has(childName)) return;
      const childRoute = routeByName.get(childName);
      union(route.index, childRoute.index);
      hasMetadataLink.add(route.index);
      hasMetadataLink.add(childRoute.index);
    });
  });

  routesByMainChatName.forEach((linkedRoutes) => {
    if (linkedRoutes.length < 2) return;

    const firstRoute = linkedRoutes[0];
    linkedRoutes.slice(1).forEach((route) => {
      union(firstRoute.index, route.index);
    });
    linkedRoutes.forEach((route) => hasMetadataLink.add(route.index));
  });

  const groups = new Map();
  nonEmptyRoutes.forEach((route) => {
    if (!hasMetadataLink.has(route.index)) return;
    const root = find(route.index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(route);
  });

  return Array.from(groups.values())
    .filter((groupRoutes) => groupRoutes.length > 1)
    .map((groupRoutes, groupIndex) => {
      const sortedRoutes = groupRoutes.sort((a, b) => a.index - b.index);
      const familyKey = `st-metadata-${groupIndex + 1}`;
      sortedRoutes.forEach((route) => {
        route.metadataBranchFamilyKey = familyKey;
      });
      return sortedRoutes;
    });
}

function groupRoutesByNextMessage(routes, depth) {
  const groups = new Map();

  routes.forEach((route) => {
    const key = depth < route.textHashes.length ? route.textHashes[depth] : CHAT_END_KEY;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(route);
  });

  return Array.from(groups.entries())
    .map(([key, groupRoutes]) => ({ key, routes: groupRoutes }))
    .sort((a, b) => a.routes[0].index - b.routes[0].index);
}

function getCommonPrefixLength(routes, depth) {
  const shortestLength = Math.min(...routes.map((route) => route.textHashes.length));
  let length = 0;

  for (let index = depth; index < shortestLength; index += 1) {
    const allSame = routes.every((route) => areRouteMessagesEquivalent(routes[0], route, index));
    if (!allSame) break;
    length += 1;
  }

  return length;
}

function areRouteMessagesEquivalent(baseRoute, route, messageIndex) {
  if (baseRoute.textHashes[messageIndex] === route.textHashes[messageIndex]) return true;
  if (!areRoutesInLooseComparableFamily(baseRoute, route)) return false;
  return areSameFamilyLongTextsEquivalent(baseRoute.normalizedTexts[messageIndex], route.normalizedTexts[messageIndex]);
}

function areRoutesInLooseComparableFamily(baseRoute, route) {
  if (baseRoute.familyKey === route.familyKey) return true;
  return Boolean(
    baseRoute.metadataBranchFamilyKey &&
    route.metadataBranchFamilyKey &&
    baseRoute.metadataBranchFamilyKey === route.metadataBranchFamilyKey,
  );
}

function areSameFamilyLongTextsEquivalent(left, right) {
  if (!left || !right) return false;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (shorter.length < MIN_FAMILY_LOOSE_PREFIX_CHARS) return false;
  if (shorter.length / longer.length < MIN_FAMILY_LOOSE_PREFIX_RATIO) return false;

  if (longer.startsWith(shorter)) return true;

  const commonPrefixLength = getCommonTextPrefixLength(left, right);
  return (
    commonPrefixLength >= MIN_FAMILY_LOOSE_PREFIX_CHARS &&
    commonPrefixLength / shorter.length >= MIN_FAMILY_LOOSE_PREFIX_RATIO
  );
}

function getCommonTextPrefixLength(left, right) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function validateSharedPrefix(messages, startIndex, length) {
  const prefixMessages = messages.slice(startIndex, startIndex + length);
  const contentMessages = prefixMessages.filter((message) => isStoryContentMessage(message));
  const textLength = contentMessages.reduce((sum, message) => sum + normalizeMessageText(message).length, 0);
  const preview = makePrefixPreview(contentMessages);

  if (length < MIN_SHARED_PREFIX_MESSAGES) {
    return { accepted: false, reason: 'prefix_too_short', textLength, preview };
  }

  if (contentMessages.length === 0) {
    return { accepted: false, reason: 'metadata_only', textLength, preview };
  }

  if (textLength < MIN_SHARED_PREFIX_TEXT_LENGTH) {
    return { accepted: false, reason: 'prefix_text_too_short', textLength, preview };
  }

  return { accepted: true, textLength, preview };
}

function isStoryContentMessage(message) {
  if (!hasMessageText(message)) return false;
  if (message?.role === 'system') return false;
  if (String(message?.name || '').toLowerCase() === 'system') return false;
  return true;
}

function makePrefixPreview(messages) {
  const text = messages.map((message) => normalizeMessageText(message)).filter(Boolean).join(' ');
  if (!text) return '(no story text)';
  return text.length > INSPECTOR_PREVIEW_LENGTH ? `${text.slice(0, INSPECTOR_PREVIEW_LENGTH)}...` : text;
}

function makePrefixSamples(messages, startIndex, length) {
  return messages.slice(startIndex, startIndex + Math.min(length, 5)).map((message, offset) => {
    const index = startIndex + offset;
    const text = normalizeMessageText(message);
    const sample = {
      index,
      keys: Object.keys(message || {}),
      name: message?.name,
      role: message?.role,
      is_user: message?.is_user,
      is_system: message?.is_system,
      mesType: typeof message?.mes,
      mesLength: typeof message?.mes === 'string' ? message.mes.length : 0,
      normalizedLength: text.length,
      isStoryContent: isStoryContentMessage(message),
      preview: text ? makeMessagePreview(message, 80) : '(empty normalized text)',
    };

    return {
      ...sample,
      summary: `#${sample.index} keys=${sample.keys.join(',')} name=${sample.name ?? ''} role=${sample.role ?? ''} is_user=${sample.is_user ?? ''} is_system=${sample.is_system ?? ''} mesType=${sample.mesType} mesLength=${sample.mesLength} normalizedLength=${sample.normalizedLength} story=${sample.isStoryContent}`,
    };
  });
}

function createSegmentNode({ id, typeLabel, title, detail, fileName, chatFiles, messages, startIndex, endIndex, x, y, routeLane }) {
  const messageCount = Math.max(0, endIndex - startIndex + 1);
  const targetFileName = Array.isArray(chatFiles) && chatFiles.length > 0 ? chatFiles[0] : fileName;

  return {
    id,
    type: 'segment',
    position: { x, y },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
    sourcePosition: 'right',
    targetPosition: 'left',
    data: {
      title,
      subtitle: typeLabel,
      detail,
      inspectorType: 'segment',
      fileName,
      chatFiles,
      routeLane,
      startIndex,
      endIndex,
      messageCount,
      navigationTarget: createNavigationTarget({
        fileName: targetFileName,
        messageIndex: startIndex,
        fallbackMessageIndex: startIndex,
      }),
      firstPreview: messageCount > 0 ? makeMessagePreview(messages[startIndex], INSPECTOR_PREVIEW_LENGTH) : '(no remaining messages)',
      lastPreview: messageCount > 0 ? makeMessagePreview(messages[endIndex], INSPECTOR_PREVIEW_LENGTH) : '(no remaining messages)',
    },
  };
}

function createBranchNode({ id, routes, depth, nextGroups, x, y }) {
  const targetMessageIndex = depth > 0 ? depth - 1 : 0;
  const targetFileName = routes[0]?.fileName || '';
  const routeOptions = Array.isArray(nextGroups)
    ? nextGroups.map((group, groupIndex) => createRouteLane(group, groupIndex, nextGroups.length, depth))
    : [];
  const sharedPrefixLabel = depth > 0 ? `0 - ${depth - 1}` : '无共同前缀';

  return {
    id,
    type: 'branch',
    position: { x, y },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
    sourcePosition: 'right',
    targetPosition: 'left',
    data: {
      title: 'Branch Point',
      subtitle: `${routeOptions.length || routes.length} route options`,
      detail: `${routes.length} chats · shared ${sharedPrefixLabel}`,
      inspectorType: 'branch',
      routeCount: routes.length,
      routeOptionCount: routeOptions.length || routes.length,
      branchIndex: depth,
      sharedPrefixRange: sharedPrefixLabel,
      navigationTarget: createNavigationTarget({
        fileName: targetFileName,
        messageIndex: targetMessageIndex,
        fallbackMessageIndex: 0,
      }),
      chatFiles: routes.map((route) => route.fileName),
      routeOptions,
      branchRoutes: routeOptions.flatMap((lane) =>
        lane.fileNames.map((fileName) => {
          const route = routes.find((item) => item.fileName === fileName);
          const routeMessageIndex = getRouteStartMessageIndex(route, depth);
          return {
            routeLabel: lane.label,
            routeTitle: lane.title,
            fileName,
            nextPreview: route && depth < route.messages.length ? makeMessagePreview(route.messages[depth], INSPECTOR_PREVIEW_LENGTH) : 'Chat End',
            messageCount: route?.messages.length || 0,
            chatEnd: !route || route.messages.length === 0 ? 'Empty ChatEnd' : `ChatEnd · ${route.messages.length} messages`,
            navigationTarget: createNavigationTarget({
              fileName,
              messageIndex: routeMessageIndex,
              fallbackMessageIndex: route?.messages.length ? route.messages.length - 1 : null,
            }),
          };
        }),
      ),
    },
  };
}

function createChatEndNode({ index, fileName, messages, x, y, routeLane }) {
  const messageCount = messages.length;
  const isEmpty = messageCount === 0;
  const lastMessageIndex = isEmpty ? null : messageCount - 1;

  return {
    id: `chat-end-${index}`,
    type: 'chatEnd',
    position: { x, y },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
    targetPosition: 'left',
    data: {
      title: isEmpty ? 'Empty Chat' : 'Chat End',
      subtitle: isEmpty ? 'Empty' : '聊天结束点',
      detail: `${fileName} · ${messageCount} ${messageCount === 1 ? 'message' : 'messages'}`,
      fileName,
      messageCount,
      isEmpty,
      routeLane,
      inspectorType: 'chatEnd',
      navigationTarget: createNavigationTarget({
        fileName,
        messageIndex: lastMessageIndex,
        fallbackMessageIndex: lastMessageIndex,
      }),
      firstPreview: isEmpty ? '' : makeMessagePreview(messages[0], INSPECTOR_PREVIEW_LENGTH),
      lastPreview: isEmpty ? '' : makeMessagePreview(messages[messages.length - 1], INSPECTOR_PREVIEW_LENGTH),
    },
  };
}

function createNavigationTarget({ fileName, messageIndex, fallbackMessageIndex }) {
  const safeFileName = String(fileName || '');
  return {
    chatId: safeFileName.replace(/\.jsonl$/i, ''),
    fileName: safeFileName,
    messageIndex,
    fallbackMessageIndex,
  };
}

function createRouteLane(group, groupIndex, optionCount, depth) {
  const label = `R${groupIndex + 1}`;
  const firstRoute = group.routes[0];
  const isChatEnd = group.key === CHAT_END_KEY;

  return {
    label,
    title: `Route ${groupIndex + 1}`,
    optionIndex: groupIndex + 1,
    optionCount,
    routeCount: group.routes.length,
    fileNames: group.routes.map((route) => route.fileName),
    nextPreview: isChatEnd || !firstRoute || depth >= firstRoute.messages.length
      ? 'Chat End'
      : makeMessagePreview(firstRoute.messages[depth], INSPECTOR_PREVIEW_LENGTH),
  };
}

function getRouteStartMessageIndex(route, depth) {
  if (!route || route.messages.length === 0) return null;
  if (depth < route.messages.length) return depth;
  return route.messages.length - 1;
}

function createEdge(id, source, target, options = {}) {
  const edge = {
    id,
    source,
    target,
    type: 'straight',
  };

  if (options.label) {
    edge.label = options.label;
    edge.labelStyle = {
      fill: '#dbeafe',
      fontSize: 11,
      fontWeight: 700,
    };
    edge.labelBgStyle = {
      fill: '#1f2937',
      fillOpacity: 0.92,
    };
    edge.labelBgPadding = [5, 3];
    edge.labelBgBorderRadius = 5;
  }

  return edge;
}

function makeSegmentTitle(messages, startIndex, endIndex) {
  const segmentMessages = messages.slice(startIndex, endIndex + 1);
  const firstUserMessage = segmentMessages.find((message) => isUserMessage(message) && hasMessageText(message));
  if (firstUserMessage) return makeMessagePreview(firstUserMessage, TITLE_PREVIEW_LENGTH);

  const firstMessage = segmentMessages.find((message) => hasMessageText(message));
  if (firstMessage) return makeMessagePreview(firstMessage, TITLE_PREVIEW_LENGTH);

  return '剧情段';
}

function isUserMessage(message) {
  return message?.is_user === true || message?.is_user === 'true' || message?.role === 'user';
}

function hasMessageText(message) {
  return normalizeMessageText(message).length > 0;
}

function makeMessagePreview(message, maxLength) {
  const text = normalizeMessageText(message);
  if (!text) return '(empty message)';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getColumnX(column) {
  return FIRST_CONTENT_X + (column - 1) * COLUMN_WIDTH;
}

function getRowY(row) {
  return row * ROW_HEIGHT;
}

function getRowCenter(rowStart, rowCount) {
  return getRowY(rowStart) + ((rowCount - 1) * ROW_HEIGHT) / 2;
}

function normalizeMessageText(message) {
  return String(message?.mes || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getBranchFamilyKey(fileName) {
  return String(fileName).replace(/ - Branch #\d+(?=\.jsonl$|$)/i, '');
}

function getChatNameFromFileName(fileName) {
  return normalizeChatName(String(fileName).replace(/\.jsonl$/i, ''));
}

function normalizeChatName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\.jsonl$/i, '');
  return trimmed || null;
}

function hashText(text) {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return `h${(hash >>> 0).toString(36)}`;
}
