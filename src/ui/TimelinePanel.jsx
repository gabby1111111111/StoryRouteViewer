import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeCurrentChatTimeline,
  getCurrentChatTimelineContext,
  jumpToCurrentChatMessage,
  subscribeTimelineContextChanges,
} from '../st/timeline.js';

const REFRESH_POLL_MS = 5000;

export function TimelinePanel({ onClose }) {
  const [context, setContext] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeMessageIndex, setActiveMessageIndex] = useState(null);
  const userScrolledTimelineRef = useRef(false);
  const activeSegmentRef = useRef(null);
  const timelineScrollRef = useRef(null);

  const refresh = async ({ silent = false } = {}) => {
    try {
      if (!silent) setStatus('loading');
      const nextContext = await getCurrentChatTimelineContext();
      setContext(nextContext);
      setStatus('ready');
      setError('');
    } catch (refreshError) {
      setStatus('error');
      setError(refreshError?.message || String(refreshError));
    }
  };

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeTimelineContextChanges(() => refresh({ silent: true }));
    const poll = window.setInterval(() => refresh({ silent: true }), REFRESH_POLL_MS);
    return () => {
      unsubscribe?.();
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    const cleanup = observeVisibleMessageIndex(setActiveMessageIndex);
    return cleanup;
  }, []);

  const activeSegmentId = useMemo(() => {
    if (!context?.timeline || !Number.isInteger(activeMessageIndex)) return '';
    const segment = context.timeline.segments.find((item) => activeMessageIndex >= item.startIndex && activeMessageIndex <= item.endIndex);
    return segment?.id || '';
  }, [context, activeMessageIndex]);

  useEffect(() => {
    if (!activeSegmentId || userScrolledTimelineRef.current) return;
    const element = activeSegmentRef.current;
    element?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [activeSegmentId]);

  const analyze = async () => {
    if (isAnalyzing) return;
    if (context?.timeline) {
      const confirmed = window.confirm('当前聊天已经有 AI 时间轴。要覆盖旧结果并重新分析吗？');
      if (!confirmed) return;
    }

    setIsAnalyzing(true);
    setError('');
    setNotice('');
    try {
      const result = await analyzeCurrentChatTimeline();
      setContext(result.context);
      setStatus('ready');
      setNotice('AI 时间轴已保存到当前 chat metadata。');
    } catch (analysisError) {
      console.error('[Story Route Viewer] Timeline analysis failed', analysisError);
      setError(analysisError?.message || String(analysisError));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const jump = async (messageIndex) => {
    setError('');
    setNotice('');
    try {
      await jumpToCurrentChatMessage(messageIndex);
      setNotice(`已跳到第 ${messageIndex + 1} 楼。`);
    } catch (jumpError) {
      setError(jumpError?.message || String(jumpError));
    }
  };

  const timeline = context?.timeline || null;

  return (
    <aside className={`story-route-viewer-timeline${isCollapsed ? ' is-collapsed' : ''}`}>
      <header className="story-route-viewer-timeline-header">
        <div>
          <h3>AI 剧情时间轴</h3>
          <p>{context ? context.title : '当前聊天'}</p>
        </div>
        <div className="story-route-viewer-timeline-actions">
          <button className="menu_button" type="button" title={isCollapsed ? '展开' : '收起'} onClick={() => setIsCollapsed((value) => !value)}>
            <i className={`fa-solid ${isCollapsed ? 'fa-chevron-left' : 'fa-chevron-right'}`} />
          </button>
          <button className="menu_button" type="button" title="关闭 Timeline" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      </header>

      {!isCollapsed && (
        <div
          className="story-route-viewer-timeline-body"
          ref={timelineScrollRef}
          onWheel={() => {
            userScrolledTimelineRef.current = true;
            window.setTimeout(() => {
              userScrolledTimelineRef.current = false;
            }, 2200);
          }}
        >
          {status === 'loading' && <TimelineState text="正在读取当前聊天..." />}
          {status === 'error' && <TimelineState tone="error" text={error || '读取当前聊天失败'} />}
          {status === 'ready' && context && (
            <>
              <TimelineSummary context={context} activeMessageIndex={activeMessageIndex} />
              <button
                className="menu_button story-route-viewer-timeline-analyze"
                type="button"
                disabled={isAnalyzing || context.messageCount === 0}
                onClick={analyze}
              >
                <i className="fa-solid fa-wand-magic-sparkles" />
                <span>{isAnalyzing ? 'AI 分析中...' : timeline ? '重新 AI 分析当前聊天' : 'AI 分析当前聊天'}</span>
              </button>
              {context.isTimelineStale && (
                <div className="story-route-viewer-timeline-warning">
                  当前聊天消息数已变化，时间轴可能已过期。
                </div>
              )}
              {notice && <div className="story-route-viewer-timeline-notice">{notice}</div>}
              {error && <div className="story-route-viewer-timeline-error">{error}</div>}
              {timeline ? (
                <TimelineContent
                  timeline={timeline}
                  activeSegmentId={activeSegmentId}
                  activeSegmentRef={activeSegmentRef}
                  onJump={jump}
                />
              ) : (
                <div className="story-route-viewer-timeline-empty">
                  还没有 AI 时间轴。点击分析后会生成剧情段、关键事件和 AI 建议分支点。
                </div>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function TimelineSummary({ context, activeMessageIndex }) {
  return (
    <section className="story-route-viewer-timeline-summary">
      <div>
        <span>Chat</span>
        <strong>{context.fileName}</strong>
      </div>
      <div>
        <span>Messages</span>
        <strong>{context.messageCount}</strong>
      </div>
      <div>
        <span>Current floor</span>
        <strong>{Number.isInteger(activeMessageIndex) ? activeMessageIndex + 1 : '-'}</strong>
      </div>
    </section>
  );
}

function TimelineContent({ timeline, activeSegmentId, activeSegmentRef, onJump }) {
  const branchPointsByMessage = useMemo(() => {
    const groups = new Map();
    (timeline.suggestedBranchPoints || []).forEach((point) => {
      if (!groups.has(point.messageIndex)) groups.set(point.messageIndex, []);
      groups.get(point.messageIndex).push(point);
    });
    return groups;
  }, [timeline]);

  return (
    <div className="story-route-viewer-timeline-list">
      <div className="story-route-viewer-timeline-meta">
        <span>{timeline.source === 'ai' ? 'AI generated' : timeline.source}</span>
        <span>{timeline.updatedAt ? new Date(timeline.updatedAt).toLocaleString() : ''}</span>
      </div>
      {timeline.segments.map((segment) => (
        <section
          className={`story-route-viewer-timeline-segment${segment.id === activeSegmentId ? ' is-active' : ''}`}
          key={segment.id}
          ref={segment.id === activeSegmentId ? activeSegmentRef : null}
        >
          <button className="story-route-viewer-timeline-segment-head" type="button" onClick={() => onJump(segment.startIndex)}>
            <span>{formatRange(segment.startIndex, segment.endIndex)}</span>
            <strong>{segment.title}</strong>
          </button>
          <p>{segment.summary}</p>
          {segment.keyEvents?.length > 0 && (
            <div className="story-route-viewer-timeline-events">
              {segment.keyEvents.map((event) => (
                <button type="button" key={`${segment.id}-${event.id}-${event.messageIndex}`} onClick={() => onJump(event.messageIndex)}>
                  <span>第 {event.messageIndex + 1} 楼</span>
                  <strong>{event.title}</strong>
                  {event.summary && <em>{event.summary}</em>}
                </button>
              ))}
            </div>
          )}
          {Array.from(branchPointsByMessage.entries())
            .filter(([messageIndex]) => messageIndex >= segment.startIndex && messageIndex <= segment.endIndex)
            .flatMap(([, points]) => points)
            .map((point) => (
              <button
                className="story-route-viewer-timeline-branch-suggestion"
                type="button"
                key={`${segment.id}-${point.id}-${point.messageIndex}`}
                onClick={() => onJump(point.messageIndex)}
              >
                <span>AI建议分支点 · 第 {point.messageIndex + 1} 楼</span>
                <strong>{point.title}</strong>
                <em>{point.reason}</em>
                {point.possibleRoutes?.length > 0 && <small>{point.possibleRoutes.join(' / ')}</small>}
              </button>
            ))}
        </section>
      ))}
    </div>
  );
}

function TimelineState({ text, tone = 'normal' }) {
  return <div className={`story-route-viewer-timeline-state ${tone}`}>{text}</div>;
}

function formatRange(startIndex, endIndex) {
  if (startIndex === endIndex) return `第 ${startIndex + 1} 楼`;
  return `第 ${startIndex + 1}-${endIndex + 1} 楼`;
}

function observeVisibleMessageIndex(setActiveMessageIndex) {
  let frame = 0;
  let observer = null;
  const chat = document.getElementById('chat') || document.body;
  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      setActiveMessageIndex(getVisibleMessageIndex());
    });
  };

  schedule();
  chat?.addEventListener?.('scroll', schedule, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  try {
    observer = new MutationObserver(schedule);
    observer.observe(chat || document.body, { childList: true, subtree: true });
  } catch {
    observer = null;
  }

  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    chat?.removeEventListener?.('scroll', schedule);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    observer?.disconnect();
  };
}

function getVisibleMessageIndex() {
  const messages = Array.from(document.querySelectorAll('#chat .mes'));
  if (messages.length === 0) return null;

  const viewportMiddle = window.innerHeight / 2;
  let best = null;
  let bestDistance = Infinity;
  messages.forEach((message) => {
    const rect = message.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const center = rect.top + rect.height / 2;
    const distance = Math.abs(center - viewportMiddle);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = getMessageElementIndex(message);
    }
  });

  return Number.isInteger(best) ? best : null;
}

function getMessageElementIndex(message) {
  const candidates = [
    message.getAttribute('mesid'),
    message.dataset?.mesid,
    message.dataset?.index,
    message.dataset?.idx,
    message.dataset?.messageId,
  ];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isInteger(number) && number >= 0) return number;
  }
  return null;
}
