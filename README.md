# 上下文档位（@jia-tools/dsh-session-context-config）

为新会话选择注入到上下文的**工具集合**与**系统提示词**。左侧栏顶部「上下文档位」入口打开配置面板；新会话与已有会话都能在会话头部切换档位。插件列表里这一行叫「会话上下文配置」，产品内仍按「档位」称呼。

## 安装

要求 DSH `>=0.2.2-rc.1 <0.3.0`（prerelease 参与匹配）。

```sh
dsh plugin --profile <profile> add @jia-tools/dsh-session-context-config
```

桌面端 / Web 在「插件」页搜索 `@jia-tools/dsh-session-context-config` 安装。bundle 集变化需重启对应 profile 后生效；档位只作用于新会话，已有会话不回改。

本地源码安装（开发）：`dsh plugin --profile <profile> add <本目录>`；改代码后 `pnpm build`——client bundle 由桌面自带 HMR 自动热更（约 1s，不要刷新页面），Host 侧改动用插件页该行 disable → enable 或重启宿主。

## 档位模型

一个档位持有一份**三级状态表**：

```js
{
  groups:  { mcp: 'defer', platform: 'off', files: 'on' },  // 4 态：强制开启 / 开启 / 延迟 / 隐藏
  servers: { playwright: 'defer', 'legal-db': 'off' },     // 4 态，MCP 专有，离线也保留
  tools:   { mcp_connector_policy: 'off' },                 // 3 态：开启 / 延迟 / 隐藏
  prompt:  {                                                // 部署人设两个槽位，各自独立
    prefix: { enabled: true, override: false, text: '' },   // order 0，身份声明之后
    suffix: { enabled: true, override: false, text: '' },   // order 10200，提示词最末
  },
  contexts: { 'harness:source': false },                    // 运行时上下文逐项开关：只记关掉的项
  sections: { 'tool:read': false },                         // system 段逐项开关：只记关掉的项
  channels: { timeContext: 'off' },                         // 可选：请求层拦截注入通道
  summaries: { mcp: '…' }                                   // 兼容保留：面板不再编辑，Host 仍按它生成延迟占位摘要
}
```

`contexts` 的键是宿主实际注册的运行时上下文名，缺省=注入，只存 `false`。面板从当前会话的装配结果动态列出（`/api/state` 的 `contexts`）：当前工作目录、沙箱/文件策略、审批策略、根代理身份、子代理委派深度、环境事实、DSH 源码 checkout、DSH Web GUI 地址都会自动出现；新版本或第三方插件新增的上下文，即使没有内置中文名，也会按原始 name 自动补一行。旧版本读入时一次性迁移：`runtimeContext:false` → 所有可选上下文 `false`，`workingDirectory:false` → 当前工作目录 `false`，`baseline.environmentFacts:false` → 每个旧档位的环境事实 `false`；迁移后都按档位单独调整。

`sections` 的键是宿主/插件实际注册的 system 段名，缺省=包含，只存 `false`。面板从当前会话的装配结果动态列出（`/api/state` 的 `sections`），未知新段按原始 name 显示；人设两个槽位与附加规则段由专用开关控制。**工具引导段（`tool:*`）不进这张表**——它强绑定工具的启用状态，由 Host 自动隐藏/显示（复合段看成员），面板不提供单独开关；旧状态里的 `tool:*` 键读入时剪掉。

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
| 延迟 | 在 agent 作用域重新注册一份瘦身定义，遮住继承来的完整定义 | tools 数组里保留名字 + 功能摘要 + **参数类型骨架**（每个参数的名称与类型都在，只剥说明/示例/默认值）；完整定义由 `tool_search` 以工具结果追加进历史 |
| 注入 | 不动 | — |

延迟采用**占位折叠**而非删除：tools 数组在整个会话里不变，`tool_search` 只往历史里追加定义，因此加载动作**不打断前缀缓存**。占位里的参数只留必需项，可选参数交给 `tool_search`——实测 25 个 MCP 工具从 12,889 字符降到 5,842 字符（-54.7%）。

