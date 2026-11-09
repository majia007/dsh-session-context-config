# 上下文档位（dsh-session-context-config）

为新会话选择注入到上下文的**工具集合**与**系统提示词**。左侧栏顶部「上下文档位」入口打开配置面板；新会话与已有会话都能在会话头部切换档位。插件列表里这一行叫「会话上下文配置」，产品内仍按「档位」称呼。

## 档位模型

一个档位持有一份**三级状态表**：

```js
{
  groups:  { mcp: 'defer', platform: 'off', files: 'on' },  // 4 态：强制开启 / 开启 / 延迟 / 隐藏
  servers: { playwright: 'defer', 'legal-db': 'off' },     // 4 态，MCP 专有，离线也保留
  tools:   { mcp_connector_policy: 'off' },                 // 3 态：开启 / 延迟 / 隐藏
  prompt:  { mode: 'inherit' | 'replace' | 'complete', text },
  runtimeContext: true,
  channels: { timeContext: 'off' },                         // 可选：请求层拦截注入通道
  summaries: { mcp: '…' }                                   // 可选的目录摘要覆盖
}
```

解析自上而下，组与 server 只提供默认值，两个极端值压过子项：

```
组 = 强制开启 → 注入
组 = 隐藏     → 隐藏
server = 强制开启 → 注入
server = 隐藏     → 隐藏
工具 = 隐藏   → 隐藏
工具 = 延迟   → 延迟
组或 server = 延迟 → 延迟
否则           → 注入
```

`tools` 里没有条目就是「开启」；组被隐藏时子项记录**原样保留**，组重新打开即恢复。

## 三态怎么落地

| 状态 | 实现 | 效果 |
|---|---|---|
| 隐藏 | `agent.ctx.tools.restrict({ deny })` | 不发 schema，也调不到 |
| 延迟 | 在 agent 作用域重新注册一份瘦身定义，遮住继承来的完整定义 | tools 数组里保留名字 + 功能摘要 + **必需参数**；完整定义由 `tool_search` 以工具结果追加进历史 |
| 注入 | 不动 | — |

延迟采用**占位折叠**而非删除：tools 数组在整个会话里不变，`tool_search` 只往历史里追加定义，因此加载动作**不打断前缀缓存**。占位里的参数只留必需项，可选参数交给 `tool_search`——实测 25 个 MCP 工具从 12,889 字符降到 5,842 字符（-54.7%）。

`tool_search` 只在档位里存在延迟工具时才注册；它只返回定义，不执行工具。

## 生效边界

- **新会话**：`agent/created` 时按会话记录或“上次用过的档位”应用。
- **已开始的会话**：不自动跟随配置改动；在会话头部确认切换档位时才重算。
- **新连上的 MCP**：监听 `tools/change`，可见集合变化时按同一档位重算（那一刻 schema 本来就在变，不额外付缓存代价）。
- 子代理不套用档位，只作用于根会话；基线段与环境事实例外，它们对所有 agent 生效。

## 基线（所有新会话）

与档位无关的一层：新会话总会收到的稳定提示段与环境事实。默认全开，在配置面板「基线」卡里逐项关闭，关掉后从下一场新会话起生效。

| 开关 | 内容 | 落点 |
|---|---|---|
| 行为契约 | 不可逆动作先确认、如实汇报、信息足够就行动、跟随周边风格、不回读刚改的文件、声明 `<system-reminder>` 来源 | 全局 system 段，order 200 |
| 卡片回执 | UI 已渲染卡片时只回一句、不复述字段；失败仍给错误细节 | 全局 system 段，order 210 |
| 不可信下载 | 隔离空目录、以参数传路径、`python -I`（< 3.11 再补 `-P` 或换安全 cwd） | 全局 system 段，order 220 |
| 环境事实 | platform / OS 版本 / shell / git 分支与脏标记 | per-agent 运行时上下文，order 130 |
| complete 也保留基线 | `complete` 档位独占 developer 消息时，把上面三段并进去 | 装配时拼接 |

- 三段合计 1,758 字符（≈ 440 tokens @4 字符/token；按本插件 0.28 系数为 492）。契约段单独 800 字符 ≈ 200 tokens，在「增量 300 token 内」。
- 环境事实每会话探测一次并固定：`git status` 单次调用、600ms 上限、同目录 60s 缓存；git 缺失/超时降级为 `unknown`，不抛出、不阻塞会话。**会话内不复测**是缓存取舍——这段文本一变，宿主就会追加新的运行时快照消息，等于每次改动都重写请求前缀。
- `complete` 档位会把 developer 消息替换成唯一段，全局基线段在那时失效；同一模块负责 complete 装配，所以把基线并进那段文本。关掉「complete 也保留基线」即恢复旧的整段替换语义。
- 基线段对**所有 agent**（含子代理）生效；档位仍只作用于根会话。

## 提示词与运行时上下文的边界

`prompt` 与 `runtimeContext` 只覆盖 developer 提示词与 runtime-context 快照两条通道：

- `prompt.mode = 'replace'` 遮蔽部署 persona 前缀；`complete` 把 developer 消息整段替换为 `prompt.text`。**空文本是有效配置**：`complete` + 空 = developer 提示词清空；`replace` + 空 = 只清掉 persona 那一句（此前空文本被静默跳过、形同 inherit，已修）。工具教学段（exit code、后台任务、目标、编排、呈现规范等）由各工具插件在加载时无条件注册，`deny` 只隐藏 schema、不摘段落——想甩掉它们只能靠 `complete` 整段替换。
- `runtimeContext: false` 压掉快照里的**可选**段（文件策略、批准策略、checkout、GUI URL）；`当前工作目录` 段标了 `required`，DSH 装配时无条件补回，任何开关都拦不住。

