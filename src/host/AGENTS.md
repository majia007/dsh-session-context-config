# AGENTS.md — Host 半边（档位应用与消息装配）

本模块文档覆盖：`src/index.ts`（插件面与装配合成）、`src/host/**`（状态/解析/应用/路由/来源等）、`src/baseline.ts`（附加规则文本层）、`src/tool-guides.ts`（复合引导段成员表）、`src/types.ts`（宿主服务面声明）。

跨模块约定、构建/安装/热重载/真机验证见根 [`AGENTS.md`](../AGENTS.md)；Client 半边见 [`../client/AGENTS.md`](../client/AGENTS.md)。本文只记 Host 侧读代码读不出的机制取舍与坑。

## 组件锚点

| 文件 | 职责 |
|---|---|
| `src/index.ts` | 插件面：`name`/`inject`/`apply` + 装配（附加规则 per-agent 注册、webServer 路由、`agent/created`·`disposed`、`tools/change`、通道拦截 pre-step、注入消息前置、技能注入去重、`skill` 工具结果去重（`tools/post-execute`）、已读工作区指令去重（`tools/result` 记录 + pre-step 剔除）、运行时上下文与 system 段逐项过滤、重装载补、teardown） |
| `src/types.ts` | 宿主服务面最小结构声明（镜像 checkout 形状，未验证字段不写） |
| `src/baseline.ts` | 附加规则层：行为契约/卡片回执/不可信下载三段固定提示词 + 可勾选的自定义文本；默认值/归一化/文本快照 |
| `src/host/baseline-runtime.ts` | 附加规则的 per-agent 注册面：四段注册进 agent scope 遮住全局兜底；根会话读所属档位，子代理沿 `header.parentSession` 跟随根档位 |
| `src/host/constants.ts` | 状态字面量、组表（含 platform/devtools 拆分）、通道表、运行时上下文清单/order 映射、人设段常量、5 个插件通用默认预设、`LEADING_CONTEXT_KINDS` |
| `src/tokens.ts` | 面板体量文案唯一的 token 估算器（汉字/全角与拉丁分档）：`/api/state` 的工具目录与 Client 的段/上下文标签共用同一份 |
| `src/host/translations.ts` | 工具说明按需翻译：默认模型（`agentDefaultModel`→`llm.prepareCall`）+ 以原始文本为 key 的缓存（独立文件），只供面板显示 |
| `src/host/state.ts` | 状态文件路径、默认值、**读入归一化**（坏字段静默丢弃，面板与装配不必各自防御） |
| `src/host/state-store.ts` | 状态存取：加载（含 `context-profile.json` 兼容迁移）/防抖落盘 |
| `src/host/tools.ts` | 档位解析（`effectiveState` / server 层的 `effectiveServerState`）、配套段判定（`hiddenCompanionSection`：`tool:*` 与 `mcp:<server>` 跟随来源状态）与延迟占位（`skeleton`/`placehold`，含占位描述前缀常量）——**与 `src/client/state/resolve.ts` 同规则双份** |
| `src/host/sessions.ts` | 会话与 agent 小工具集：身份解析、blank/根判定、schema/定义读取、可见历史文本（`messageTexts` / `visibleTexts`，技能去重与工具结果去重共用） |
| `src/host/profiles.ts` | 档位应用运行时：planFor/applyTo/refresh/release、tool_search 自动注入/注册与查询面 |
| `src/host/fork-inherit.ts` | fork 会话的档位继承：按**继承前缀**（前 `inheritedEventCount` 个事件的 `seq|type|time`）反查来源会话——先扫活会话（零 I/O），再按最新优先回读有限条已结束会话的日志 |
| `src/host/ask-shadow.ts` | `ask_user_question` 的档位改写：官方参数结构校验（`parameterStructure`/`ASK_PARAMETER_EXPECTED`）+ agent 作用域同名遮蔽工具的注册与执行分支 |
| `src/host/environment.ts` | 环境事实的 per-agent 注册与释放（探测一次固定；是否进请求按档位 contexts 过滤） |
| `src/host/environment-facts.ts` | 环境事实探测（platform/shell/git）与文本渲染 |
| `src/host/catalog.ts` | agent preset 目录枚举（15s 缓存）+ 每个工具附来源标注（把整批工具交给 `sources.ts` 解析） |
| `src/host/sources.ts` | 工具来源解析：`tools.register` 拦截 + 调用栈定位包名、官方工具目录、入口产物扫描、MCP 命名约定；`/api/state` 的 `sources` 是它的诊断自报告 |
| `src/host/known-tools.ts` | **生成文件**：DSH 官方「工具名 → 提供包」，来自 checkout 的 `docs/tool-catalog.md`；宿主升级后重跑 `pnpm gen-known-tools` |
| `src/host/routes.ts` | 五条 HTTP 路由（state/session/preview/assemble/translate，信任栅栏在生成的 `connection-fence.ts`）与快照/预览；快照带 `defaults`（当前插件版本的内置预设模板），`promptCatalog` 干跑装配返回段/上下文正文，`observedChannels` 按档位汇总注入消息 |
| `src/host/connection-fence.ts` | **生成文件**：connection 信任栅栏（两代准入 + 回环回退），全仓一份规范源，勿手改 |
| `src/host/injected.ts` | 注入消息清单：`agent/pre-step` 观察 + 会话历史聚合，**按档位分桶**，按 `source.kind` 记次数与最新正文（供面板按 kind 开关） |
| `src/host/instructions.ts` | 已读工作区指令去重：`tools/result` 记录完整 read 的路径与内容摘要，pre-step 过滤器按「路径 + 摘要」剔除重复的 `Additional instructions from:` section |
| `src/tool-guides.ts` | 复合 `tool:*` 引导段的别名组与成员表（jobs/goal/schedule/session-query），成员全隐藏才隐藏 |