`tool_search` 只在档位里存在延迟工具时才注册；它只返回定义，不执行工具。

面板里的工具行在名字右侧并排显示两枚标签，都走宿主 `Tag` 胶囊、带一圈描边：

- **状态标签**：显示**最终生效状态**的三个值——`开启`（绿）/ `延迟`（琥珀）/ `隐藏`（中性灰）。组 / server 的选择会压过工具级选择；被改写时悬停标签可看到「生效 / 本行选择」的对照，未被改写时不带 tooltip。
- **token 标签**：该工具定义的估算占用（`≈267`），用默认的描边灰标签，与状态标签并排；行尾不再有独立的 token 列。
- **来源行**：名字下方一行灰字 `来源 · 会话桥`，回答「这个工具来自哪个插件」。插件包有本地化标题就用标题，否则用包短名；悬停可看完整包名、Loader 入口与判定方式（注册时捕获 / 官方工具目录 / 入口产物推断，推断结果带虚线下划线）。MCP 工具显示 `MCP · <server>`；宿主自带但当前版本定位不到实现包的显示 `DSH 内置`；证据不足时显示 `来源 · 未识别`，不猜。

## 内置档位

| 组 | 完整 | 精简 | 极简 |
|---|---|---|---|
| 文件 / 搜索 / 终端与任务 | 开启 | 开启 | 开启 |
| 平台（工作目录、随包依赖路径、lsp） | 开启 | 开启 | **开启** |
| 交互 / 技能与网络 / 协作 | 开启 | 开启 | 隐藏 |
| 编排与计划 / 调度 / 目标 | 延迟 | 隐藏 | 隐藏 |
| MCP / 其他（第三方工具） | 延迟 | 延迟 | 隐藏 |
| 插件开发（`plugin_manager` / `cordis_*`） | 延迟 | 隐藏 | 隐藏 |

- **完整**：全部能力可用，非常用能力（编排、目标、调度、MCP、第三方、插件开发）以「延迟」形式折叠，需要时由 `tool_search` 取回。
- **精简**：在完整基础上隐藏编排与计划、调度、目标、插件开发；MCP 与第三方工具仍延迟。
- **极简**：在精简基础上再隐藏交互、技能与网络、协作、MCP、第三方工具；只保留读写、搜索、终端与平台基础。
- 工具引导段强绑定工具/组状态：`pwsh` / `jobs` / `goal` / `workflow` 等静态引导在工具或组隐藏时由 Host 自动移除（复合段 jobs/goal/schedule/session-query 看成员，至少一个成员开启/延迟才保留）；工具恢复后自动恢复。**不在面板单独配置**，隐藏状态由下方工具目录控制。

状态版本为 v4：旧 v2/v3 状态读入时会**就地替换** `full` / `lean` / `minimal` 三个内置档位的定义（不新增缺失的内置档位），自定义档位、会话映射与 baseline 原样保留。

## system 段开关（sections）

配置页按**最终请求里的消息**分卡：`系统提示词`、`运行时上下文快照`、`工作区指令`、`时间采样`、`其他注入消息（自动发现）`（角色由卡片右上角的 `role: developer` / `role: user` 标签表达）。每张卡里可单独配置的项都保留「checkbox + 内容说明」的统一格式；自动发现的每个 kind 也可按行关闭。

`system 消息` 卡内：

