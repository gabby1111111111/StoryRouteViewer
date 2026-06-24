import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { openChatAndGoTo } from '../st/navigation.js';

const nodeTypes = {
  root: RouteNode,
  segment: RouteNode,
  branch: RouteNode,
  chatEnd: RouteNode,
};

const defaultEdgeOptions = {
  type: 'straight',
  style: { stroke: '#8fb7ff', strokeWidth: 3 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#8fb7ff' },
};

const routeFilters = [
  { key: 'all', label: 'All' },
  { key: 'branch', label: 'Branch' },
  { key: 'independent', label: 'Chat' },
  { key: 'empty', label: 'Empty' },
];

export function App({ status, corpus, graph, error, onClose, onRefresh }) {
  const flowShellRef = useRef(null);
  const flowInstanceRef = useRef(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [navigationError, setNavigationError] = useState('');
  const [navigationNotice, setNavigationNotice] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [flowResizeVersion, setFlowResizeVersion] = useState(0);
  const [selectedRouteKey, setSelectedRouteKey] = useState('');
  const selectedNode = useMemo(
    () => graph?.nodes?.find((node) => node.id === selectedNodeId) || null,
    [graph, selectedNodeId],
  );
  const routeItems = useMemo(() => getRouteItems(graph), [graph]);
  const graphStats = useMemo(() => getGraphStats(graph, routeItems), [graph, routeItems]);
  const selectedRouteItem = useMemo(
    () => routeItems.find((item) => item.key === selectedRouteKey) || null,
    [routeItems, selectedRouteKey],
  );
  const selectedBranchFiles = useMemo(() => {
    if (selectedRouteItem) return new Set();
    if (selectedNode?.data?.inspectorType !== 'branch') return new Set();
    return new Set((selectedNode.data.branchRoutes || []).map((route) => route.fileName));
  }, [selectedNode, selectedRouteItem]);
  const displayNodes = useMemo(
    () =>
      (graph?.nodes || []).map((node) => ({
        ...node,
        selected: node.id === selectedNodeId || isNodeInSelectedBranch(node, selectedBranchFiles) || isNodeInSelectedRoute(node, selectedRouteItem),
        data: {
          ...node.data,
          isSelected: node.id === selectedNodeId,
          isBranchRelated: isNodeInSelectedBranch(node, selectedBranchFiles),
          isRouteListSelected: isNodeInSelectedRoute(node, selectedRouteItem),
        },
      })),
    [graph, selectedNodeId, selectedBranchFiles, selectedRouteItem],
  );

  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedRouteKey('');
    setNavigationError('');
    setNavigationNotice('');
  }, [graph]);

  const navigateToNode = async (node) => {
    const target = node?.data?.navigationTarget;
    if (!target?.fileName) return;

    setSelectedNodeId(node.id);
    setNavigationError('');
    setNavigationNotice('');
    setIsNavigating(true);

    try {
      onClose?.();
      const result = await openChatAndGoTo(target.fileName, target.messageIndex, target.fallbackMessageIndex);
      const message = formatNavigationSuccess(result);
      setNavigationNotice(message);
      notifyNavigationSuccess(message);
    } catch (navigationFailure) {
      console.error('[Story Route Viewer] Navigation failed', navigationFailure);
      const message = navigationFailure?.message || String(navigationFailure);
      setNavigationError(message);
      globalThis.toastr?.error?.(`Story Route Viewer jump failed: ${message}`);
    } finally {
      setIsNavigating(false);
    }
  };

  const focusGraphNode = (nodeId) => {
    const flow = flowInstanceRef.current;
    const node = graph?.nodes?.find((item) => item.id === nodeId);
    if (!flow || !node?.position) return;

    const width = node.width || node.measured?.width || 178;
    const height = node.height || node.measured?.height || 92;
    window.requestAnimationFrame(() => {
      flow.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: 0.9,
        duration: 260,
      });
    });
  };

  useEffect(() => {
    if (status !== 'ready') return undefined;

    let resizeTimer = null;
    const remountFlow = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        setFlowResizeVersion((version) => version + 1);
      }, 120);
    };

    window.addEventListener('resize', remountFlow);
    document.addEventListener('fullscreenchange', remountFlow);
    window.visualViewport?.addEventListener('resize', remountFlow);

    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', remountFlow);
      document.removeEventListener('fullscreenchange', remountFlow);
      window.visualViewport?.removeEventListener('resize', remountFlow);
    };
  }, [status]);

  useEffect(() => {
    if (status !== 'ready') return undefined;

    const timers = [0, 60, 180].map((delay) =>
      window.setTimeout(() => repairReactFlowTransforms(flowShellRef.current), delay),
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [status, displayNodes, graph?.edges, flowResizeVersion]);

  return (
    <div className="story-route-viewer-shell">
      <header className="story-route-viewer-header">
        <div>
          <h2>剧情分叉地图</h2>
          <p>{getSubtitle(status, corpus)}</p>
        </div>
        <div className="story-route-viewer-actions">
          <button className="menu_button story-route-viewer-exit-button" type="button" onClick={onClose} title="退出插件">
            <i className="fa-solid fa-right-from-bracket" />
            <span>退出插件</span>
          </button>
          <button className="menu_button" type="button" onClick={onRefresh} title="刷新">
            <i className="fa-solid fa-rotate-right" />
          </button>
          <button className="menu_button" type="button" onClick={onClose} title="关闭">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      </header>

      <main className="story-route-viewer-content">
        {status === 'loading' && <StateMessage text="正在读取当前聊天..." />}
        {status === 'error' && <StateMessage tone="error" text={error || '读取失败'} />}
        {status === 'ready' && (
          <>
            <StatsPanel corpus={corpus} graphStats={graphStats} />
            <div className="story-route-viewer-workspace">
              <RouteList
                routes={routeItems}
                selectedRouteKey={selectedRouteKey}
                isNavigating={isNavigating}
                onSelect={(route) => {
                  const anchorNodeId = route.anchorNodeId || route.branchId;
                  setSelectedRouteKey(route.key);
                  setSelectedNodeId(anchorNodeId);
                  setNavigationError('');
                  focusGraphNode(anchorNodeId);
                }}
                onNavigate={(route) => {
                  setSelectedRouteKey(route.key);
                  navigateToNode({
                    id: route.key,
                    data: {
                      routeListKey: route.key,
                      navigationTarget: route.navigationTarget,
                    },
                  });
                }}
              />
              <div className="story-route-viewer-flow" ref={flowShellRef}>
                <ReactFlow
                  key={`story-route-flow-${flowResizeVersion}`}
                  nodes={displayNodes}
                  edges={graph.edges}
                  nodeTypes={nodeTypes}
                  defaultEdgeOptions={defaultEdgeOptions}
                  defaultViewport={{ x: 32, y: 48, zoom: 0.78 }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  panOnScroll
                  panOnScrollSpeed={0.7}
                  minZoom={0.35}
                  maxZoom={1.5}
                  proOptions={{ hideAttribution: true }}
                  onInit={(instance) => {
                    flowInstanceRef.current = instance;
                  }}
                  onNodeClick={(_, node) => {
                    setSelectedRouteKey('');
                    setSelectedNodeId(node.id);
                  }}
                  onNodeDoubleClick={(_, node) => navigateToNode(node)}
                >
                  <Background gap={24} size={1} />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
              <Inspector
                node={selectedNode}
                selectedRoute={selectedRouteItem}
                navigationError={navigationError}
                navigationNotice={navigationNotice}
                isNavigating={isNavigating}
                onNavigate={navigateToNode}
              />
            </div>
          </>
        )}
      </main>

      <button className="story-route-viewer-floating-exit" type="button" onClick={onClose}>
        <i className="fa-solid fa-right-from-bracket" />
        <span>退出插件</span>
      </button>
    </div>
  );
}

function StatsPanel({ corpus, graphStats }) {
  return (
    <section className="story-route-viewer-stats">
      <div>
        <span>Chats</span>
        <strong>{corpus.chatCount}</strong>
      </div>
      <div>
        <span>Messages</span>
        <strong>{corpus.totalMessages}</strong>
      </div>
      <div>
        <span>Empty</span>
        <strong>{corpus.emptyChats?.length || 0}</strong>
      </div>
      <div>
        <span>Branches</span>
        <strong>{graphStats.branchCount}</strong>
      </div>
      <div>
        <span>Routes</span>
        <strong>{graphStats.routeCount}</strong>
      </div>
    </section>
  );
}

function RouteList({ routes, selectedRouteKey, isNavigating, onSelect, onNavigate }) {
  const [query, setQuery] = useState('');
  const [routeKind, setRouteKind] = useState('all');
  const routeKindCounts = useMemo(() => getRouteKindCounts(routes), [routes]);
  const filteredRoutes = useMemo(() => filterRoutes(routes, query, routeKind), [routes, query, routeKind]);
  const hasActiveFilter = query.trim() || routeKind !== 'all';

  return (
    <aside className="story-route-viewer-route-list">
      <div className="story-route-viewer-route-list-head">
        <h3>Routes</h3>
        <span>{hasActiveFilter ? `${filteredRoutes.length}/${routes.length}` : routes.length}</span>
      </div>
      <div className="story-route-viewer-route-search">
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder="Filter routes"
          aria-label="Filter routes"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button type="button" title="Clear route filter" onClick={() => setQuery('')}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="story-route-viewer-route-filters" aria-label="Route type filter">
        {routeFilters.map((filter) => (
          <button
            type="button"
            className={routeKind === filter.key ? 'is-active' : ''}
            key={filter.key}
            onClick={() => setRouteKind(filter.key)}
          >
            <span>{filter.label}</span>
            <strong>{routeKindCounts[filter.key] || 0}</strong>
          </button>
        ))}
      </div>
      {routes.length === 0 ? (
        <p className="story-route-viewer-route-list-empty">No routes yet.</p>
      ) : filteredRoutes.length === 0 ? (
        <p className="story-route-viewer-route-list-empty">No matching routes.</p>
      ) : (
        <div className="story-route-viewer-route-list-items">
          {filteredRoutes.map((route) => (
            <div
              className={`story-route-viewer-route-list-item${route.key === selectedRouteKey ? ' is-selected' : ''}`}
              key={route.key}
            >
              <button type="button" className="story-route-viewer-route-list-main" onClick={() => onSelect?.(route)}>
                <span className="story-route-viewer-route-chip">{route.routeLabel}</span>
                <strong>{route.fileName}</strong>
                <em>{route.messageCount} messages</em>
                <span className="story-route-viewer-route-list-preview">{route.nextPreview || '-'}</span>
              </button>
              <button
                className="menu_button story-route-viewer-route-list-jump"
                type="button"
                disabled={isNavigating}
                onClick={() => onNavigate?.(route)}
              >
                {isNavigating ? 'Jumping...' : 'Jump'}
              </button>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function RouteNode({ data, type }) {
  return (
    <div className={`story-route-viewer-node ${type}${data.isEmpty ? ' is-empty' : ''}${data.isSelected ? ' is-selected' : ''}${data.isBranchRelated ? ' is-branch-related' : ''}${data.isRouteListSelected ? ' is-route-list-selected' : ''}`}>
      {type !== 'root' && (
        <Handle className="story-route-viewer-handle" type="target" position={Position.Left} />
      )}
      {data.routeLane && <div className="story-route-viewer-node-lane">{data.routeLane.label}</div>}
      <div className="story-route-viewer-node-title">{data.title}</div>
      <div className="story-route-viewer-node-subtitle">{data.subtitle}</div>
      <div className="story-route-viewer-node-detail">{data.detail}</div>
      {type !== 'chatEnd' && (
        <Handle className="story-route-viewer-handle" type="source" position={Position.Right} />
      )}
    </div>
  );
}

function Inspector({ node, selectedRoute, navigationError, navigationNotice, isNavigating, onNavigate }) {
  if (!node) {
    return (
      <aside className="story-route-viewer-inspector">
        <h3>Inspector</h3>
        <p className="story-route-viewer-inspector-empty">点击剧情段或 Chat End 查看详情。</p>
      </aside>
    );
  }

  if (node.data.inspectorType === 'segment') {
    return (
      <aside className="story-route-viewer-inspector">
        <h3>{node.data.title || '剧情段'}</h3>
        {node.data.routeLane && <InspectorRouteBadge routeLane={node.data.routeLane} />}
        <InspectorRow label="File" value={node.data.fileName} />
        {node.data.chatFiles?.length > 0 && <InspectorPreview label="Chats" value={node.data.chatFiles.join('\n')} />}
        <InspectorRow label="Range" value={`${node.data.startIndex} - ${node.data.endIndex}`} />
        <InspectorRow label="Messages" value={node.data.messageCount} />
        <InspectorPreview label="First" value={node.data.firstPreview} />
        <InspectorPreview label="Last" value={node.data.lastPreview} />
        <InspectorAction
          disabled={isNavigating}
          label={isNavigating ? 'Jumping...' : 'Jump to start'}
          onClick={() => onNavigate?.(node)}
        />
        <NavigationNotice text={navigationNotice} />
        <NavigationError text={navigationError} />
      </aside>
    );
  }

  if (node.data.inspectorType === 'chatEnd') {
    return (
      <aside className="story-route-viewer-inspector">
        <h3>{node.data.isEmpty ? 'Empty Chat' : 'Chat End'}</h3>
        {node.data.routeLane && <InspectorRouteBadge routeLane={node.data.routeLane} />}
        <InspectorRow label="File" value={node.data.fileName} />
        <InspectorRow label="Messages" value={node.data.messageCount} />
        {node.data.isEmpty ? (
          <div className="story-route-viewer-inspector-alert">Empty chat</div>
        ) : (
          <>
            <InspectorPreview label="First" value={node.data.firstPreview} />
            <InspectorPreview label="Last" value={node.data.lastPreview} />
          </>
        )}
        <InspectorAction
          disabled={isNavigating}
          label={isNavigating ? 'Jumping...' : node.data.isEmpty ? 'Open chat' : 'Jump to end'}
          onClick={() => onNavigate?.(node)}
        />
        <NavigationNotice text={navigationNotice} />
        <NavigationError text={navigationError} />
      </aside>
    );
  }

  if (node.data.inspectorType === 'branch') {
    return (
      <aside className="story-route-viewer-inspector">
        <h3>{node.data.title || '分叉点'}</h3>
        <div className="story-route-viewer-inspector-alert">
          {node.data.routeOptionCount || node.data.routeCount} route options · {node.data.routeCount} chats
        </div>
        <InspectorRow label="Shared prefix" value={node.data.sharedPrefixRange || '无共同前缀'} />
        <InspectorRow label="Branch after" value={`${node.data.branchIndex} messages`} />
        <InspectorRow label="Branches" value={node.data.routeCount} />
        <InspectorAction
          disabled={isNavigating}
          label={isNavigating ? 'Jumping...' : 'Jump to branch point'}
          onClick={() => onNavigate?.(node)}
        />
        {selectedRoute?.branchId === node.id && (
          <SelectedRouteCard route={selectedRoute} isNavigating={isNavigating} onNavigate={onNavigate} />
        )}
        <div className="story-route-viewer-branch-list">
          {(node.data.branchRoutes || []).map((route) => (
            <div className="story-route-viewer-branch-item" key={route.fileName}>
              <div className="story-route-viewer-branch-item-head">
                <span className="story-route-viewer-route-chip">{route.routeLabel || 'R?'}</span>
                <strong>{route.fileName}</strong>
              </div>
              <span>{route.chatEnd}</span>
              <p>{route.nextPreview || '-'}</p>
              <button
                className="menu_button story-route-viewer-branch-jump"
                type="button"
                disabled={isNavigating}
                onClick={() =>
                  onNavigate?.({
                    id: `branch-route-${route.fileName}`,
                    data: { navigationTarget: route.navigationTarget },
                  })
                }
              >
                {isNavigating ? 'Jumping...' : 'Jump to route'}
              </button>
            </div>
          ))}
        </div>
        <NavigationNotice text={navigationNotice} />
        <NavigationError text={navigationError} />
      </aside>
    );
  }

  return (
    <aside className="story-route-viewer-inspector">
      <h3>{node.data.title}</h3>
      <InspectorRow label="Type" value={node.type} />
      <InspectorRow label="Detail" value={node.data.detail} />
    </aside>
  );
}

function SelectedRouteCard({ route, isNavigating, onNavigate }) {
  return (
    <section className="story-route-viewer-selected-route">
      <div className="story-route-viewer-selected-route-head">
        <span className="story-route-viewer-route-chip">{route.routeLabel}</span>
        <strong>Selected Route</strong>
      </div>
      <InspectorRow label="File" value={route.fileName} />
      <InspectorRow label="Messages" value={route.messageCount} />
      <InspectorRow label="ChatEnd" value={route.chatEnd} />
      <InspectorPreview label="Next" value={route.nextPreview} />
      <button
        className="menu_button story-route-viewer-branch-jump"
        type="button"
        disabled={isNavigating}
        onClick={() =>
          onNavigate?.({
            id: route.key,
            data: { navigationTarget: route.navigationTarget },
          })
        }
      >
        {isNavigating ? 'Jumping...' : 'Jump to route'}
      </button>
    </section>
  );
}

function InspectorAction({ label, disabled, onClick }) {
  return (
    <button className="menu_button story-route-viewer-inspector-action" type="button" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}

function InspectorRouteBadge({ routeLane }) {
  return (
    <div className="story-route-viewer-route-badge">
      <span>{routeLane.label}</span>
      <strong>{routeLane.title}</strong>
      <em>{routeLane.routeCount} chat{routeLane.routeCount === 1 ? '' : 's'}</em>
    </div>
  );
}

function NavigationError({ text }) {
  if (!text) return null;
  return <div className="story-route-viewer-inspector-error">{text}</div>;
}

function NavigationNotice({ text }) {
  if (!text) return null;
  return <div className="story-route-viewer-inspector-notice">{text}</div>;
}

function InspectorRow({ label, value }) {
  return (
    <div className="story-route-viewer-inspector-row">
      <span>{label}</span>
      <strong>{value ?? '-'}</strong>
    </div>
  );
}

function InspectorPreview({ label, value }) {
  return (
    <div className="story-route-viewer-inspector-preview">
      <span>{label}</span>
      <p>{value || '-'}</p>
    </div>
  );
}

function repairReactFlowTransforms(container) {
  if (!container) return;

  const viewport = container.querySelector('.react-flow__viewport');
  const viewportTransform = viewport?.style?.transform;
  if (viewport && viewportTransform) {
    viewport.style.setProperty('transform', viewportTransform, 'important');
  }

  container.querySelectorAll('.react-flow__node').forEach((node) => {
    const nodeTransform = node.style.transform;
    if (nodeTransform) {
      node.style.setProperty('transform', nodeTransform, 'important');
    }
    node.style.setProperty('visibility', 'visible', 'important');
    node.style.setProperty('width', '178px', 'important');
    node.style.setProperty('height', '92px', 'important');
  });
}

function StateMessage({ text, tone = 'normal' }) {
  return <div className={`story-route-viewer-state ${tone}`}>{text}</div>;
}

function isNodeInSelectedBranch(node, selectedBranchFiles) {
  if (!selectedBranchFiles || selectedBranchFiles.size === 0) return false;
  if (node.data?.fileName && selectedBranchFiles.has(node.data.fileName)) return true;
  if (Array.isArray(node.data?.chatFiles)) {
    return node.data.chatFiles.some((fileName) => selectedBranchFiles.has(fileName));
  }
  return false;
}

function isNodeInSelectedRoute(node, route) {
  if (!route) return false;
  if (node.id === route.anchorNodeId) return true;
  if (node.id === route.branchId) return true;
  if (node.data?.fileName === route.fileName) return true;
  if (Array.isArray(node.data?.chatFiles)) {
    return node.data.chatFiles.includes(route.fileName);
  }
  return false;
}

function getRouteItems(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const seen = new Set();
  const branchFileNames = new Set();
  const segmentByFileName = new Map();

  nodes
    .filter((node) => node.data?.inspectorType === 'segment' && node.data?.fileName)
    .forEach((node) => {
      if (!segmentByFileName.has(node.data.fileName)) {
        segmentByFileName.set(node.data.fileName, node);
      }
    });

  const branchRoutes = nodes
    .filter((node) => node.data?.inspectorType === 'branch')
    .flatMap((node) =>
      (node.data.branchRoutes || []).map((route, index) => ({
        key: `${node.id}:${route.routeLabel || index}:${route.fileName}`,
        branchId: node.id,
        anchorNodeId: node.id,
        routeKind: 'branch',
        routeLabel: route.routeLabel || `R${index + 1}`,
        fileName: route.fileName,
        nextPreview: route.nextPreview,
        messageCount: route.messageCount,
        chatEnd: route.chatEnd,
        navigationTarget: route.navigationTarget,
      })),
    );

  branchRoutes.forEach((route) => branchFileNames.add(route.fileName));

  const independentRoutes = nodes
    .filter((node) => node.data?.inspectorType === 'chatEnd' && !branchFileNames.has(node.data.fileName))
    .map((node) => {
      const segment = segmentByFileName.get(node.data.fileName);
      const isEmpty = Boolean(node.data.isEmpty);

      return {
        key: `independent:${node.data.fileName}`,
        branchId: '',
        anchorNodeId: segment?.id || node.id,
        routeKind: isEmpty ? 'empty' : 'independent',
        routeLabel: isEmpty ? 'Empty' : 'Chat',
        fileName: node.data.fileName,
        nextPreview: isEmpty ? 'Empty chat' : segment?.data?.firstPreview || node.data.firstPreview,
        messageCount: node.data.messageCount,
        chatEnd: isEmpty ? 'Empty Chat' : `${node.data.messageCount} messages`,
        navigationTarget: segment?.data?.navigationTarget || node.data.navigationTarget,
      };
    });

  return [...branchRoutes, ...independentRoutes]
    .filter((route) => {
      if (seen.has(route.key)) return false;
      seen.add(route.key);
      return true;
    });
}

function getRouteKindCounts(routes) {
  return routes.reduce(
    (counts, route) => {
      const kind = route.routeKind || 'independent';
      counts.all += 1;
      counts[kind] = (counts[kind] || 0) + 1;
      return counts;
    },
    { all: 0, branch: 0, independent: 0, empty: 0 },
  );
}

function filterRoutes(routes, query, routeKind = 'all') {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  return routes.filter((route) => {
    if (routeKind !== 'all' && route.routeKind !== routeKind) return false;
    if (!normalizedQuery) return true;

    return [
      route.routeLabel,
      route.routeKind,
      route.fileName,
      route.nextPreview,
      route.chatEnd,
      String(route.messageCount ?? ''),
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
  });
}

function getGraphStats(graph, routeItems) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return {
    branchCount: nodes.filter((node) => node.type === 'branch').length,
    routeCount: Array.isArray(routeItems) ? routeItems.length : 0,
  };
}

function formatNavigationSuccess(result) {
  if (!result?.ok) return 'Jump completed.';
  const fileName = result.fileName || 'chat';
  const alreadyOpen = result.alreadyOpen ? 'Already open' : 'Opened';

  if (result.action === 'opened_chat') {
    return `${alreadyOpen}: ${fileName}.`;
  }

  if (result.action === 'jumped_to_fallback') {
    return `${alreadyOpen}: ${fileName}. Target floor ${result.requestedMessageIndex} was unavailable; jumped to ${result.messageIndex}.`;
  }

  if (result.action === 'jumped_to_message') {
    return `${alreadyOpen}: ${fileName}. Jumped to message ${result.messageIndex}.`;
  }

  return `${alreadyOpen}: ${fileName}.`;
}

function notifyNavigationSuccess(message) {
  if (globalThis.toastr?.success) {
    globalThis.toastr.success(message);
    return;
  }
  if (globalThis.toastr?.info) {
    globalThis.toastr.info(message);
    return;
  }
  console.info(`[Story Route Viewer] ${message}`);
}

function getSubtitle(status, corpus) {
  if (status === 'loading') return '读取当前角色/群聊 chat 列表和内容';
  if (status === 'error') return '读取失败，错误信息显示在窗口内';
  if (!corpus) return '等待读取';
  return `${corpus.title} · ${corpus.chatCount} chats · ${corpus.totalMessages} messages`;
}