## 核心机制要点

- **四级状态解析（位置即优先级）**：组、server、工具三层共用同一套四态，面板标签为 **开启(force) → 关闭(off) → 延迟(defer) → 默认(on)**，数字小的压过数字大的；同号时靠上的层（组 > server > 工具）优先，但同号结果相同、不产生差异。判定顺序：组 force → 工具 force → 组 off → server force/off → 工具 off/defer → 组/server defer → 注入。**`on`（「默认」）不参与判定、也不落盘**：它就是跟随上一层，组 `defer` / `off` 会把它覆盖成延迟 / 关闭。pi 档位用的是「12 个组 `off` + MCP 组 `defer` + 6 个工具 `force`」——MCP 的延迟让 `tool_search` 照常由 `planFor` 注入。解析同时存在于 Host 与 Client（`src/client/state/resolve.ts`），改一侧必改另一侧。
- **延迟不是删除**：延迟工具在 tools 数组里保留「名字 + 功能摘要 + 参数类型骨架」的占位定义（每个参数的名称与类型都在，只剥说明/示例/默认值），完整 schema 由 `tool_search` 以工具结果的形式追加进历史。这样 tools 数组整场不变，加载动作不打断前缀缓存——这是整套设计的核心取舍，别顺手改成「按需注册/注销」。**类型不能从骨架里省**：只留 required 参数会把可选布尔/数字当字符串传（`plugin_manager` 的 `enabled: false` 会报 “must be a boolean”）。
- **`tool_search` 是延迟加载的基础设施，不进档位表**：`planFor` 在算完其它工具的终态后特判——只要还有别的延迟工具，就把它排除出 `deferred` / `hidden`，让 `syncToolSearch` 注册的完整定义直接可见；一个延迟工具都没有时，把它放进该 agent 的 `hidden`（全局注册可能来自别的会话，不能让无延迟会话看到空转的搜索工具）。因此 `other: defer` 不会再把 `tool_search` 自己也延迟成自指占位；`/api/state` / `/api/session` / `/api/preview` 的工具清单与面板都不列它，旧状态里的 `tools.tool_search` 在归一化时剪掉。这是对「开关一律挂档位」的显式例外：它是延迟机制本身，不是可配置能力。
- **生效边界**：`agent/created` 时——有会话记录就按记录套用；空白新会话按**会话工作区**（`session.header.cwd` 的规范化键，Host 在 `host/state.ts` 的 `lastUsedFor` / `recordLastUsed` 里维护）的最近选择套用并记录，工作区没有记录时按 `none` 起步、不回落其它工作区的 `lastUsedId`（拿不到 cwd 才用 `lastUsedId` 兜底）；**fork（`header.isSeeded`）先按继承前缀认回来源会话、继承它的档位**（`host/fork-inherit.ts`）；认不出来（不是 fork、来源日志不可读、或来源自己没记录）就显式记成 `none`——留空会被客户端当成 lastUsedId，见坑库。已开始的会话不跟随配置变化，只在用户确认切换时重算；`tools/change`（可见工具集合变化）时按同一档位**增量**刷新延迟占位与隐藏面（只加新增、撤消失，未变化的工具不重注册）——整份重建会让当前 step 的延迟工具全部 `unknown tool`，见坑库。`sessions` 映射经 `recordSession` 有界保留最近 500 条：宿主 dispose 一个 agent 后同 sessionId 仍可被 resume 复用（切回已有会话 = 同 id 重新 `agent/created`），不能按事件删条目；被淘汰的会话重开时没有记录、又不是新会话，按「不处理」处理。
- **运行时上下文逐项开关**：`ContextProfile.contexts` 只存关掉的上下文名（缺省=注入）；兼容字段 `runtimeContext` / `workingDirectory` / `baseline.environmentFacts` 在 `normalizeState` / `normalizeProfile` 里一次性迁移成逐项 false。`profiles.ts` 对每个 false 在 agent 作用域注册同名非 required 空上下文（required 段靠它遮住 required 标志），`index.ts` 的全局 `system-prompt/assemble`（`prepend`）在 `next()` 之后按名字过滤；因此 `refreshContext` 不会把 required 段补回。**面板的上下文名单由一次干跑装配动态发现**（快照 `contexts`，含空文本条目）：常量只提供已知项的中文名/说明/顺序，装配里出现的未知 name 会按原始 name 自动补行并立即可开关；`subagent:identity` 是已知项之一（order 取 `SUBAGENT_DELEGATION`）。验收：`/api/assemble` 的 `contexts` 与 `refreshedContexts` 都要遵守同一份开关。
- **system 段逐项开关**：`ContextProfile.sections` 只存关掉的段名（缺省=包含）。同一份 `system-prompt/assemble` 过滤器在 `next()` 之后按名字删 `assembly.sections`；`refreshContext` 不重跑 sections，所以不需要影子段。**过滤器必须 `{prepend:true, global:true}` 注册**（见坑库：assemble 走 scopeTarget 过滤派发）。`deployment:persona-prefix` / `deployment:persona-suffix` 与 4 条附加规则段受保护：人设是 `prompt.prefix` / `prompt.suffix` 两个独立槽位（各自 `enabled/override/text`），附加规则走 `profile.baseline`（`baseline-runtime.ts` 的 per-agent scoped 段）。**`tool:*` 与 `mcp:<server>` 都强绑定来源状态，不进 `profile.sections`、面板不列、不单独配置**：同一过滤器经 `hiddenCompanionSection` 裁掉——`tool:*` 按工具/组终态（复合段 jobs/goal/schedule/session-query 看成员，至少一个成员开启/延迟才保留），`mcp:<server>` / `mcp:<server>:tools` 按该 server 的终态（server 隐藏即移除，`defer` 仍保留）；`normalizeSections` 剪掉旧状态的 `tool:*` 与 `mcp:*` 键。`sccFullSections: true` 是面板列目录的私有旁路（返回未过滤名单），`promptCatalog` 会再剔除 `tool:*` 与 `mcp:<server>`；真正的请求路径不带这个字段。
- **默认预设与状态版本兼容**：`DEFAULT_PROFILES` 有 5 个**插件通用**模板：`full`（全部开启；编排/目标/调度/插件开发/MCP/第三方延迟）、`lean`（隐藏编排/目标/调度/插件开发；MCP/第三方延迟）、`minimal`（交互/技能/协作/编排/目标/调度/MCP/插件开发/第三方全关；人设用 `MINIMAL_PROMPT`）、`chat`（全关）、`pi`（参考 Pi 的设计理念做精简运行时，不逐项复刻：12 个组 `off`、MCP 组 `defer` 作为默认（含 `list_mcp_resources|list_mcp_resource_templates|read_mcp_resource` 三个共享资源工具，随组延迟，宿主 `mcp-resource-servers` 段正好点名它们），read/write/edit/pwsh/read_image/skill 六个工具用工具级 `force` 提回注入，其余工具彻底不出现；MCP 延迟让 `tool_search` 照常自动注入（模板 `tools` 不写 `tool_search`）；skills「目录注入 + 正文按需读」由 skill-catalog 消息 + `skill` 工具承载，`injectDuplicateSkills: false` 让同一份正文不重复注入；人设只留前置（`PI_PROMPT`），后缘槽关闭；提示词首行声明由 `{{model}}` 驱动的当前模型、运行在 DeepSeek Harness，只留身份行与行为规则、不写 `<tools>` 清单——工具说明由 tools 数组 description 与 `tool:*` 引导段自动注入，免得与工具面双份维护）。**它们不是用户当前配置的副本**：首次安装由 `defaultState` 克隆；新建下拉通过 `/api/state` 的 `defaults` 读当前插件版本，复制成 `custom-*`。`normalizeState` 的 v2/v3→v4 **只做结构迁移**（prompt 双槽位、contexts 旧字段、缺失的新字段、version），**不替换任何档位的名称/组/提示词/开关，也不新增 chat/pi**。组划分：`platform` = `load_workspace_dependencies|working_directory|lsp`，`devtools` = `plugin_manager|cordis_*`，`mcp` 除 `mcp_connector_`/`mcp__` 前缀外还收三个**共享**资源工具（名字不带 mcp 前缀，由 mcp-resources 包在 scope 里有首个 provider 时注册；留在 `other` 会让 MCP 组开关漏掉资源能力，而宿主 `mcp-resource-servers` 段会点名它们）。`normalizeState` 接受 v2/v3/v4；custom-*、sessions、baseline 原样保留。
- **工具说明翻译（Host 侧链路，只供面板显示）**：`POST /session-context-config/api/translate` 命中 `$DSH_HOME/session-context-config-translations.json`（key 是**原始文本**）即返回，否则用 `agentDefaultModel.currentSelection()` + `llm.prepareCall`（与 dsh-web-extract 同链路）翻译并落盘。模型侧工具 schema / 延迟摘要 / `tool_search` 完全不动。显示侧（内置中文、原文切换）见 Client 文档。
- **附加规则与环境事实分离**：界面上的「附加规则」只保留三段固定提示词与一段自定义文本（勾选才注入，未勾选也可编辑，纯空白视同空段）；它按档位存 `profile.baseline`，根会话用自己档位，子代理沿 `parentSession` 跟随根档位（解析不到时用顶层 baseline 兜底）。环境事实是 `contexts` 里的 `session-context-config:environment`，按档位开关；子代理没有档位，环境事实默认保留。
- **工具来源（面板显示，只读）**：宿主 tools 注册表**不记录注册者**（`register` 只存定义与一条 `tools.register()` effect），所以来源按四级证据解析：① 装载后包一层 `tools.register`，从**调用栈**第一个业务文件帧反查包（`sources.ts`；`this.ctx` 是调用方 ctx，但 agent 作用域的 fiber 会指到 `agent-preset-registry`，只有栈指向真正注册方）；② 官方工具目录静态表（`known-tools.ts`，与当前真正装载的入口求交；同名多实现如 `pwsh` 用工具描述在候选包里消歧）；③ 入口产物扫描（只取「确实注册过工具」的入口，只认唯一命中，面板标为推断）；④ MCP 命名约定（`mcp__<server>__` / `mcp_connector_`，比插件归属更有信息量，优先级最高）。都不命中显示「未识别」，不猜。`/api/state` 的 `tools[].source` 与 `sources`（诊断计数）同步暴露。
- **注入内容自动发现（Host 侧生成）**：每次 `/api/state` 对**每种 live preset 挑一个限制最少的根会话**干跑 `assemble({ sccFullSections: true })`（上限 8 份），按 name 合并段与上下文（先出现的顺序优先，空影子不覆盖另一档位的非空正文），变量按各自 `assembly.variables` 渲染；空段不列、`tool:*` 与 `mcp:<server>` 不列（强绑定来源状态，不单独配置）、空上下文保留。user 消息来源由 `injected.ts` 按**根会话实际归属的档位**分组（applied 优先，回落 `sessions` 记录；无档位归 `none`），组内合并 `deriveMessages()` 历史与 `agent/pre-step` 观察（被通道关掉的消息也记录）。面板只取当前选中档位那一组，渲染与按 kind 关闭见 Client 文档。**调用时机**：不是每请求/定时——**每次打开配置面板**（keyed 槽位每次打开都是新挂载）、手动「重新读取」、保存、切换档位时计算（`/api/state` GET/POST 与 `/api/session` POST 都返回快照）；页面首次挂载 chip 时只在 store 为空时读一次，chip 本身不触发重读。**打开面板即重读是必需项**：工具表、段、上下文与注入消息都由宿主动态生成，不重读就会出现「工具表里明明有、面板里没有」（实测 MCP server 连上、工具已注册，面板仍只列旧 server，用户据此以为配置没生效）。没有版本/插件键缓存；版本/插件变化等下次拉取自然生效。单次最多 8 份装配，工具目录另有 15s 缓存。
- **默认行为改写（五个开关语义统一为「开启=本插件介入、关闭=宿主原样」，面板用 `role="switch"` 而不是复选行）**：开关挂在档位下，只作用于根会话，切档位时重新计算。
  - `injectedFirst`（注入消息前置，默认关）：pre-step 过滤器只把 `LEADING_CONTEXT_KINDS` 白名单（工作区指令 → 技能目录 → 运行时快照，**数组顺序即发送顺序**，同类内保持宿主顺序）前移到其他消息之前，跨会话时这些块（实测一次 ~2.5 万字符）能落进共享前缀。**白名单不是「所有非 user 消息」**：`time-context` 每轮重新采样、前移没有缓存收益还会把时间戳放到它所描述的消息之前，`skill-invocation` 的技能正文（宿主刻意放在所有注入之后、贴着模型回答）、运行期通知与未知/新插件的 kind 都保持宿主顺序；扩展只能加名单里的名字，不按 `kind !== 'user'` 推断；没有用户消息的批次（工具续跑）不前移。改的是落盘顺序（`agent.ts` 的 `step()` 按 `decision.messages` 数组顺序 append），所以只影响新提交的批次、不重排历史；`runtime-context` 的占位按位置被替换成新快照，重排不影响它的 supersession。代价是模型看到的顺序变了（用户消息不再紧跟 system），README 与面板文案都写清。回归 `tests/channels.test.mjs`。
  - `injectDuplicateSkills`（用户 `/技能名` 注入去重，默认关=注入）：用户消息里任意空白边界的 `/name` 会让宿主 tool-skill **无条件**注入整份技能正文；模型此前若已用 `skill` 工具加载过同一技能，同一串文本就会在上下文里出现两次（实测同一会话 `tool/result` 与 `skill-invocation` 两份正文 sha1 相同）。开关为 `false` 时本插件在同一个 `agent/pre-step` 过滤器里按**逐字相等**剔除重复的那一份：判据取 `session.deriveMessages()`（只走 surface 派生，压缩/替换掉的正文查不到 → 保留注入，不丢指令），拿不到会话或派生失败时不去重。只作用于当前档位的根会话，不改模型可见内容。**不要**改成「本会话加载过就跳过」的记账式判定：那条路径在压缩后会把指令永久删掉。旧状态字段 `dedupeSkillInjection: true` 读入时按相反语义迁移成 `injectDuplicateSkills: false`。回归 `tests/dedupe.test.mjs`。
  - `dedupeSkillToolResults`（`skill` 工具结果去重，默认关）：工具结果是宿主的 `tool/result` 事件，pre-step 过滤器看不到，落点是 `tools/post-execute`（按 `exec.agent` 作用域派发；root ctx 注册必须带 `{ global: true }`）。命中可见历史就把这次结果的 `content` 换成一行提示（`{ kind: 'accept', content }`），判据用 `visibleTexts`（`deriveMessages`，压缩后重新给全量）；拿不到历史、结果是错误、或别的插件已阻断/改写正文时不介入（宁可重复）。**不要在 agent 作用域重注册同名 `skill`**：宿主按定义身份判断技能工具是否可见，遮蔽会连技能目录一起弄没——见坑库。回归 `tests/dedupe.test.mjs`。
  - `dedupeReadInstructions`（已读工作区指令去重，默认关）：宿主 `agent-instructions` 在文件触碰（read/write/edit）后会把被触碰目录链上的 AGENTS.md 以 `Additional instructions from:` 再注入一次；模型此前已用 read 完整读过同一份全文时，这次就是纯重复。落点分两半：`tools/result` 记录完整读取（结构化输出的 `offset === 1`、`lines.length === totalLines`、无行内截断；只记根会话自己的 read），pre-step 过滤器（`host/instructions.ts` 的 `pruneInstructionMessages`）按「路径 + 内容摘要」剔除 `Additional` section。**判据必须带内容摘要，不能只看路径**：read 之后文件可能被 edit，宿主注入的是新内容，按路径删会丢更新；摘要不同就保留。`Updated` 与 `Instructions removed` 永远保留；整条消息的 section 全被剔除时消息整体不进入请求。记录是进程内、按会话的（`agent/disposed` 清理），不落盘，重启/恢复会话后要重新 read 过才生效；子代理的 read 不记录（其结果不在父会话历史里）。回归 `tests/instructions.test.mjs`。契约依据（DSH 升级后按 checkout 复核）：触碰工具集 `FILE_TOUCH_TOOL_NAMES`（read/write/edit）与 Additional 段的渲染在 `packages/context/agent-instructions/src`（`index.ts`、`render.ts` 的 `additionalSectionText`；整条消息的帧是 `<system-reminder>` + 换行 + 正文 + 换行 + `</system-reminder>`，段落之间空一行）；read 的结构化输出 `{ path, offset, lines, totalLines }` 与行截断标记 `... (line truncated to N chars)` 在 `packages/fs/tool-fs/src`（`read.ts`、`read-render.ts`）。这几处形状变了，去重会静默失效（格式对不上就不删，不会误删）。
  - `askUserTimeout`（`ask_user_question` 等待改写，默认不介入 = 不注册）：`-1` 关闭超时（无限期等待，卡片仍带调用 id：断线后保留、草稿不丢、提交失败可见）；`N>0` 走 `askTimed`，到点返回 pending（不是跳过，问题仍可回答）。**落点是 agent 作用域同名工具遮蔽**（`tools.register` 的既定语义「scoped tools shadow globals」），不是改 preset：desktop 组合里该工具由 agent preset 的 `config.plugins` 装配，`plugins` 是数组、loader patch 方言只能整体替换，按插件 id 打补丁会把整份 preset 冻进 profile patch（挡住上游更新、新模式不跟随）。**安全阀**：`host/ask-shadow.ts` 先取官方定义，按 `parameterStructure`（skeleton 后键排序）与 `ASK_PARAMETER_EXPECTED` 比对，结构不符即拒绝注册；`/api/state` 的 `askUser` 把 `compatible/reason/message` 交给面板，面板据此禁用控件并提示。遮蔽只替换 `execute`/`output`/`description`，`parameters` 始终来自官方定义。与 `skill` 不同，`ask_user_question` 没有宿主侧的定义身份校验，遮蔽是安全的。回归 `tests/ask-shadow.test.mjs`。**基线形状是 `defineTool` 编译后的 JSON Schema，不是作者书写形态**：书写形态写 `required: true`（布尔），注册表里存的是父节点的 `required: ['id','question']` 数组——照书写形态写基线会在第一次真实校验时判成「结构已变化」、面板整项停用（实测踩过）；核对依据取会话记录 `request/header` 里实际发给模型的 schema。该档位把 `ask_user_question` 设为「延迟」时跳过改写（占位已在同一层，再注册同名遮蔽会撞名，延迟优先）；面板只在 `askUser.reason === 'schema'` 时禁用控件，其余状态（无 live 会话、延迟、定义缺字段）只显示一句中性提示，校验通过时不显示任何状态行——档位是配置面，生效与否要到会话创建时才定。
