# AGENTS.md

Stable project rules for future agents working on StoryRouteViewer.

## Scope

- StoryRouteViewer is a SillyTavern frontend extension that renders a current character/group chat route map.
- MVP goal: help users find previous story branch points and jump back into the matching chat/message.
- Do not treat this as a generic chat-file manager. Product language should stay close to route maps, branch points, story segments, and endings.

## Project Structure

- `index.js`: small SillyTavern loader/fallback menu. Keep it lightweight so plugin load errors are visible.
- `manifest.json`: SillyTavern extension manifest; keep `js` pointing at the root loader, not directly at the Vite bundle.
- `style.css`: root stylesheet that imports built CSS.
- `src/st/*`: the only place for SillyTavern API/context/navigation access.
- `src/graph/*`: graph construction, fixtures, and route/branch algorithms.
- `src/ui/*`: React UI and React Flow rendering. UI should consume normalized corpus/graph data, not fetch ST data directly.
- `dist/`: built runtime files copied into SillyTavern. Include updated `dist/index.iife.js` when committing runnable changes.

## Commands

- Validate graph fixtures: `npm run verify:graph`
- Build plugin: `npm run build`
- Standard verification after code changes: run `npm run verify:graph`, then `npm run build`.

## SillyTavern Loading Rules

- Use the root loader pattern: `manifest.json -> index.js -> dist/index.iife.js`.
- Keep the loader capable of mounting a fallback menu before importing React/React Flow.
- Keep the browser `process.env.NODE_ENV` shim in the loader/Vite config path; React dependencies may reference `process`.
- Use a cachebuster when importing the built bundle during local development so refreshed ST pages load the current build.
- Hide React Flow attribution in the modal and keep scoped CSS fallbacks for ST theme interference.

## Data and Graph Rules

- Corpus must preserve all chat files, including empty chats. `chatCount` equals the number of ST chat files; `totalMessages` counts actual messages only.
- Build graph from normalized corpus only. Do not read raw SillyTavern payloads inside `src/graph/*`.
- SillyTavern `chat_metadata.main_chat` is the primary branch structure signal.
- `message.extra.branches` may be absent in real chats; when absent, use `main_chat` to build parent-child structure and text comparison only to infer the best branch message index.
- A chain like `base -> Branch #1 -> Branch #2` must render as nested BranchNodes, not as three sibling routes.
- Filename family matching is only a high-risk fallback when ST metadata is unavailable and at least one file has a `- Branch #N` suffix.
- Common text prefix matching is an auxiliary signal. Do not globally merge unrelated openings just because same-depth text is similar.
- Empty chats and unmerged routes should remain visible and explain why they were not merged.

## Navigation Rules

- Navigation belongs in `src/st/navigation.js`.
- For jump actions, close the heavy modal first, then open the target chat and scroll.
- Prefer ChatVault-style message lookup: wait for context chat length, target `.mes` by multiple message id selectors, and call ST show-more APIs only when the target message is above the loaded window.
- Do not implement branch creation, checkpoint, swipe editing, AI summaries, or storage unless explicitly requested.

## UI Rules

- React Flow is the route-map canvas. Keep BranchNode/SegmentNode/ChatEndNode data inspectable.
- Inspector should show branch source, branch risk, ST branch point, graph reason, and navigation errors when available.
- Avoid large UI redesigns while logic accuracy is still under active development.

## Memory and Documentation Rules

- Put stable project-specific rules here.
- Put tentative notes, one-off discoveries, and user-facing devlog in `.memory/`.
- Put broadly reusable SillyTavern plugin lessons in `.memory/skill-candidates` first, unless the user explicitly asks to update a skill.
- Do not put private chat contents, API keys, cookies, `.env`, or account data in this file.
- Before finishing a task, check whether AGENTS.md needs a short update and whether any old rule is now stale.

## Local Notes

Private/local context. Do not generalize to public docs.

- Main workspace: `E:\ST_Branch`
- Source repo: `E:\ST_Branch\StoryRouteViewer`
- Local SillyTavern root: `E:\SillyTaven\SillyTavern`
- Installed extension path: `E:\SillyTaven\SillyTavern\public\scripts\extensions\third-party\StoryRouteViewer`
- Preferred local ST URL: `http://192.168.1.5:8000/`
- Sync helper:
  `powershell -ExecutionPolicy Bypass -File C:\Users\MR\.codex\skills\sillytavern-local-dev\scripts\sync-plugin.ps1 -PluginName StoryRouteViewer -SourceRoot E:\ST_Branch -SillyTavernRoot E:\SillyTaven\SillyTavern`
- For this user's workflow, after syncing open the ST page and stop; the user usually performs plugin UI checks manually.