- **两个独立的人设槽位**：`deployment:persona-prefix`（order 0，固定身份声明之后、所有第一方指导之前，"你是谁"——角色、语气、能力边界与工作方式；改它会破坏前缀缓存）与 `deployment:persona-suffix`（order 10200，所有第一方指导之后、提示词最末，"收尾叮嘱"——环境提醒、输出格式、最后一条硬约束；改它不影响前面可复用的前缀）。两者各自一条开关 + 一条「覆盖部署文本」+ 文本域：关掉 = 不发送该槽位；不覆盖 = 沿用部署 `personaPrefix` / `personaSuffix`；覆盖且文本非空 = 替换该槽位；覆盖且为空 = 不发送该槽位。
- 其余各段在同一个列表里按**实际装配顺序**排列（不再分「宿主固定段 / 工具使用引导」小区域）：`harness:identity`（-1000，最前）、人设前缀（0）、`context:file-reference`、`harness:source`、`app:web-surface`、人设后缘（10200）等，逐段开关。
- **工具引导段（`tool:*`）不在这里配置**：它们强绑定工具状态——工具或组隐藏时 Host 自动从装配里移除，工具恢复（开启/延迟）时自动回来。复合段（`tool:jobs` / `tool:goal` / `tool:schedule` / `tool:session-query`）看成员工具，至少一个成员不是隐藏才保留。面板不列这些行，避免出现「段开关和工具开关打架」。
- **条件段**：MCP 服务器指令（`mcp:<server>`）、MCP 资源服务器、PTC 模式（`tools:ptc-only` / `tools:sdk`）、计划模式（`plan:policy`）、团队协作（`team:policy`）、浏览器 / Computer Use 等，出现时才在列表里生效；未识别的新段按原始 name 自动列入。新版本/第三方插件注册段不需要改本插件即可出现。
- **悬停看正文**：普通段、两个人设槽位与「覆盖部署文本」行都带 `title`，内容是该段当前实际注入的文本（模板变量已按本次装配渲染）；关闭的段也会给出关闭前的文本，便于确认关掉的是什么。上下文行同样如此（空文本显示「当前未出现」）。
- **附加规则**：行为契约 / 卡片回执 / 不可信下载 / 自定义文本 4 项，全局开关（所有新会话与子代理），用「本插件附加 · 全局」小标题与分割线分隔，固定排在列表最后（提示词 order 20000+，是所有宿主段之后）；三段固定文本在面板里悬停可见注入全文（保留换行）。

被关掉但当前装配里没有出现的已知段仍会列出来（否则条件段关掉后就找不到重新开启的入口），但 `meta` 会标成「已关闭 · 当前未出现」，tooltip 说明可能是条件未触发或提供它的插件/预设未装载。实现：在已有的 `system-prompt/assemble` 瀑布里按 `profile.sections` 过滤 `assembly.sections`（与过滤 contexts 同一处），同时按工具的生效状态裁掉 `tool:*` 引导段（`hiddenToolGuide`：组/工具隐藏即隐藏，复合段看成员）。`refreshContext` 不会重跑 sections，所以不需要像 contexts 那样注册影子段。**该瀑布按 agent scope 过滤派发，监听器必须带 `global: true`**（否则真机上收不到事件，单测直接调 listener 发现不了）。`sccFullSections` 是面板列目录用的私有旁路，返回未过滤的完整段名单，不影响请求路径；面板目录会再剔除 `tool:*`（它们不单独配置）。段顺序由宿主 `order` 固定，本面板只控制是否包含。

## 注入内容的自动发现

面板不维护「段 / 上下文 / 注入消息」的全量名单，每次 `/api/state` 现算：

1. 对每种 live agent preset 挑一个限制最少的根会话干跑一次 `systemPrompt.assemble({ ..., sccFullSections: true })`（最多 8 份），按 name 取并集（空影子被另一档位的非空正文覆盖）。`sections` 与 `contexts` 来自宿主和所有已装载插件（含第三方）的注册面，模板变量按各自装配渲染；空段不列、`tool:*` 不列（强绑定工具状态，不单独配置），空上下文保留（面板显示「当前未出现」）。
2. 从 live 根会话的历史消息聚合 user 角色、非人类输入的 `source.kind`（工作区指令/时间采样/技能目录/计划模式等）；**按档位分组**：每个档位只统计使用了该档位的会话，同 kind 的次数在组内相加，并行会话的 kind 不串档。组内再合并 `agent/pre-step` 运行时观察到的消息（被通道关掉、没落盘的消息也能看见，且同样按档位归属）。
3. 工具目录枚举全部 preset 组合里的工具，第三方工具随目录出现。

所以 DSH 升级或新装插件带来新的 system 段、运行时上下文、工具或注入消息时，不需要改本插件代码；重新打开面板（或点「重新读取」）就会看到。已知中文名/说明只决定呈现质量，不决定是否出现。