- **人设是两个独立槽位，不是一个总开关**：`deployment:persona-prefix`（order 0，固定身份之后、所有第一方指导之前，“你是谁”）与 `deployment:persona-suffix`（order 10200，所有第一方指导之后、提示词最末，“收尾叮嘱”）各自配置：`enabled=false` → 该槽位注册空影子（不发送）；`enabled=true && !override` → 不注册（沿用部署 `personaPrefix`/`personaSuffix`）；`override=true` 且 text 非空 → 替换该槽位；`override=true` 且 text 为空 → 该槽位不发送。两槽位的位置、语义、缓存代价都不同，必须分开。**覆盖文本支持 `{{model}}` / `{{provider}}` 占位符**（名字与宿主在 agent-loop 注册的提示词变量一致），按每次装配的 `context.modelSelection` 展开、回落 `context.agent.options`，取不到值就原样保留。实现固定 `interpolate: false` 自己替换：宿主的严格插值会把人设里写错的一个花括号变成整次装配失败（请求发不出去），而人设是自由散文，不值得为未知变量冒这个险；代价是宿主以后新增的变量名不会自动进人设。有占位符才注册成函数，无占位符仍是静态字符串（宿主原样收下）。

## 关键技术边界与坑

> ⚠️ **宿主没有 `ctx.agents.roots()`，根会话判定必须看会话头**
> 症状：宿主日志刷 `[session-context-config] roots: ctx.agents.roots is not a function`（单次宿主运行里 792 条），而「档位只作用于根会话」实际失效——子代理也被套上了档位与通道过滤。
> 根因：AgentRegistry（rc.1 / rc.2 均如此）只有 `list` / `turnBoundaryOf` / initiator 面，没有 `roots`；旧实现每次调用都抛 TypeError，被 catch 吞掉后恒返回 `true`，错误只留在日志里。
> 正解：`isRootAgent` 按会话头判——子代理 `header.origin === 'subagent'`；fork 会话即使带 `parentSession` 也没有 origin（桌面 UI 的 fork 连这个字段都不写：`session-controller` 的 fork 只写 `{ cwd, isSeeded, agentPreset }`），仍是根会话；拿不到会话信息时保守按根处理。回归：`tests/sessions.test.mjs`（假 ctx 的 `agents.roots` 直接抛，断言一次都不碰）。
> 教训：宿主服务面按名字猜会静默降级——`catch` 后回退一个「看起来安全」的默认值比抛错更难发现；新增服务调用先对 checkout 的类定义核方法名。

