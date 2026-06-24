# Story Route Viewer

Language: English | [简体中文](README.zh-CN.md)

Story Route Viewer is a SillyTavern frontend extension for turning the current character or group chat corpus into a story route map.

The goal is not to show chat files as a file manager. The goal is closer to a visual novel route map or a Detroit: Become Human style flowchart: find old branch points, understand route options, and jump back into the right chat quickly.

## Current MVP

The current MVP focuses on one workflow:

1. Open a character or group chat in SillyTavern.
2. Open Story Route Viewer from the extension menu.
3. Review the generated story graph.
4. Use Route List, Branch Inspector, Segment nodes, or Chat End nodes to jump back to a chat/message.

## Features

- Reads the current character or group chat list.
- Preserves empty chat files instead of dropping them.
- Shows corpus stats: chat count, total messages, empty chats.
- Builds a React Flow graph from the normalized corpus.
- Creates Segment nodes and Chat End nodes.
- Detects Branch nodes from shared prefixes.
- Uses SillyTavern native branch metadata when available:
  - `chat_metadata.main_chat`
  - `message.extra.branches`
- Handles incomplete branch corpora where child chats share the same `main_chat` but the parent chat file is missing.
- Shows a Route List for recognized branch routes.
- Highlights selected routes and branch-related nodes.
- Provides Inspector details for Segment, Branch, and Chat End nodes.
- Supports jump actions:
  - Segment: jump to start
  - Branch: jump to branch point
  - Route List route: jump to route start
  - Chat End: jump to final message
  - Empty chat: open chat only
- Shows clearer jump result messages, including fallback jumps.

## Not Implemented Yet

These are intentionally out of scope for the current MVP:

- AI route naming
- AI story markers
- Manual Story Marker UI
- Scenario UI
- Route Workspace UI
- Worldbook, Persona, Regex, Preset, or Notes binding
- Checkpoint detection or jump
- Swipe expansion or editing
- Create Branch from the map
- Persistent annotations/storage
- Server-side plugin
- Summary integration

## Installation

Install as a SillyTavern third-party extension.

For local manual installation, copy this folder into:

```text
SillyTavern/public/scripts/extensions/third-party/StoryRouteViewer
```

Then enable **Story Route Viewer** in SillyTavern's extension manager.

## Development

Install dependencies:

```bash
npm install
```

Run graph verification:

```bash
npm run verify:graph
```

Build the extension bundle:

```bash
npm run build
```

Build output is written to:

```text
dist/index.iife.js
dist/style.css
```

The extension entry is intentionally kept at root `index.js`. It mounts a lightweight menu first, then dynamically imports the built app with a cache buster. This makes local SillyTavern debugging much easier when a bundle error would otherwise hide the menu.

## Architecture

```text
index.js
  Root loader and fallback menu

src/st/*
  SillyTavern access only
  Reads corpus, imports ST modules, opens chats, scrolls to messages

src/graph/*
  Pure graph construction
  Normalizes routes, detects shared prefixes, creates nodes and edges

src/ui/*
  React UI
  React Flow canvas, Route List, Inspector, stats, jump controls
```

Important boundaries:

- UI does not fetch SillyTavern data directly.
- SillyTavern API access stays in `src/st/*`.
- Graph construction stays in `src/graph/*`.
- The graph consumes normalized corpus data, not raw SillyTavern payloads.

## Graph Model

Current node types:

- `root`: current character or group.
- `segment`: compressed story segment.
- `branch`: shared prefix divergence point.
- `chatEnd`: end of a chat file, including empty chats.

Current edge style is intentionally simple and direct. Layout is still an MVP layout, not a final visual-novel route-map layout.

## Branch Detection

Branch detection uses a conservative approach:

- Empty chats never participate in Branch nodes.
- Chats are grouped by ST native metadata first.
- Chats with the same filename branch family can be compared more loosely.
- Unrelated chats are not merged just because a same-depth text happens to match.
- Shared prefixes must pass minimum length and story-text checks.

Debug information is printed to the browser console as:

```text
[Story Route Viewer] Branch detection debug
```

## Manual Acceptance Checklist

After a build/sync in SillyTavern:

1. Open a character or group chat.
2. Open **Story Route Viewer** from the extension menu.
3. Confirm stats show total chats, total messages, and empty chat count.
4. Confirm empty chats appear as Empty Chat nodes and do not crash the graph.
5. Confirm Branch Point nodes appear for chats that share a real branch origin.
6. Click a Branch Point and check the Inspector route list.
7. Click a Route List item and confirm the related graph nodes highlight.
8. Use Jump actions and confirm SillyTavern opens the right chat/message.
9. Confirm jump success/fallback/error messages are understandable.

## Current Known Limits

- Segment titles are simple text previews, not semantic story titles.
- Each unbranched route segment is still a structural compression, not an AI summary.
- Branch detection depends on available chat files and metadata quality.
- Layout is functional but not yet a polished galgame route-map layout.
- Large corpora may still need future layout and filtering work.