调用时机：**不是按模型请求或定时器跑的**。快照在以下场景计算：页面首次挂载用到快照的组件（面板或 chip，store 为空时一次）、手动「重新读取」、保存（POST 响应带快照）、切换档位（`/api/session` POST 响应带快照）。同一页面内快照由 client store 复用，不轮询。单次最多 8 份装配；工具目录另有 15 秒缓存。版本/插件变化不会主动触发重算，下次拉快照时自然看到新内容。

## 工具说明中文显示

工具行描述**默认显示中文**，末尾的「文A」按钮切回/切回中文：

- **已知工具**：中文说明内置在插件里（`src/client/panel/translations.ts`，key 是原始描述文本），直接显示，不联网。
- **未知工具**（新装的第三方插件、MCP 服务等）：挂载时自动按需翻译——`POST /session-context-config/api/translate` 用当前 profile 的默认模型翻译，期间按钮显示「翻译中…」，完成后显示中文；失败显示「翻译失败」，点一下重试。请求串行执行，避免一次打开面板同时打很多模型请求。
- 每个工具的显示语言（中文 / 原文）按工具名记在 localStorage（`dsh-session-context-config:tool-lang`），默认中文；切回原文的工具下次打开仍显示原文。
- 译文按**原始文本**做 key 缓存在 `$DSH_HOME/session-context-config-translations.json`，同一段描述只翻一次；工具描述变化后旧译文不会被误用（key 对不上就重新翻译）。
- 描述**完整显示**：列宽不够就折行（不再用省略号截断），一行工具因此可能占多行；组 / server 标题里不再有「摘要」编辑入口。延迟占位用的摘要仍由 Host 按「server 手写 > 组手写 > 该工具描述首句」生成，`profile.summaries` 只作兼容保留（历史值继续生效）。
- 只影响配置面板显示，**不改模型侧的工具 schema、延迟摘要或 `tool_search` 输出**。翻译调用不写会话记录。

## 生效边界

- **新会话**：`agent/created` 时按会话记录或“上次用过的档位”应用。
- **已开始的会话**：不自动跟随配置改动；在会话头部确认切换档位时才重算。
- **工具表变化（新连上的 MCP、插件热重载）**：监听 `tools/change`，可见集合变化时就地按同一档位**增量**刷新延迟占位与隐藏面——只注册新增的、撤销消失的，未变化的工具保持原注册对象。不能整份重建：宿主每个 step 按「定义 + 注册」的对象身份校验准入集，整份重建会让该 step 内所有延迟工具立刻报 `unknown tool`（实测插件重载后必现，下一个 step 自愈）。插件被停用、工具从工具表消失时，对应占位也会撤销，不会留下仍可调用的旧工具。
- 子代理不套用档位，只作用于根会话；附加规则段例外（对所有 agent 生效）。环境事实是运行时上下文：根会话按档位 `contexts` 过滤，子代理没有档位，默认保留。

## 附加规则（所有新会话）

与档位无关的一层：新会话总会收到的三段固定提示词，外加一段可自由编辑的自定义文本。三段默认全开；自定义文本默认关闭且为空。在配置面板 system 消息卡的最下方（所有段之后）逐项调整，改动保存后从下一场新会话起生效。

| 开关 | 内容 | 落点 |
|---|---|---|
| 行为契约 | 不可逆动作先确认、如实汇报、信息足够就行动、跟随周边风格、不回读刚改的文件、声明 `<system-reminder>` 来源 | 全局 system 段，order 20000 |
| 卡片回执 | UI 已渲染卡片时只回一句、不复述字段；失败仍给错误细节 | 全局 system 段，order 20010 |
| 不可信下载 | 隔离空目录、以参数传路径、`python -I`（< 3.11 再补 `-P` 或换安全 cwd） | 全局 system 段，order 20020 |
| 自定义文本 | 自由输入（支持多行，≤20000 字符）；勾选才注入，未勾选也可先编辑，留空不发送 | 全局 system 段，order 20030 |