> ⚠️ **宿主 fork 不写来源 id：fork 继承只能靠日志前缀认亲**
> 症状：想让 fork 出来的会话继承来源会话的档位，但新会话里拿不到任何「来自哪个会话」的标识。
> 根因：`session-controller` 的 fork 生成全新 `session-<uuid>`，会话头只写 `{ cwd, isSeeded, agentPreset }`（`parentSession` 这条路径根本不写；core 的 header schema 支持该字段，但没用上）；seed 只有源会话 `0..boundary` 的事件拷贝 + `session/end-seed {inherited:true}` + 合成 fork closers。
> 正解：按**继承前缀**认亲——比较前 `inheritedEventCount` 个事件的 `seq|type|time`（每事件独立打点，整段逐条相等只可能是拷贝；实测一个 143 事件前缀在本地全部会话日志里唯一命中源会话）。先扫 `ctx.agents.list()` 的活会话（`session.eventAt` 逐条比，零 I/O），不命中再按 `sessionQuery.listSessions()`（带超时信号）的最新优先顺序用 `readSession`（回退 `observeSession` 租约）读有限条已结束会话的日志（数量与时长都有上限）。同一前缀有多个命中时取 `createdAt` 最新的那个（就是这次 fork 的父会话）。**前缀短于 3 个事件不认亲**：三元组指纹在极短前缀上可能被同毫秒创建的两个无关会话撞上。`eventAt` / `snapshotEvents` 都缺失时（两者已标 deprecated）留一条 `fork:log-reader` 诊断，不让继承静默失效；继承来的档位 id 若已被删除，按「不处理」而不是记一个幽灵档位。
> 验证：`tests/session-decision.test.mjs`（活来源继承 / 冷来源回读继承 / 来源记 `none` 则 fork 也 `none` / 认不出来记 `none` / 短前缀不认亲 / 幽灵档位按 `none`）。

