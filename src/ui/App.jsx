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

export function App({ status, corpus, graph, error, onClose, onRefresh }) {
  const flowShellRef = useRef(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [navigationError, setNavigationError] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [flowResizeVersion, setFlowResizeVersion] = useState(0);
  const selectedNode = useMemo(
    () => graph?.nodes?.find((node) => node.id === selectedNodeId) || null,
    [graph, selectedNodeId],
  );
  const selectedBranchFiles = useMemo(() => {
    if (selectedNode?.data?.inspectorType !== 'branch') return new Set();
    return new Set((selectedNode.data.branchRoutes || []).map((route) => route.fileName));
  }, [selectedNode]);
  const displayNodes = useMemo(
    () =>
      (graph?.nodes || []).map((node) => ({
        ...node,
        selected: node.id === selectedNodeId || isNodeInSelectedBranch(node, selectedBranchFiles),
        data: {
          ...node.data,
          isSelected: node.id === selectedNodeId,
          isBranchRelated: isNodeInSelectedBranch(node, selectedBranchFiles),
        },
      })),
    [graph, selectedNodeId, selectedBranchFiles],
  );

  useEffect(() => {
    setSelectedNodeId(null);
    setNavigationError('');
  }, [graph]);

  const navigateToNode = async (node) => {
    const target = node?.data?.navigationTarget;
    if (!target?.fileName) return;

    setSelectedNodeId(node.id);
    setNavigationError('');
    setIsNavigating(true);

    try {
      onClose?.();
      await openChatAndGoTo(target.fileName, target.messageIndex, target.fallbackMessageIndex);
    } catch (navigationFailure) {
      console.error('[Story Route Viewer] Navigation failed', navigationFailure);
      const message = navigationFailure?.message || String(navigationFailure);
      setNavigationError(message);
      globalThis.toastr?.error?.(`Story Route Viewer jump failed: ${message}`);
    } finally {
      setIsNavigating(false);
    }
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
            <StatsPanel corpus={corpus} />
            <div className="story-route-viewer-workspace">
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
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  onNodeDoubleClick={(_, node) => navigateToNode(node)}
                >
                  <Background gap={24} size={1} />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
              <Inspector
                node={selectedNode}
                navigationError={navigationError}
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

function StatsPanel({ corpus }) {
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
    </section>
  );
}

function RouteNode({ data, type }) {
  return (
    <div className={`story-route-viewer-node ${type}${data.isEmpty ? ' is-empty' : ''}${data.isSelected ? ' is-selected' : ''}${data.isBranchRelated ? ' is-branch-related' : ''}`}>
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

function Inspector({ node, navigationError, isNavigating, onNavigate }) {
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
        <div className="story-route-viewer-branch-list">
          {(node.data.branchRoutes || []).map((route) => (
            <div className="story-route-viewer-branch-item" key={route.fileName}>
              <div className="story-route-viewer-branch-item-head">
                <span className="story-route-viewer-route-chip">{route.routeLabel || 'R?'}</span>
                <strong>{route.fileName}</strong>
              </div>
              <span>{route.chatEnd}</span>
              <p>{route.nextPreview || '-'}</p>
            </div>
          ))}
        </div>
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

function getSubtitle(status, corpus) {
  if (status === 'loading') return '读取当前角色/群聊 chat 列表和内容';
  if (status === 'error') return '读取失败，错误信息显示在窗口内';
  if (!corpus) return '等待读取';
  return `${corpus.title} · ${corpus.chatCount} chats · ${corpus.totalMessages} messages`;
}