- 前三段在面板里悬停任意一行，可看到原样注入 system 的完整文本（tooltip 保留换行）；自定义文本行悬停显示当前输入的内容。
- 三段固定文本合计 573 字符（契约段单独 253 字符），内容固定、不随会话变化。中文正文的字符数与 token 数不是 4:1 的关系，面板里那个 0.28 token/字符 系数是为 JSON schema 标定的，不要拿它折算这三段。
- 四项是全局 system 段，与其它段按 order 拼接；order 取 20000+，排在所有宿主段（最大 10200）之后，成为 system 消息的收尾。没有 complete 整段独占模式，也没有「极简提示词也保留附加规则」开关（随 complete 移除）。
- 附加规则段对**所有 agent**（含子代理）生效；档位仍只作用于根会话。
- **环境事实不再属于附加规则**：它是 `contexts` 里的 `session-context-config:environment`，在「运行时上下文快照」卡里按档位开关；每会话探测一次并固定，`git status` 单次调用、600ms 上限、同目录 60s 缓存，缺失/超时降级为 `unknown`，不抛出、不阻塞会话。

## 提示词与运行时上下文的边界

`prompt` / `sections` / `contexts` 分别覆盖 system 消息内的人设段、其它 system 段与 runtime-context 快照：

- `prompt.prefix` / `prompt.suffix` 分别控制两个部署人设槽位，各自 `enabled/override/text`：`enabled = false` → 该槽位不发送；开启且 `override = false` → 沿用部署 `personaPrefix` / `personaSuffix`；`override = true` → 用 `text` 替换该槽位（空文本 = 不发送该槽位）。两个槽位互不影响。
- `sections` 按段名过滤 system 消息：identity、宿主/插件段、checkout/Web 说明、MCP/PTC/计划模式等都可逐段关闭。人设两个槽位与附加规则段受保护，分别走专用开关；**工具引导段（`tool:*`）不落 `sections`**，强绑定工具的启用状态（工具隐藏则引导隐藏），面板不提供单独开关。段顺序由宿主 `order` 固定。
- `contexts` 把运行时上下文逐个开关：当前工作目录、沙箱/文件策略、审批策略、根代理身份、子代理委派深度、环境事实、DSH 源码 checkout、DSH Web GUI 地址；装配里出现的新 name 会自动补行。缺省=注入，只记录关掉的项。
- 关掉的上下文在 agent 作用域注册同名非 required 空上下文遮住 required 标志，再由最外层 `system-prompt/assemble` 按名字删除；这样 `refreshContext` 不会把 required 段（如当前工作目录）补回来。关闭当前工作目录后，模型需要自己跑 `pwd` 确认目录。

档位管不到、只能部署级配置的 user 消息通道（档位级的请求层拦截见下方「通道拦截」）：

| 通道 | 注入者 | 部署级开关 |
|---|---|---|
| `<system-reminder>` 工作区指令 | agent-instructions 插件 | 配置 `maxBytes: 0`（禁用加载）或 `instructionFileCandidates: []`；或清空 `~/.dsh/AGENTS.md` 与项目指令文件 |
| `Time sampled …` 时间采样 | time-context 插件 | 每个 step 检查一次，默认 `refreshIntervalMs=600000`（10 分钟）最多一条；调大该值或从模型预设组成里摘掉该插件行 |
| 快照里的 `当前工作目录` | working-directory 服务 | 档位级 `contexts` 里的 `working-directory:current: false`（关掉后模型需自己 `pwd`） |

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
- **过滤发生在消息落盘之前**：被滤掉的消息不写会话记录，已记录的历史不回改。
- 会话中途开启拦截（切换档位或改配置）会让请求前缀一次性变化，缓存从变化处重建。
- 与 `contexts` 的运行时上下文开关互不重叠：上下文走 assembly 按名过滤，channels 只管这两条独立注入通道。
- **自动发现清单**：面板在两张通道卡下方列出**当前档位**的 live 根会话里观察到的其它 user 消息来源（`source.kind`，含第三方插件），按 kind 聚合次数并给出最近一次正文。来源是组内会话历史 + `agent/pre-step` 运行时观察（被通道关掉的消息也会被记下），新版本/新插件开始注入后自动出现。**每行可关闭**：写 `channels[kind]='off'`，Host 的 pre-step 过滤器按同一键剔除；已知两条通道仍走上面的专用卡。列表底部还可以**手动输入一个 kind** 提前关闭（当前会话还没出现过的来源也能先拦住，会以「手动」行保留在配置里）。运行期消息可能承载插件状态同步（子代理完成、压缩检查点、目标轮次），不确定就保持开启。
- **`kind` 与 `channels` 的区别**：`source.kind` 是消息上的来源标签（如 `agent-message`、`compact-checkpoint`、`runtime-context`、`skill-catalog`）；`profile.channels` 是开关表，键是 kind、值是 `'off'`。已知两条通道的键是界面 id（`workspaceInstructions` / `timeContext`），Host 会映射到 `agent-instructions` / `time-context`；其余键直接当作 `source.kind`。所以「关掉某个 kind」= 往 `channels` 里写这个 kind。
- 已知通道行的 `title` 显示最近一次注入正文；通道关闭时提示「后续请求会滤掉该来源」。