> ⚠️ **「没套档位」必须写成 `none` 记录，不能留空**
> 症状：会话 chip 显示「完整」、弹层显示「开启 49 · 延迟 0 · 关闭 0」、每个工具都「开启」，但该会话的请求里一个 `【延迟】` 占位都没有；用户据此以为「完整档位注入了/屏蔽了什么」，还会把宿主自己的「工具已更新 · 移除 N 个」卡片算到本插件头上。
> 根因：`sessions` 没有记录时客户端回落 `lastUsedId`（那只是「新会话会用的默认档位」），`/api/session` 也把 `sessions[id] ?? lastUsedId` 当本会话的档位；而弹层的三态数字只统计**已应用**的 plan——没应用的会话恒「全开启」，读起来就像某个档位真的生效了。
> 正解：认不出来/没有决策时一律 `recordSession(..., 'none')`（显式「不处理」）；`/api/session` 与 `/api/state` 的 `live[]` 返回 `applied`（有 applied 条目且不是 `none`），且**不再回落 lastUsedId**；客户端按 `applied` 显示「不处理 / 未套用」、工具态标「原样」，旧 Host 缺该字段时按「已套用」保持旧行为。
> 验证：`tests/session-decision.test.mjs`、`tests/routes.test.mjs`（`profileId` 与 `applied` 分离）；真机认不出来源的会话 chip 显示「不处理」。