档位管不到、只能部署级配置的 user 消息通道（档位级的请求层拦截见下方「通道拦截」）：

| 通道 | 注入者 | 部署级开关 |
|---|---|---|
| `<system-reminder>` 工作区指令 | agent-instructions 插件 | 配置 `maxBytes: 0`（禁用加载）或 `instructionFileCandidates: []`；或清空 `~/.dsh/AGENTS.md` 与项目指令文件 |
| `Time sampled …` 时间采样 | time-context 插件 | 调大 `refreshIntervalMs`，或从模型预设组成里摘掉该插件行 |
| 快照里的 `当前工作目录` | working-directory 服务 | 无（required，操作必需） |

注意：**设置→插件里的 agent-instructions 开关管不到这些注入**。桌面端主组成里该行本就是停用状态，真正注入来自「模型预设」自带的插件行（如 standard 预设带 agent-instructions 与 time-context）；来源级变更要走预设编辑器。

## 通道拦截（channels）

档位可以把上面前两条 user 消息通道从**发给模型的请求**里滤掉：

```js
channels: { workspaceInstructions: 'off', timeContext: 'off' }  // 只记录 off 项
```

| 通道 | 拦截的消息（`source.kind`） | 覆盖范围 |
|---|---|---|
| `workspaceInstructions` | `agent-instructions` | 全部工作区指令：`~/.dsh/AGENTS.md`、项目各级 AGENTS.md/CLAUDE.md、`*.local.md` 覆盖、会话中发现的子目录指令、文件变更增量更新 |
| `timeContext` | `time-context` | "Time sampled …" 时间采样 |

- 在 `agent/pre-step` 最外层按 `source.kind` 过滤；只作用于根会话，子代理不受影响。
- **会话记录不受影响**：消息仍写入历史、UI 轨迹可见，只是不再进入请求。
- 会话中途开启拦截（切换档位或改配置）会让请求前缀一次性变化，缓存从变化处重建。
- 与 `runtimeContext: false` 互不重叠：快照走 DSH 原生抑制，channels 只管这两条独立注入通道。

## 数据

`~/.dsh/session-context-config.json`（`DSH_HOME` 存在时以其为准）：

```json
{
  "version": 2,
  "lastUsedId": "none",
  "profiles": [{ "id": "lean", "...": "..." }],
  "sessions": { "<sessionId>": "lean" }
}
```

`sessions` 是**一次性记录**：写入后用于恢复会话时保持一致；`none` 表示“不处理”。

改名前这份文件叫 `context-profile.json`。首次启动会读旧文件、写新文件，然后把旧文件改名成 `context-profile.json.migrated`；已有档位与会话记录不会丢。要回滚旧版本，把 `.migrated` 改回原名即可。

## 接口

| 路由 | 用途 |
|---|---|
| `GET/POST /session-context-config/api/state` | 读快照 / 保存档位 |
| `GET /session-context-config/api/session?id=` | 某会话的逐工具状态（注入 / 延迟 / 隐藏 / 已取定义） |
| `POST /session-context-config/api/session` | 为某会话选定档位（`none` = 不处理） |
| `GET /session-context-config/api/preview?id=&profile=` | 干跑：某档位在该会话下的注入/延迟/隐藏清单 |
| `GET /session-context-config/api/assemble?id=` | 干跑一次装配，返回占位后的 schema 与字符总数 |

全部先过宿主 connection 信任栅栏（Host/Origin/浏览器会话认证，与官方 open-in-app 路由同款；宿主无该服务时回退回环 Host 校验）；POST 只接受 application/json。

## 验证记录（DSH Desktop 0.2.2-rc.1 / profile desktop）

| 项 | 结果 |
|---|---|
| 工具并集 | 61 个，12 个分组，MCP 25 个（治理） |
| 解析 | `lean`：注入 24 · 延迟 25 · 隐藏 12 |
| 占位 | 装配 50 个工具，其中 25 个占位；12,889 → 5,842 字符（-54.7%） |
| 加载 | `tool_search` 返回完整定义；会话内 tools 数组不变 |
| 缓存 | 加载只追加历史，不重建前缀 |
| 客户端 | bundle 已进 boot graph |

未验证：会话头部下拉菜单的像素级核对（与 hero 下拉同一套组件，DOM 已核对）。

## 已知限制

- 档位只减不增：不能给会话加工具。
- 占位只保留必需参数；直接调用而跳过 `tool_search` 时可能漏可选参数。
- MCP 业务工具若在会话内未激活（连接器的 `session_tools` 那层），加载 schema 也不等于激活。
- 同模式不同档位的会话不共享前缀缓存。
- complete 段落整个装配里只能有一个：部署或其它插件已注册 complete 时，档位再注册 complete 会让装配直接报错。

## 开发文档

- `AGENTS.md`：给编码代理的项目说明（构建、安装、坑库、注释与文档维护规则）。
- `docs/dsh-web-ui.md`：DSH Web UI 的设计 token、控件几何、槽位接入与验证配方——改界面先读它。
- `scripts/smoke.mjs`：`pnpm build && node scripts/smoke.mjs`，在 happy-dom 里渲染配置面板与两个 chip 并断言结构（依赖来自本项目 devDependencies）。