## 数据

`~/.dsh/session-context-config.json`（`DSH_HOME` 存在时以其为准）：

```json
{
  "version": 4,
  "lastUsedId": "none",
  "profiles": [{ "id": "lean", "...": "..." }],
  "sessions": { "<sessionId>": "lean" }
}
```

`sessions` 是**一次性恢复记录**：写入后用于重开旧会话时恢复档位；`none` 表示“不处理”。映射有界保留最近 500 条，更旧的会话重开时回落 `lastUsedId`。

版本 2/3 读入时自动迁移到 4：`prompt.mode` 的 `inherit` → `override:false`，`replace`/`complete` → `override:true`（文本保留；complete 的整段独占语义已移除），`sections` 默认空，`baseline.inCompletePrompt` 丢弃。人设从单个 `prompt.{enabled,override,text}` 扩成 `prompt.prefix` / `prompt.suffix` 两个槽位时，旧扁平字段整体迁到 `prefix`，`suffix` 默认 `{enabled:true, override:false, text:''}`（沿用部署）。v3→v4 还会**就地替换**三个内置档位的定义（新的分组拆分与默认延迟策略），自定义档位与 `sessions` 映射保留。

改名前这份文件叫 `context-profile.json`。首次启动会读旧文件、写新文件，然后把旧文件改名成 `context-profile.json.migrated`；已有档位与会话记录不会丢。要回滚旧版本，把 `.migrated` 改回原名即可。

## 接口

| 路由 | 用途 |
|---|---|
| `GET/POST /session-context-config/api/state` | 读快照 / 保存档位（`sections[].text` 与 `contexts[].text` 是实际注入正文，`channelsByProfile` 是按档位分组的两条已知通道最新正文，`observedChannelsByProfile` 是按档位分组的注入消息清单；`tools[].source` 带来源标注，`sources` 是解析诊断计数） |
| `GET /session-context-config/api/session?id=` | 某会话的逐工具状态（注入 / 延迟 / 隐藏 / 已取定义） |
| `POST /session-context-config/api/session` | 为某会话选定档位（`none` = 不处理） |
| `GET /session-context-config/api/preview?id=&profile=` | 干跑：某档位在该会话下的注入/延迟/隐藏清单 |
| `GET /session-context-config/api/assemble?id=` | 干跑一次装配，返回占位后的 schema、字符总数，以及 `refreshContext` 复核后的上下文名单 |
| `POST /session-context-config/api/translate` | 按需翻译一段工具描述（`{text}` → `{ok, zh}`），文本 key 命中缓存直接返回；仅供面板显示 |

全部先过宿主 connection 信任栅栏（Host/Origin/浏览器会话认证，与官方 open-in-app 路由同款；宿主无该服务时回退回环 Host 校验）；POST 只接受 application/json。

## 验证记录（DSH Desktop 0.2.2-rc.1 / profile desktop）