> ⚠️ **更新插件不能改用户配置，迁移只能做结构转换**
> 症状：改了 `DEFAULT_PROFILES` 或更新插件后，配置页里的 `full/lean/minimal` 没变；或反过来担心用户档位被新预设替换。
> 根因：`session-context-config.json` 的 `profiles` 是**用户配置**，`DEFAULT_PROFILES` 只在没有状态文件（`defaultState`）时使用；v2/v3→v4 迁移只转换字段结构，不替换任何档位的值。
> 正解：默认预设只作为新建下拉的模板，更新插件不改用户配置；不要为了同步预设去改迁移、升 state VERSION 或写用户 state。旧状态迁移的验收口径是「用户值原样保留」，不是「换成新内置值」。
> 验证：`tests/sections.test.mjs` 的 v3→v4 用例断言自定义 `full` / `chat` 的名称、组、提示词原样保留；`GET /api/state` 的 `defaults` 是 5 档，`profiles` 是用户档位。

> ⚠️ **工具来源只能靠调用栈：`fiber.entry` 会指到造作用域的插件**
> 症状：给 `tools.register` 包一层后，所有 agent 作用域工具（`tool_search`、preset 里的 `schedule_*`）都被标成 `@deepseek-ai/dsh-agent-preset-registry`。
> 根因：`layers.effect(this.ctx, …)` 用的是 use-site ctx；agent 作用域注册的 fiber 属于 `createScope` 铸的 scope fiber（`fiber.runtime.name === 'scope'`），它的 `fiber.entry` 是 owner（`agent-preset-registry`），不是真正注册方。只有调用栈指向注册代码所在文件。
> 正解：栈里「先跳过本插件自己的帧（整包单文件）→ 再跳过 cordis / tools 服务的代理帧 → 取下一帧」；帧路径要剥掉 `:line:col`，自己的文件要 `realpathSync` 对齐（loader 用 profile 的 junction 路径 import，栈按 realpath 打帧，直接用 `import.meta.url` 永远对不上）。回归 `tests/sources.test.mjs`。

