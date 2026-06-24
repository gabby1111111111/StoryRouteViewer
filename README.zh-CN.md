# Story Route Viewer

语言：[English](README.md) | 简体中文

Story Route Viewer 是一个 SillyTavern 前端扩展，用来把当前角色或群聊的聊天语料转换成剧情路线图。

它的目标不是把 chat 文件显示成文件管理器。它更接近 Visual Novel Route Map 或 Detroit: Become Human 风格的流程图：帮你找回旧的剧情分叉点，看懂不同路线，并快速跳回对应聊天继续游玩。

## 当前 MVP

当前 MVP 聚焦一个核心流程：

1. 在 SillyTavern 中打开一个角色或群聊。
2. 从扩展菜单打开 Story Route Viewer。
3. 查看自动生成的剧情分叉地图。
4. 通过 Route List、Branch Inspector、Segment 节点或 Chat End 节点跳回对应 chat/message。

## 已支持功能

- 读取当前角色或群聊的 chat 列表。
- 保留空 chat 文件，不会因为消息数为 0 而丢失。
- 显示语料统计：chat 数量、总消息数、空 chat 数量。
- 基于规范化后的 corpus 构建 React Flow 图。
- 生成 Segment 节点和 Chat End 节点。
- 基于共同前缀识别 Branch 节点。
- 优先使用 SillyTavern 原生分支元数据：
  - `chat_metadata.main_chat`
  - `message.extra.branches`
- 支持不完整分支语料：如果多个子 chat 指向同一个 `main_chat`，即使父 chat 文件缺失，也会归为同一分支家族。
- 显示 Route List，用来快速浏览已识别路线。
- 支持选中路线和分支相关节点高亮。
- 支持 Segment、Branch、Chat End 的 Inspector 详情面板。
- 支持跳转：
  - Segment：跳到剧情段起点
  - Branch：跳到分叉点
  - Route List：跳到该路线分叉后的起点
  - Chat End：跳到最后一条消息
  - Empty chat：只打开 chat，不滚动
- 跳转后显示更明确的结果提示，包括 fallback 跳转。

## 当前不实现

这些能力目前故意不放进 MVP：

- AI 路线命名
- AI Story Marker
- 手动 Story Marker UI
- Scenario UI
- Route Workspace UI
- Worldbook、Persona、Regex、Preset、Notes 绑定
- Checkpoint 检测或跳转
- Swipe 展开或编辑
- 从地图创建 Branch
- 持久化 annotations/storage
- 服务端插件
- Summary 集成

## 安装

作为 SillyTavern 第三方扩展安装。

手动安装时，把本文件夹复制到：

```text
SillyTavern/public/scripts/extensions/third-party/StoryRouteViewer
```

然后在 SillyTavern 的扩展管理器中启用 **Story Route Viewer**。

## 开发

安装依赖：

```bash
npm install
```

运行图构建验证：

```bash
npm run verify:graph
```

构建扩展：

```bash
npm run build
```

构建产物会输出到：

```text
dist/index.iife.js
dist/style.css
```

扩展入口刻意保留在根目录 `index.js`。它会先挂载一个轻量菜单，再带 cache buster 动态导入构建后的应用。这样在本地 SillyTavern 调试时，如果 bundle 出错，也不会导致菜单完全消失。

## 架构

```text
index.js
  根加载器和 fallback 菜单

src/st/*
  只放 SillyTavern 访问逻辑
  读取 corpus、导入 ST 模块、打开 chat、滚动到消息

src/graph/*
  纯构图逻辑
  规范化 route、识别共同前缀、创建节点和边

src/ui/*
  React UI
  React Flow 画布、Route List、Inspector、统计面板、跳转控件
```

重要边界：

- UI 不直接 fetch SillyTavern 数据。
- SillyTavern API 访问只放在 `src/st/*`。
- 构图逻辑只放在 `src/graph/*`。
- graph 消费规范化后的 corpus，不直接依赖 SillyTavern raw payload。

## 图模型

当前节点类型：

- `root`：当前角色或群聊。
- `segment`：压缩后的剧情段。
- `branch`：共同前缀后的分叉点。
- `chatEnd`：chat 文件结束点，包括空 chat。

当前边和布局保持 MVP 简洁实现。它已经可用，但还不是最终 galgame 路线图视觉。

## Branch 检测规则

Branch 检测采用保守策略：

- 空 chat 不参与 Branch 节点。
- 优先根据 ST 原生 metadata 对 chat 分组。
- 同一个文件名分支家族内，可以使用更宽松的长文本前缀比较。
- 不会因为不同 chat 在同一深度碰巧出现相同文本，就把无关开局强行合并。
- 共同前缀必须满足最小消息数、最小文本长度和 story-text 检查。

调试信息会打印到浏览器控制台：

```text
[Story Route Viewer] Branch detection debug
```

## 手动验收清单

在 SillyTavern 中 build/sync 后：

1. 打开一个角色或群聊。
2. 从扩展菜单打开 **Story Route Viewer**。
3. 确认统计面板显示 chat 总数、总消息数、空 chat 数。
4. 确认空 chat 显示为 Empty Chat 节点，并且图不会崩溃。
5. 确认有真实共同分支来源的 chats 会生成 Branch Point。
6. 点击 Branch Point，检查 Inspector 中的路线信息。
7. 点击 Route List 中的路线，确认图上对应节点高亮。
8. 使用 Jump 按钮，确认 SillyTavern 能打开正确 chat/message。
9. 确认 Jump 成功、fallback、失败提示都能看懂。

## 当前已知限制

- Segment 标题只是文本预览，不是语义剧情标题。
- 未分叉 route 的 Segment 只是结构压缩，不是 AI 总结。
- Branch 检测依赖当前可读取的 chat 文件和 metadata 质量。
- 布局已经可用，但还不是最终 galgame 路线图视觉。
- 大型语料后续仍需要布局、筛选和可读性优化。