| 项 | 结果 |
|---|---|
| 工具并集 | 61 个，12 个分组，MCP 25 个（治理） |
| 解析 | `lean`：注入 24 · 延迟 25 · 隐藏 12 |
| 占位 | 装配 50 个工具，其中 25 个占位；12,889 → 5,842 字符（-54.7%） |
| 加载 | `tool_search` 返回完整定义；会话内 tools 数组不变 |
| 缓存 | 加载只追加历史，不重建前缀 |
| 上下文逐项开关 | 只关 `harness:source` 时，`contexts`/`refreshedContexts` 无该段、其余仍在；关 `working-directory:current` 时两者都无 cwd；环境事实开启时 180 字符（真机） |
| system 段逐项开关 | 单测 + 冒烟：关 `harness:identity` 后装配只剩受保护段；`sccFullSections` 旁路返回完整名单；`tool:*` 随工具/组隐藏自动移除，不出现在可配置列表 |
| 配置页结构 | 冒烟：按消息五张卡（system/快照/工作区指令/时间采样/其他注入消息）；人设 checkbox + 输入框；快照已知 8 项 + 动态发现项；两条通道各一行 checkbox + 说明；自动清单每行 checkbox 可按 kind 关闭；各行 `title` 给出注入正文 |
| 通道过滤顺序 | 会话 `session-f6a33b8a…` 真机实证：Chat 档 channels 全 off、tools=0、system 为空，但仍漏一条 `time-context` user 消息。根因是 preset 的 `prepend` 监听器晚于全局过滤器注册、反包住过滤器；修复为 `agent/created` 时按 agent 再注册（回归 `tests/channels.test.mjs`） |
| 客户端 | bundle 已进 boot graph |

未验证：会话头部下拉菜单的像素级核对（与 hero 下拉同一套组件，DOM 已核对）；卡片回执条款只做 1 次行为抽查（`present` 后只回一句确认），交付失败时仍给错误细节由契约文本保证，未单独构造失败场景。

## 已知限制

- 档位只减不增：不能给会话加工具。
- 占位保留每个参数的名称与类型（说明/示例/默认值已剥）；跳过 `tool_search` 直接调用时缺的是参数语义说明，不是类型，布尔/数字仍按正确类型传。
- MCP 业务工具若在会话内未激活（连接器的 `session_tools` 那层），加载 schema 也不等于激活。
- 同模式不同档位的会话不共享前缀缓存。
- 系统段的顺序由宿主 `order` 固定，本面板只能包含/排除，不能改先后。
- 系统段开关是档位级，只作用于根会话；子代理的 system 段不受档位开关控制（附加规则是全局例外）。
- 运行时上下文/系统段的名字由一次干跑装配动态发现：**当前没出现、也没被关掉的空条件段不会占行**；需要提前配置一个尚未触发的条件段时，先让它在会话里出现一次。
- 自动发现清单的 kind 开关是档位级；关闭 `subagent-settled` / `compact-checkpoint` / `runtime-context` 这类运行期消息会让对应插件收不到自己的通知，只在明确知道作用时关。
- 工作区指令只能整组关：宿主已把同一批 AGENTS.md/CLAUDE.md 拼成一条 `<system-reminder>`，无法按文件过滤；要排除某类文件名只能在部署级配 `instructionFileCandidates` / `maxBytes`。

## 开发文档

- `AGENTS.md`：给编码代理的项目说明（构建、安装、坑库、注释与文档维护规则）。
- `docs/dsh-web-ui.md`：DSH Web UI 的设计 token、控件几何、槽位接入与验证配方——改界面先读它。
- `../dsh-session-bridge/scripts/read-session.mjs`：会话记录解码/摘要（在该包跑 `npm run session -- --latest` 或 `--session <id>`）。会话文件是多帧 zstd，这个脚本按帧解压并列出档位、`system` 长度、user 消息 `source.kind`、`request/header` 工具数；排查「配置有没有生效」先跑它，别反复重启试。
- `scripts/smoke.mjs`：`pnpm build && node scripts/smoke.mjs`，在 happy-dom 里渲染配置面板与两个 chip 并断言结构（依赖来自本项目 devDependencies）。