> ⚠️ **本插件给延迟工具注册的占位不是「原注册」**
> 症状：装上来源标注后，`session_recall` / `schedule_task` / `plugin_manager` 全被标成本插件。
> 根因：`profiles.applyTo` 会把延迟工具重新注册成占位（`【延迟】…`），这次注册同样经过 `tools.register` 拦截，把真实归属覆盖成了本插件。
> 正解：按 `host/tools.ts` 的 `DEFERRED_DESCRIPTION_PREFIX` 跳过占位注册；真归属交给官方目录/入口产物扫描，或在插件稍后重新注册时捕获。

> ⚠️ **不要在 agent 作用域重注册 `skill`：会连带把技能目录弄没**
> 症状：开启「skill 工具结果去重」后，新会话里不再出现 `<available_skills>`；已发布过目录的会话被替换成一条「当前没有可用技能」的替换目录。
> 根因：宿主 `tool-skill` 用**定义身份**判断技能工具是否可见——`ctx.tools.get('skill', agent) === 它注册的 skillTool`；agent 作用域的同名注册会遮住继承层定义（`view()` 里 own 层优先），判定失败后它按空快照发布目录（`{ skills: [], complete: true }`，已发布过的走「替换目录」分支）。
> 正解：工具结果一律走 `tools/post-execute` 改写，不重注册工具；需要同名遮蔽的只能是「本插件自己造的占位」（延迟占位，宿主本来就该看不到真实工具）。
> 验证：`tests/dedupe.test.mjs` 断言开启后 agent 作用域一个工具都没重注册；真机新会话里 `<available_skills>` 仍在。

> ⚠️ **延迟占位只能增量刷新，整份重注册会让当前 step 的延迟工具全部 UNKNOWN_TOOL**
> 症状：开启「延迟」档位后，模型调用 `plugin_manager` / `cordis_inspect_query` 等延迟工具报 `Error: unknown tool "..."`；同一 step 内所有延迟工具都失败，下一个 step 自愈（用户描述为「第一次报错、第二次正常」）。
> 根因：`tools/change` 的 300ms 去抖回调若走 `applyTo`（整份 `release`→重注册），会换掉每个占位定义的**对象身份**。宿主每个 step 的准入集（`tools.resolve` 的 `ResolvedToolSet`）在执行时逐名复核「当前定义 === 准入时定义」且「当前注册 === 准入时注册」，任一不等就把该名字排除、抛 `ToolNotFoundError`。典型触发：`plugin_manager set_plugin` 热重载带延迟工具的插件（如 governance），工具表变化后 300ms 去抖正好落在下一步的模型生成期间。
> 正解：`tools/change` 走 `profiles.refresh()` 增量 diff——已注册的名字直接跳过（摘要以注册簿为准，不能拿占位描述重算，否则【延迟】会套两层）、新增的注册、消失的撤销；`hidden` 面变化才重建 `restrict`（restrict 只影响被 deny 的名字，不改变其它工具的注册身份）。`applyTo` 只用于 `agent/created` 与用户切档位，且重入守卫必须包住 `release`（否则 release 触发的 tools/change 会白排一次去抖）。
> 「消失」的判据必须是**继承层名单**（`tools.view(agent).restrictableNames`），不能只看 `definitions`：占位注册在 agent 自己作用域里，会遮住同名全局工具，`definitions` 里永远还看得见这个名字。只看定义就发现不了「插件已停用、占位却还在、仍能调用已卸载实现」的幽灵工具。
> 验证：`tests/refresh.test.mjs`（未变化的占位只注册一次、背后实现卸载后撤占位、restrict 重建）。

> ⚠️ **`system-prompt/assemble` 监听器必须 `{global: true}`，跨 scope 稳定触发**
> 症状：段开关/上下文开关只写状态，装配结果毫无变化；单测全绿。
> 根因：宿主在 `core/system-prompt` 用 `scopeTarget(this, scope)` 派发这个 waterfall，Cordis 的 context filter 只放行 `hook.global`、无 filter、或 scope 链上的监听器（`vendor/cordis/src/events.ts` 的 `_resolve`）。`packages/core/scope` 对无 scope 标签的监听器放行，所以根 ctx 监听器并非必然被挡——但带 `global: true` 才与 scope 无关地稳定收到。
> 正解：`ctx.on('system-prompt/assemble', listener, { prepend: true, global: true })`。单测直接调 listener 发现不了，`tests/sections.test.mjs` 额外断言 `hook.options.global === true`。验证：`/api/assemble` 的 sections 不含被关掉的段（contexts 仍可能被宿主的 required 补回，靠 agent 作用域空 shadow 把文本变空，见上下文开关条目）。

> ⚠️ **通道过滤器必须按 agent 在 `agent/created` 注册**
> 症状：档位里关掉「注入时间采样」后，请求里仍会出现一条 `Time sampled ...` 的 user 消息（`source.kind: "time-context"`）；工作区指令却能正常滤掉。
> 根因：`time-context` 是 agent preset 插件，在会话创建时挂载，且用 `prepend` 注册 `agent/pre-step`；它晚于插件的全局监听器注册，unshift 后排到全局过滤器**前面**，它追加的时间消息在全局过滤器 `next()` 返回之后才出现。`agent-instructions` 用默认 push（内层），所以能滤掉——不对称由此而来。
> 正解：`agent/created` 时在 `agent.ctx` 上再注册一次同样的过滤器（`{prepend:true}`）。宿主契约（`core/agent` 的 `CreateAgentOptions.setup` 文档）保证 setup 里挂载的预设插件与监听器先于 `agent/created`，所以此时注册才能包住 time-context。全局那份只作拿不到 `agent.ctx.on` 时的兜底。回归：`tests/channels.test.mjs`。

> ⚠️ **工具引导段不是按工具可见性产出的**
> 症状：Chat 档位把工具全部隐藏/关闭后，system 提示里仍追加 pwsh / jobs / goal / workflow 的引导文本；面板里也找不到这些开关（用户实测「全部关闭」后仍多出两段）。
> 根因：`tool-pwsh`、`tool-jobs`、`tool-goal`、`tool-workflow` 注册的是**无条件静态 text**，不读 `context.toolSet`、也不因工具被 restrict 而变空；本插件早期又把 `tool:*` 从 `sections` 过滤与归一化里排除，导致它们既不随工具隐藏、也无法单独关闭。
> 正解：**强绑定工具状态，不单独配置**。`host/tools.ts` 的 `hiddenToolGuide` 在同一 assemble 过滤器里按工具/组终态裁掉；复合段走 `tool-guides.ts` 的别名组与成员表（`jobs`/`goal`/`schedule`/`session-query`），成员全隐藏才隐藏，`defer` 不算隐藏；`mcp:<server>` / `mcp:<server>:tools` 服务器指令走同一入口 `hiddenCompanionSection`（`mcpSectionServer` 解出 server 名，按 `effectiveServerState` 判定终态），server 隐藏即移除、`defer` 仍保留。**判定必须统一交给 `effectiveState`，不要先用「组 = OFF」短路**：工具级 `force` 能把成员提回注入，先短路会得到「工具在、引导段没了」的不一致（回归 `tests/host.test.mjs` 的 force 用例）。
> 验证：`tests/host.test.mjs`（组/单工具/复合/延迟）、`tests/sections.test.mjs`（terminal 隐藏时 pwsh/jobs 被移除、read 保留）、`scripts/smoke.mjs`（工具段不出现在可配置列表）。

- **webServer 路由不自带鉴权**：宿主 webServer 对直接 `register` 的路由不替插件做业务判定，每个 handler 必须先过 `ctx.connection` 的 `admit`（rc.1 起就有；master 删除 `requestRejection` 后只剩它，插件保留其兜底分支）；宿主无 connection 服务才回退回环 Host 校验。POST 另要求 `application/json`，掐掉 text/plain 简单请求的跨站提交。
- **宿主服务方法解构后再调用会丢 `this`**：`const acquire = registry.acquireScope; await acquire(id)` 把方法从服务对象上摘了下来，当前宿主实现内部用 `this.retain`，严格模式下 `this` 为 `undefined`；目录枚举又是软失败（catch 后记诊断继续），症状只表现为「配置面板的工具区整块没了、`tools: 0`」。正解：始终 `registry.acquireScope(id)` 原样调用；租约释放优先 `Symbol.asyncDispose`，同时兜住 `.dispose()`。回归 `tests/catalog.test.mjs`。
- **未 inject 的服务不能用属性访问**：`Reflect.get(ctx, 'connection')` 与 `ctx.connection` 一样会触发 Cordis 的注入检查，`connection` 是可选的、不在 `inject` 名单里，配置页会打不开（`cannot get property "connection" without inject`）。正解：可选服务一律走 `ctx.get(name)`（缺失返回 `undefined`），方法先判存在。验证：`Invoke-WebRequest http://127.0.0.1:<port>/session-context-config/api/state` 应得到 **401**（栅栏拒绝），而不是 400 的注入错误。

## 改 Host 的验证流程

1. `pnpm build` → `pnpm exec tsc --noEmit` → `pnpm test`；Host 产物用 `node --check lib/index.js` 抽查。
2. Host 代码不走自动热更（根文档的热重载口径）：`plugin_manager` 的 `set_plugin` 对 `include:session-context-config` 关→开，返回 `application: applied` 即新 Host 已加载。
3. 行为验收以会话记录为准（根文档「排查会话记录」）：看 `request/header` 的 tools 数、user 消息的 `source.kind` 与顺序、system 文本长度。
4. 单元测试直读 `src`，不需要先 build；smoke/harness 读 `lib/`，必须先 build。

## 本文档维护

判据、记/不记清单、维护决策表都在根 [`AGENTS.md`](../AGENTS.md) 末尾「本文档维护规则」——本文件只放 Host 模块局部知识，遵守同一套标准：只记代码读不出的（设计为什么、坑、硬约束），读到与代码矛盾的断言当场以代码为准修正；新增锚点须可 grep、唯一、稳定。
