# AGENTS.md — @jia-tools/dsh-session-context-config（上下文档位）

DSH 的持久插件（bundle）：给新会话选择注入哪些工具、用哪段系统提示词。Host 做档位解析与装配，Client 在 Web UI 里出一个配置面板和两个切换 chip。

**权限与作用边界**：所有 HTTP 路由先过宿主 connection 信任栅栏（Host/Origin/浏览器会话认证；宿主无该服务时回退回环 Host 校验）；状态落 `~/.dsh/session-context-config.json`（新文件不存在时，首次启动把 `context-profile.json` 迁入并留成 `.migrated`；`DSH_HOME` 存在时以它为准）；工具/上下文/系统段档位只作用于根会话，子代理不套用；附加规则例外——子代理沿 `parentSession` 跟随所属根会话的 `profile.baseline`。

档位模型（三级状态表、四态取值与三态落地）、数据与接口格式，都已写在 `README.md`，本文不重复；本文只记代码与 git log 里读不出的约束和坑。

## 关键文件

| 文件 | 职责 |
|---|---|
| `src/index.ts` | Host 半边插件面：name/inject/apply + 装配（附加规则 per-agent 注册、webServer 路由、agent/created·disposed、tools/change、通道拦截 pre-step、技能注入去重、运行时上下文与 system 段逐项过滤、重装载补、teardown） |
| `src/types.ts` | 宿主服务面最小结构声明（镜像 checkout 形状，未验证字段不写） |
| `src/baseline.ts` | 附加规则层（界面名；代码沿用 baseline）：行为契约/卡片回执/不可信下载三段固定提示词 + 可勾选的自定义文本；默认值/归一化/文本快照 |
| `src/host/baseline-runtime.ts` | 附加规则的 per-agent 注册面：四段注册进 agent scope 遮住全局兜底；根会话读所属档位，子代理沿 `header.parentSession` 跟随根档位 |
| `src/host/constants.ts` | 状态字面量、组表(含 platform/devtools 拆分)、通道表、运行时上下文清单/order 映射、人设段常量、5 个插件通用默认预设（full/lean/minimal/chat/pi，不是用户当前配置）、token 估算系数 |
| `src/host/translations.ts` | 工具说明按需翻译:默认模型(agentDefaultModel→llm.prepareCall)+ 以原始文本为 key 的缓存(独立文件),只供面板显示 |
| `src/host/state.ts` | 状态文件路径、默认值、**读入归一化**（坏字段静默丢弃，面板与装配不必各自防御） |
| `src/host/tools.ts` | 档位解析（`effectiveState`）与延迟占位（`skeleton`/`placehold`，含占位描述前缀常量 `DEFERRED_DESCRIPTION_PREFIX`）——**与 `src/client/state/resolve.ts` 同规则双份** |
| `src/host/state-store.ts` | 状态存取：加载（含 `context-profile.json` 兼容迁移）/防抖落盘 |
| `src/host/sessions.ts` | 会话与 agent 小工具集：身份解析、blank/根判定、schema/定义读取 |
| `src/host/profiles.ts` | 档位应用运行时：planFor/applyTo/refresh/release、tool_search 自动注入/注册与查询面 |
| `src/host/environment.ts` | 环境事实的 per-agent 注册与释放（探测一次固定；是否进请求按档位 contexts 过滤） |
| `src/host/environment-facts.ts` | 环境事实探测（platform/shell/git）与文本渲染 |
| `src/host/catalog.ts` | agent preset 目录枚举（15s 缓存）+ 每个工具附来源标注（把整批工具交给 `host/sources.ts` 解析） |
| `src/host/sources.ts` | 工具来源解析：`tools.register` 拦截 + 调用栈定位包名、官方工具目录、入口产物扫描、MCP 命名约定；`/api/state` 的 `sources` 是它的诊断自报告 |
| `src/host/known-tools.ts` | **生成文件**：DSH 官方「工具名 → 提供包」，来自 checkout 的 `docs/tool-catalog.md`；宿主升级后重跑 `pnpm gen-known-tools` |
| `src/host/routes.ts` | 五条 HTTP 路由（state/session/preview/assemble/translate，connection 栅栏 + loopback 回退）与快照/预览；快照带 `defaults`（当前插件版本的内置预设模板），`promptCatalog` 干跑装配返回段/上下文正文，`observedChannels` 按档位汇总注入消息 |
| `src/host/injected.ts` | 注入消息清单：`agent/pre-step` 观察 + 会话历史聚合，**按档位分桶**，按 `source.kind` 记次数与最新正文（供面板按 kind 开关） |
| `src/client/index.ts` | 浏览器入口：只导出 inject/apply |
| `src/client/apply.ts` | 唯一跨域装配点：四个槽位注册；hero/session 槽位以 inject face 提供 `sessionId`（组件不收 ctx） |
| `src/client/contract/` | 域间共享类型（只有 type） |
| `src/client/state/` | 数据层（store/订阅 hooks）与档位解析（与 Host 同规则） |
| `src/client/menu/` | 浮层与席位原语（Popover/Seat/MenuRow/图标/复选行）+ `menu.module.css`；分段选择用宿主 ui-primitives 的 `SegmentedControl`（类型面在 `src/ambient.d.ts`） |
| `src/client/panel/` | 配置面板（ConfigPanel/cards/draft/group-cards/PreviewDialog/options/ToolDescription/translations）+ `panel.module.css`；「+ 新建档位」直接点击建全启用档位、悬停出下拉从 `snapshot.defaults` 复制内置预设；`draft.ts` 从快照派生草稿，旧快照缺 `profile.baseline` 时用顶层 `baseline` 兜底（不用模板默认值）；`cards.ts` 按最终请求的消息分卡（系统提示词/快照/工作区指令/时间采样/自动发现的其他注入消息），行的 `title` 统一放实际注入正文；`options.ts` 的 `CONTEXT_SWITCHES` 只是**已知**上下文的元数据（真正的名单由快照 `contexts` 动态补齐），`CHANNEL_CARDS`、`SECTION_OPTIONS` 同理；`translations.ts` 是已知工具的**内置中文**（key=原始描述文本），`ToolDescription.ts` 是「文A」原文/中文切换与按需翻译 loading |
| `src/client/chips/` | 新会话 chip（`conversation.hero.options`）+ 会话头部 chip（`conversation.session.header.actions`，紧跟「模式」标签）+ 共用 picker |
| `build/` | 本地构建 preset（复刻官方 tsdown.client.ts 产物契约，含 CSS Modules 编译与基线校验；偏差清单见 `../dsh-workspace-sidebar/AGENTS.md`「与官方 preset 的偏差」） |
| `tests/` | 直读 src 的单元测试：host 纯函数、附加规则快照、环境事实（`host/environment-facts.ts`）、不可信下载规则可执行性、v2/v3→v4 结构迁移（不改档位值）、5 个默认预设的字段与 PI 工具面（`defaults.test.mjs`）、tool_search 自动注入/隐藏（`refresh.test.mjs`）、附加规则按档位与子代理跟随（`baseline-runtime.test.mjs`）、面板草稿的旧快照 baseline 兜底（`draft.test.mjs`）、人设开关/覆盖、system 段过滤（含 `global:true` 注册断言）、工具引导自动隐藏（组/单工具/复合成员/延迟）、上下文开关/影子、`/api/state` 快照的 `defaults`/自动发现形状与按档位分组（`routes.test.mjs`）、注入消息分桶（`injected.test.mjs`）、工具来源解析（`sources.test.mjs`）、技能注入去重（`dedupe.test.mjs`） |
| `scripts/smoke.mjs` | 逻辑/DOM 冒烟：happy-dom 里装一遍 lib/client.js，喂假快照渲染面板与两个 chip 并点击；覆盖「+ 新建档位」悬停下拉与预设复制 |
| `scripts/gen-known-tools.mjs` | 从 DSH checkout 的 `docs/tool-catalog.md` 生成 `src/host/known-tools.ts`（`DSH_SRC` 可覆盖 checkout 路径） |
| `scripts/harness.mjs` | 离线激活脚手架：按 loader 方式加载 lib/client.js，验 id/槽位注册/样式注入/inject face |
| `package.json` | bundle 清单；`dsh.client` 段声明客户端注入（sidebar、layout），`exports` 决定宿主能取到哪些子路径 |
| `cordis.patch.yml` | 装载入口：只 insert 一行 `session-context-config` |
| `locale/*.json` | 仅包级 title/description；**界面文案是硬编码中文，没走 locale 服务**（见「已知待优化」） |
| `docs/dsh-web-ui.md` | DSH Web UI 的设计 token、控件几何、槽位接入与验证配方——改 UI 前先读。**同步副本**：权威源在仓库根 `_docs/dsh-web-ui.md`，改设计语言先改根再同步回本文 |

## 构建、安装与验证

构建形态（TS + tsdown）：`pnpm build` 产出 `lib/index.js`（Host 单文件）、`lib/client.js`（浏览器 factory bundle，CSS Modules 编译进产物）、`lib/types/**`；`lib/` **禁止入 git**（`.gitignore` 已忽略，需要时 `pnpm build`；测试/smoke 加载的就是它，克隆/清理后先 build）。

```bash
pnpm install && pnpm build
node --check lib/index.js && node --check lib/client.js
pnpm exec tsc --noEmit

# 单元测试（直读 src）：host 纯函数、附加规则快照、环境事实与 git 探测、不可信下载规则
pnpm test

# 逻辑/DOM 冒烟：happy-dom 里装一遍 lib/client.js，喂假快照渲染面板与两个 chip 并点击
node scripts/smoke.mjs

# 离线激活脚手架
node scripts/harness.mjs
```

`scripts/smoke.mjs` 的依赖（react/react-dom/happy-dom）来自本项目 devDependencies；它断言：触发器是 seat 结构、菜单行带 `aria-checked`、只有选中行有勾、会话头部菜单含状态块与确认块。CSS Modules 类名编译后带 `cp-` 前缀（确定性，见 build/preset.mjs），smoke 的类选择器与真机一致。

**装到 profile**：`plugin_manager` 的 `install_bundle` 指向本目录。profile 里装成 `link:`，所以改文件即时生效、不需要重装。**client bundle 有自动热更**：桌面 boot 图里有 `@deepseek-ai/dsh-client-hmr`（HMR 事件走 `/plugins/events` SSE），Host 按固定间隔 stat-poll `lib/client.js` 的 mtime/ctime/size，变化即推 `rebuilt` 帧重挂该 entry——`pnpm build` 后约 1s 新前端自动出现，**不需要刷新或重启**（改动期间本插件的主面板会因 entry 重挂而关闭，重新打开即可）。**Host 侧不会自动更新**：Host HMR 的 chokidar watch 忽略 `**/node_modules`，link: 安装的源码目录不被 watch，`lib/index.js` 改动要走下面的 `set_plugin` 关→开或重启。**不要刷新页面**：刷新属未定义行为，会刷崩 DSH（偶尔能加载新 bundle）。崩溃恢复用错误对话框的「重启」（会重新 collect 快照），**不要点「禁用第三方插件、备份 profile patch 并重启」**（会停用全部第三方插件并改写 patch）。同版本重复安装会返回 `already-installed`，要更新得先 `remove_bundle` 再 `install_bundle`（或先改 `package.json` 的 version）。安装结果以返回里的 `application: applied` 为准。

**Host 侧热重载（不重启 app）**：`plugin_manager` 的 `set_plugin` 对运行中的行执行关→开（`enabled:false` 再 `true`）；target 必须是 exact entryId `include:session-context-config`（用行 id 本身会得 `unknown-plugin`），返回 `application: applied` 且 `list_plugins` 里 fiberPhase 回 `active` 即新 Host 已加载。**Windows pnpm junction 坑**：link: 安装后 profile node_modules 里的 junction 目标可能被拼坏（`profileDir\D:\...`），bundle 解析报错；修法与验证脚本在 `../dsh-model-efforts/install-to-dsh.ps1`。不要手动往 profile 的 node_modules 拷文件，也不要改 profile 的 `package.json` / `cordis.patch.yml`。

**看真实效果**：桌面端默认不开放调试端口；以 `--remote-debugging-port=9202` 启动后可用 `use-chrome` 技能直连（CDP 端口 9202，`node cdp.mjs eval/screenshot --port=9202`），比系统级鼠标/键盘自动化可靠。不带调试参数时退回截桌面窗口的图核对；**不要用系统级鼠标/键盘自动化**去点用户界面：会打断用户操作、留下文字选中，而且验证价值不如一次截图。

**发版流程（仅在用户明确要求发布时走）**：

1. 本地验证：`pnpm build` → `pnpm test` → `node scripts/smoke.mjs` → `node scripts/harness.mjs`，全绿再谈发布。
2. **版本号只在发布时改**：平时本地修 bug / 加功能一律不动 `package.json` 的 `version`，也不 push、不 publish；用户要求发布时按他指定的版本号改（修 bug 升 patch，加功能升 minor），并 `pnpm build` 让 `lib/` 与版本一致。
3. **不自行 push、不自行发版**：改动提交到本地后，先问用户「是否推送、是否发版」；用户确认后才 `git push`，再 `npm publish`。
4. 发布：在包目录执行 `npm publish`（`prepack` / `prepare` 会重建产物；`files` 已含 `lib/index.js`、`lib/client.js`、`lib/types`、`cordis.patch.yml`、`locale`、`icon`）。账号开了 2FA 时会报 `EOTP`，用 `npm publish --otp=<6 位验证码>` 重试。
5. 核对：`npm view @jia-tools/dsh-session-context-config version` 应返回新版本；再 `remove_bundle` → `install_bundle` 让 profile 里的 link 安装重新解析。

## 约定

- 全文中文；代码标识符用英文。
- **命名**：包名 `dsh-` + kebab-case，`cordis.patch.yml` 的行 id 是包名去掉 `dsh-` 前缀；`profile`（部署档案 `$DSH_PROFILE`）、`preset`（模型/agent 预设）、`mode`（会话头部的「模式」）都是宿主已占的词，不要拿来当词根。
- **代码注释规范**：类/函数级注释写「职责 + 为什么这么设计」；行内只写这一处代码读不出的单点约束和取舍；不写逐行翻译、不写「从哪拆来的/以前怎样」这类过程记录。注释过时比没有更糟——读到与代码矛盾的注释当场以代码为准修或删。行内注释同样用中文。
- 单点约束写进注释，跨文件规则写进本文档并互留锚点，同一约束不双份维护。
- 本目录已是 git 仓库（origin 指向 GitHub）；提交时机是「阶段成果自验通过」时，而不是改完就提。不要自行 push。
- **开关与默认值一律挂在档位（`ContextProfile`）下，不做全局配置**：面板编辑的是档位草稿，Host 按会话所属档位解析（`profileOf(agent)`）；顶层 state 只保留 `lastUsedId` / `sessions` / 顶层 `baseline` 兜底这些既有结构。新增开关（如 `injectDuplicateSkills`）照此办理——档位是用户唯一可见的配置面，全局开关既没有归属、也无法按会话区分。唯一例外是 `tool_search`：它是延迟加载机制的基础设施，由 `planFor` 自动注入/隐藏，不做档位开关（见「核心机制要点」）。

## 核心机制要点

- **四级状态解析（位置即优先级）**：组、server、工具三层共用同一套四态，面板标签为 **开启(force) → 关闭(off) → 延迟(defer) → 默认(on)**，数字小的压过数字大的；同号时靠上的层（组 > server > 工具）优先，但同号结果相同、不产生差异。判定顺序：组 force → 工具 force → 组 off → server force/off → 工具 off/defer → 组/server defer → 注入。**`on`（「默认」）不参与判定、也不落盘**：它就是跟随上一层，组 `defer` / `off` 会把它覆盖成延迟 / 关闭。pi 档位用的是「12 个组 `off` + MCP 组 `defer` + 6 个工具 `force`」——MCP 的延迟让 `tool_search` 照常由 `planFor` 注入。解析同时存在于 Host 与 Client（Client 那份必须与 Host 同规则，改一侧必改另一侧）。
- **延迟不是删除**：延迟工具在 tools 数组里保留「名字 + 功能摘要 + 参数类型骨架」的占位定义（每个参数的名称与类型都在，只剥说明/示例/默认值），完整 schema 由 `tool_search` 以工具结果的形式追加进历史。这样 tools 数组整场不变，加载动作不打断前缀缓存——这是整套设计的核心取舍，别顺手改成「按需注册/注销」。**类型不能从骨架里省**：只留 required 参数会把可选布尔/数字当字符串传（`plugin_manager` 的 `enabled: false` 会报 "must be a boolean"）。
- **`tool_search` 是延迟加载的基础设施，不进档位表**：`planFor` 在算完其它工具的终态后特判——只要还有别的延迟工具，就把它排除出 `deferred` / `hidden`，让 `syncToolSearch` 注册的完整定义直接可见；一个延迟工具都没有时，把它放进该 agent 的 `hidden`（全局注册可能来自别的会话，不能让无延迟会话看到空转的搜索工具）。因此 `other: defer` 不会再把 `tool_search` 自己也延迟成自指占位；`/api/state` / `/api/session` / `/api/preview` 的工具清单与面板都不列它，旧状态里的 `tools.tool_search` 在归一化时剪掉。这是对「开关一律挂档位」的显式例外：它是延迟机制本身，不是可配置能力。
- **生效边界**：`agent/created` 时套用会话记录或 `lastUsedId`；已开始的会话不跟随配置变化，只在用户确认切换时重算；`tools/change`（可见工具集合变化）时按同一档位**增量**刷新延迟占位与隐藏面（只加新增、撤消失，未变化的工具不重注册）——整份重建会让当前 step 的延迟工具全部 `unknown tool`，见坑库。`sessions` 映射经 `recordSession` 有界保留最近 500 条：宿主 dispose 一个 agent 后同 sessionId 仍可被 resume 复用（切回已有会话 = 同 id 重新 `agent/created`），不能按事件删条目，被淘汰的会话重开时回落 `lastUsedId`。
- **运行时上下文逐项开关**：`ContextProfile.contexts` 只存关掉的上下文名（缺省=注入）；兼容字段 `runtimeContext` / `workingDirectory` / `baseline.environmentFacts` 在 `normalizeState` / `normalizeProfile` 里一次性迁移成逐项 false。`host/profiles.ts` 对每个 false 在 agent 作用域注册同名非 required 空上下文（required 段靠它遮住 required 标志），`src/index.ts` 的全局 `system-prompt/assemble`（`prepend`）在 `next()` 之后按名字过滤；因此 `refreshContext` 不会把 required 段补回。**面板的上下文名单由一次干跑装配动态发现**（快照 `contexts`，含空文本条目）：`CONTEXT_SWITCHES` 只提供已知项的中文名/说明/顺序，装配里出现的未知 name 会按原始 name 自动补行并立即可开关；`subagent:identity` 是已知项之一（order 取 `SUBAGENT_DELEGATION`）。验收：`/api/assemble` 的 `contexts` 与 `refreshedContexts` 都要遵守同一份开关。
- **system 段逐项开关**：`ContextProfile.sections` 只存关掉的段名（缺省=包含）。同一份 `system-prompt/assemble` 过滤器在 `next()` 之后按名字删 `assembly.sections`；`refreshContext` 不重跑 sections，所以不需要影子段。**过滤器必须 `{prepend:true, global:true}` 注册**（见坑库：assemble 走 scopeTarget 过滤派发）。`deployment:persona-prefix` / `deployment:persona-suffix` 与 4 条附加规则段受保护：人设是 `prompt.prefix` / `prompt.suffix` 两个独立槽位（各自 `enabled/override/text`），附加规则走 `profile.baseline`（`host/baseline-runtime.ts` 的 per-agent scoped 段）。**`tool:*` 强绑定工具状态，不进 `profile.sections`、面板不列、不单独配置**：同一过滤器在 `hiddenToolGuide` 里按工具/组终态裁掉（复合段 jobs/goal/schedule/session-query 看成员，至少一个成员开启/延迟才保留）；`normalizeSections` 剪掉旧状态的 `tool:*` 键。`sccFullSections: true` 是面板列目录的私有旁路（返回未过滤名单），`promptCatalog` 会再剔除 `tool:*`；真正的请求路径不带这个字段。面板段列表按 `assembly.sections` 的**实际顺序**扁平排列（不分「人设/宿主固定/工具引导」小区域），人设两个槽位按各自 order 插在列表里（prefix 紧随 identity，suffix 在 app:web-surface 之后）；附加规则 order 固定 20000+，用「本插件附加 · 本档位」小标题与分割线分隔并排在最后；消息卡标题不带「system 消息 / user 消息」前缀，角色由右上角 `role:` 标签表达。每行的 `title` 是当前注入正文（模板变量已按本次装配渲染；关闭的段给出关闭前文本）。**已关闭但当前装配里没有出现的已知段也会列**（让条件段关掉后仍能重新开启），meta 标「已关闭 · 当前未出现」；这是档位状态里的显式 false，不是该档位多出的注入项——段清单本身是所有 live 装配共享的，真在任一 live 会话里注入时各档位都会看到。
- **默认预设与状态版本兼容**：`DEFAULT_PROFILES` 有 5 个**插件通用**模板：`full`（全部开启；编排/目标/调度/插件开发/MCP/第三方延迟）、`lean`（隐藏编排/目标/调度/插件开发；MCP/第三方延迟）、`minimal`（交互/技能/协作/编排/目标/调度/MCP/插件开发/第三方全关；人设用 `MINIMAL_PROMPT`）、`chat`（全关）、`pi`（参考 Pi 的设计理念做精简运行时，不逐项复刻：12 个组 `off`、MCP 组 `defer` 作为默认（含 `list_mcp_resources|list_mcp_resource_templates|read_mcp_resource` 三个共享资源工具，随组延迟，宿主 `mcp-resource-servers` 段正好点名它们），read/write/edit/pwsh/read_image/skill 六个工具用工具级 `force` 提回注入，其余工具彻底不出现；MCP 延迟让 `tool_search` 照常自动注入（模板 `tools` 不写 `tool_search`）；skills「目录注入 + 正文按需读」由 skill-catalog 消息 + `skill` 工具承载，`injectDuplicateSkills: false` 让同一份正文不重复注入；人设只留前置（PI_PROMPT），后缘槽关闭；提示词首行明确运行在 DeepSeek Harness，只留身份行与行为规则、不写 `<tools>` 清单——工具说明由 tools 数组 description 与 `tool:*` 引导段自动注入，免得与工具面双份维护）。**它们不是用户当前配置的副本**：首次安装由 `defaultState` 克隆；新建下拉通过 `/api/state` 的 `defaults` 读当前插件版本，复制成 `custom-*`。`normalizeState` 的 v2/v3→v4 **只做结构迁移**（prompt 双槽位、contexts/sections 旧字段、缺失的新字段、version），**不替换任何档位的名称/组/提示词/开关，也不新增 chat/pi**。组划分：`platform` = `load_workspace_dependencies|working_directory|lsp`，`devtools` = `plugin_manager|cordis_*`，`mcp` 除 `mcp_connector_`/`mcp__` 前缀外还收三个**共享**资源工具（`list_mcp_resources|list_mcp_resource_templates|read_mcp_resource`：名字不带 mcp 前缀，由 mcp-resources 包在 scope 里有首个 provider 时注册；留在 `other` 会让 MCP 组开关漏掉资源能力，而宿主 `mcp-resource-servers` 段会点名它们）。面板的 MCP 组按 server 分块渲染，无 server 的共享工具必须先列在组头下的「资源访问」区，否则不会出现在任何一块里。`normalizeState` 接受 v2/v3/v4；custom-*、sessions、baseline 原样保留。
- **工具说明翻译（只供面板显示）**：默认显示中文。已知工具走 `src/client/panel/translations.ts` 的内置字典（key=原始描述文本）；未知工具在面板挂载时自动按需翻译（串行队列，带 loading/失败重试），走 `POST /session-context-config/api/translate` → 命中 `$DSH_HOME/session-context-config-translations.json`（key 是**原始文本**）即返回，否则用 `agentDefaultModel.currentSelection()` + `llm.prepareCall`（与 dsh-web-extract 同链路）翻译并落盘。每个工具的显示语言按工具名记在 localStorage（`dsh-session-context-config:tool-lang`，默认 `zh`，切回原文会记住）。模型侧工具 schema / 延迟摘要 / `tool_search` 完全不动。
- **附加规则与环境事实分离**：界面上的「附加规则」只保留三段固定提示词与一段自定义文本（勾选才注入，未勾选也可编辑，纯空白视同空段）；它按档位存 `profile.baseline`，根会话用自己档位，子代理沿 `parentSession` 跟随根档位（解析不到时用顶层 baseline 兜底）。环境事实是 `contexts` 里的 `session-context-config:environment`，按档位开关；子代理没有档位，环境事实默认保留。
- **工具来源（面板显示，只读）**：宿主 tools 注册表**不记录注册者**（`register` 只存定义与一条 `tools.register()` effect），所以来源按四级证据解析：① 装载后包一层 `tools.register`，从**调用栈**第一个业务文件帧反查包（`host/sources.ts`；`this.ctx` 是调用方 ctx，但 agent 作用域的 fiber 会指到 `agent-preset-registry`，只有栈指向真正注册方）；② 官方工具目录静态表（`known-tools.ts`，与当前真正装载的入口求交；同名多实现如 `pwsh` 用工具描述在候选包里消歧）；③ 入口产物扫描（只取「确实注册过工具」的入口，只认唯一命中，面板标为推断）；④ MCP 命名约定（`mcp__<server>__` / `mcp_connector_`，比插件归属更有信息量，优先级最高）。都不命中显示「未识别」，不猜。面板在工具名下方显示短名（包本地化标题优先，否则包短名），tooltip 给完整包名、Loader 入口和判定依据；`/api/state` 的 `tools[].source` 与 `sources`（诊断计数）同步暴露。
- **注入内容自动发现**：面板不维护段/上下文/消息的全量名单。每次 `/api/state` 对**每种 live preset 挑一个限制最少的根会话**干跑 `assemble({ sccFullSections: true })`（上限 8 份），按 name 合并段与上下文（先出现的顺序优先，空影子不覆盖另一档位的非空正文），变量按各自 `assembly.variables` 渲染；空段不列、`tool:*` 不列（强绑定工具状态，不单独配置）、空上下文保留。user 消息来源由 `host/injected.ts` 按**根会话实际归属的档位**分组（applied 优先，回落 `sessions` 记录；无档位归 `none`），组内合并 `deriveMessages()` 历史与 `agent/pre-step` 观察（被通道关掉的消息也记录），面板只取**当前选中档位**那一组。新版本/新插件新增的段、上下文或 user kind 会自动出现；只有呈现质量（中文名/说明）才需要补 `SECTION_OPTIONS` / `CONTEXT_SWITCHES`。**消息 kind 可关**：每行写 `profile.channels[kind]='off'`，Host 的 pre-step 过滤器按同一键剔除；列表底部可手动输入任意 kind 提前关闭（写入同一 `channels` 表，未观察到的以「手动」行保留），已知通道 id/来源拒绝重复添加。运行期消息可能承载状态同步，UI 必须保留风险提示。**调用时机**：不是每请求/定时——只在页面首次挂载快照组件（面板/chip，store 为空时）、手动「重新读取」、保存、切换档位时计算（`/api/state` GET/POST 与 `/api/session` POST 都返回快照）；同一页面快照由 client store 复用。没有版本/插件键缓存；版本/插件变化等下次拉取自然生效。单次最多 8 份装配，工具目录另有 15s 缓存。
- **面板草稿与「重新读取」**：草稿干净时跟随快照重建；有未保存改动时冻结（chip 切档位、外部快照更新都不得覆盖）。「重新读取」是显式丢弃入口：重新拉快照后按最新响应重建草稿并置干净；读取失败时草稿留在组件里，重试成功后按同一路径重建。
- **技能注入去重（档位开关 `injectDuplicateSkills`，默认开=注入重复触发的 skill）**：用户消息里任意空白边界的 `/name` 会让宿主 tool-skill **无条件**注入整份技能正文；模型此前若已用 `skill` 工具加载过同一技能，同一串文本就会在上下文里出现两次（实测同一会话 `tool/result` 与 `skill-invocation` 两份正文 sha1 相同）。开关语义与面板其它选项一致（勾选=注入，默认勾选）：`false` 时本插件在同一个 `agent/pre-step` 过滤器里按**逐字相等**剔除重复的那一份：判据取 `session.deriveMessages()`（只走 surface 派生，压缩/替换掉的正文查不到 → 保留注入，不丢指令），拿不到会话或派生失败时不去重。只作用于当前档位的根会话，不改模型可见内容。旧状态字段 `dedupeSkillInjection: true` 读入时按相反语义迁移成 `false`。**不要**改成「本会话加载过就跳过」的记账式判定：那条路径在压缩后会把指令永久删掉。回归 `tests/dedupe.test.mjs`。
- 切换档位会重建整个工具表与前缀缓存；面向用户的确认话术已写在菜单里，改动这段行为时同步它。

## 关键技术边界与坑

> ⚠️ **宿主没有 `ctx.agents.roots()`，根会话判定必须看会话头**
> 症状：宿主日志刷 `[session-context-config] roots: ctx.agents.roots is not a function`（单次宿主运行里 792 条），而「档位只作用于根会话」实际失效——子代理也被套上了档位与通道过滤。
> 根因：AgentRegistry（rc.1 / rc.2 均如此）只有 `list` / `turnBoundaryOf` / initiator 面，没有 `roots`；旧实现每次调用都抛 TypeError，被 catch 吞掉后恒返回 `true`，错误只留在日志里。
> 正解：`isRootAgent` 按会话头判——子代理 `header.origin === 'subagent'`；fork 会话带 `parentSession` 但没有 origin，仍是根会话；拿不到会话信息时保守按根处理。回归：`tests/sessions.test.mjs`（假 ctx 的 `agents.roots` 直接抛，断言一次都不碰）。
> 教训：宿主服务面按名字猜会静默降级——`catch` 后回退一个「看起来安全」的默认值比抛错更难发现；新增服务调用先对 checkout 的类定义核方法名。

> ⚠️ **更新插件不能改用户配置，迁移只能做结构转换**
> 症状：改了 `DEFAULT_PROFILES` 或更新插件后，配置页里的 `full/lean/minimal` 没变；或反过来担心用户档位被新预设替换。
> 根因：`session-context-config.json` 的 `profiles` 是**用户配置**，`DEFAULT_PROFILES` 只在没有状态文件（`defaultState`）时使用；v2/v3→v4 迁移只转换字段结构，不替换任何档位的值。
> 正解：默认预设只作为新建下拉的模板，更新插件不改用户配置；不要为了同步预设去改迁移、升 state VERSION 或写用户 state。旧状态迁移的验收口径是「用户值原样保留」，不是「换成新内置值」。
> 验证：`tests/sections.test.mjs` 的 v3→v4 用例断言自定义 `full` / `chat` 的名称、组、提示词原样保留；`GET /api/state` 的 `defaults` 是 5 档，`profiles` 是用户档位。

> **client 产物必须单文件，源码可多模块**：浏览器只服务 `dsh.client` 声明的入口（批量资源 URL `plugins/??<id>/client.js,…&rev=<hash>` 中的资源名），但构建形态下源码在 `src/client/` 拆成多模块（contract/state/menu/panel/chips + apply.ts），由 tsdown 打成单文件 `lib/client.js`。改客户端源码后 `pnpm build` 即可，桌面自带 client HMR 会在约 1s 内自动重挂该 entry（见「构建、安装与验证」）；不要刷新页面。

> ⚠️ **DSH 的 CSS Module 类名带哈希，不能当选择器/样式契约**
> 症状：照源码写的 `.heroOptions{...}` 完全不生效，编译产物里类名是 `an3WzG_heroOptions`。
> 根因：宿主用 CSS Modules 构建，类名逐版本变化。
> 正解：只依赖**设计 token**（`--dsw-*`）和**槽位锚点** `[data-slot="<slot key>"]`；控件几何按源码数值重写成自己的类。细节见 `docs/dsh-web-ui.md`。

> ⚠️ **新会话行的插件选项被推到行尾**
> 症状：注册在 `conversation.hero.options` 的控件总是贴右端，`margin-right:auto` 之类怎么调都没用。
> 根因：宿主把该槽包在 `.heroOptions` 里并给了 `margin-left:auto`。
> 正解：用槽位锚点选中「装着该槽的那一层」再覆盖——`client.js` 里的 `div:has(> [data-slot="conversation.hero.options"]){margin-left:0}`。注意锚点自身是 `display:contents`，对它设 margin 无效。

> **宿主 `ui-primitives` 是平台种子词，client bundle 的 `require` 直接可用**
> 依据：tag `dsh-v0.2.2-rc.2` 的 `packages/client/web/src/platform.ts` 里 `PLATFORM_MODULES`（11 项）含 `@deepseek-ai/dsh-client-ui-primitives`；require 解析第一跳是种子表（`packages/client/modules/src/client/system.ts` 的 `makeRequire`），与插件自己的 `dsh.client.inject` 无关，手写 bundle 同样命中。`Menu`/`MenuSurface`/`Checkbox`/`SegmentedControl`/`Input`/`Toast`/图标都在包导出面（`ui-primitives/src/index.ts`）。
> 真正 require 不到的是表外 specifier：宿主包自己的依赖（如 `clsx`）与包内子路径——require 这些才会报 `missed the module table`。
> 本项目组件保持自绘（设计选择，不是拿不到）：几何已对齐并有 smoke/截图验证，不为对齐重写；新写组件可直接 import primitives。

- **模块表三层与 `dsh.client` 四字段（本地副本，对应 tag `dsh-v0.2.2-rc.2`）**：① 平台种子表 `PLATFORM_MODULES`（11 项，所有 bundle 共享，require 第一跳命中，与 `dsh.client` 声明无关）→ ② graph 行（声明 `dsh.client` + `exports["./client"]` 的包，`<pkg>` 与 `<pkg>/client` 同键；要稳定 require 另一个包就列进 `dsh.client.external`，Host 据此拓扑排序让依赖 factory 先到，自指与环报错，未到达抛 `missed the module table`）→ ③ 包内 `require.async` 局部 chunk。`dsh.client` 四字段：`platform` 只认 `'web'`；`inject` = 包名边（informational），只驱动所列包 factory 的到达/预取顺序，不做 cordis 组合、不提供服务注入；服务注入看 client 入口自己导出的 `inject`（服务名）；`external` 只管模块表请求、不做 cordis 组合；`immediately` 启动期预取（本项目用了 `immediately: true`）。

> ⚠️ **宿主服务方法解构后再调用会丢 `this`**
> 症状：配置面板下方的工具分组整块消失；`GET /api/state` 里 `tools: 0`，每个 preset 的诊断都是 `Cannot read properties of undefined (reading 'retain')`。
> 根因：`const acquire = registry.acquireScope; await acquire(id)` 把方法从服务对象上摘了下来；当前宿主实现内部用 `this.retain`，严格模式下 `this` 为 `undefined`。目录枚举又是软失败（catch 后记诊断继续），所以界面只表现为「工具区没了」。
> 正解：始终 `registry.acquireScope(id)` 原样调用；租约释放优先 `Symbol.asyncDispose`，同时兜住 `.dispose()`。回归测试 `tests/catalog.test.mjs`。

> ⚠️ **未 inject 的服务不能用属性访问**
> 症状：配置页打不开，接口返回 `cannot get property "connection" without inject`。
> 根因：`Reflect.get(ctx, 'connection')` 与 `ctx.connection` 一样会触发 Cordis 的注入检查，而 `connection` 是可选的、不在 `inject` 名单里。
> 正解：可选服务一律走 `ctx.get(name)`（缺失返回 `undefined`），方法先判存在。验证：`Invoke-WebRequest http://127.0.0.1:<port>/session-context-config/api/state` 应得到 **401**（栅栏拒绝），而不是 400 的注入错误。

> ⚠️ **session 作用域槽位的 `inject` 必须收位置参数，不能去读 `ctx.sessions`**
> 症状：已开始会话的头部 chip（本会话档位切换入口）整块消失，只剩新会话行还能选档位。
> 根因：宿主渲染器把会话 id 作为 `inject` 的第一个实参传入（`packages/client/ui-renderer/src/client/scoped-slots.tsx` 的 `runInject` 传 `binding.key`）；若忽略参数去读 `ctx.sessions.current()`，`sessions` 不在插件 `inject = ['slots']` 名单里，Cordis 注入检查抛错后被 try/catch 吞成 `null`，`SessionChip` 直接 `return null`。新会话行有 `fallbackBlank`（从快照里挑空白会话）兜底，所以症状只出现在已开始的会话。
> 正解：`inject: (sessionId) => ({ sessionId: sessionIdFrom(sessionId) })`（hero 与 header 两个 session 作用域槽位同一写法）。冒烟测试的假 ctx 不带 `sessions` 服务，且 `register` 按槽位作用域传会话 id（`scripts/smoke.mjs` 的 `SESSION_SCOPED_SLOTS` + `inject face 从槽位参数拿到 sessionId` 断言）——假 ctx 自带 `sessions` 会掩盖真实契约。验证：打开已存在会话，`[data-slot="conversation.session.header.actions"]` 内应出现 `button.cp-seat`；切换档位后 `GET /api/session?id=...` 的 tools 数随档位变化，持久化映射写回 `~/.dsh/session-context-config.json` 的 `sessions`。

> ⚠️ **消息卡在 flex column 里必须 `flex:none`**
> 症状：配置页消息卡只剩几条横线，内容全无；档位卡和工具卡正常。
> 根因：`.cp-scroll` 是 flex column；`.cp-msgCard` 的 `overflow:hidden` 会把 flex item 的自动最小高度变成 0，内容超过面板高度时卡片被压扁到只剩边框。
> 正解：`.msgCard { flex: none }`（见 `panel.module.css`）。验证：headless Chrome 加载宿主主题 CSS + 插件编译 CSS，量 `.cp-msgCard` 高度；缺 `flex:none` 时只剩 46/46/16/16，正常时 528/528/171/171。

> ⚠️ **`system-prompt/assemble` 监听器必须 `{global: true}`，跨 scope 稳定触发**
> 症状：段开关/上下文开关只写状态，装配结果毫无变化；单测全绿。
> 根因：宿主在 `core/system-prompt` 用 `scopeTarget(this, scope)` 派发这个 waterfall，Cordis 的 context filter 只放行 `hook.global`、无 filter、或 scope 链上的监听器（`vendor/cordis/src/events.ts` 的 `_resolve`）。`packages/core/scope` 对无 scope 标签的监听器放行，所以根 ctx 监听器并非必然被挡——但带 `global: true` 才与 scope 无关地稳定收到。
> 正解：`ctx.on('system-prompt/assemble', listener, { prepend: true, global: true })`。单测直接调 listener 发现不了，`tests/sections.test.mjs` 额外断言 `hook.options.global === true`。验证：`/api/assemble` 的 sections 不含被关掉的段（contexts 仍可能被宿主的 required 补回，靠 agent 作用域空 shadow 把文本变空，见上下文开关条目）。

> ⚠️ **工具来源只能靠调用栈：`fiber.entry` 会指到造作用域的插件**
> 症状：给 `tools.register` 包一层后，所有 agent 作用域工具（`tool_search`、preset 里的 `schedule_*`）都被标成 `@deepseek-ai/dsh-agent-preset-registry`。
> 根因：`layers.effect(this.ctx, …)` 用的是 use-site ctx；agent 作用域注册的 fiber 属于 `createScope` 铸的 scope fiber（`fiber.runtime.name === 'scope'`），它的 `fiber.entry` 是 owner（`agent-preset-registry`），不是真正注册方。只有调用栈指向注册代码所在文件。
> 正解：栈里「先跳过本插件自己的帧（整包单文件）→ 再跳过 cordis / tools 服务的代理帧 → 取下一帧」；帧路径要剥掉 `:line:col`，自己的文件要 `realpathSync` 对齐（loader 用 profile 的 junction 路径 import，栈按 realpath 打帧，直接用 `import.meta.url` 永远对不上）。回归 `tests/sources.test.mjs`。

> ⚠️ **本插件给延迟工具注册的占位不是「原注册」**
> 症状：装上来源标注后，`session_recall` / `schedule_task` / `plugin_manager` 全被标成本插件。
> 根因：`profiles.applyTo` 会把延迟工具重新注册成占位（`【延迟】…`），这次注册同样经过 `tools.register` 拦截，把真实归属覆盖成了本插件。
> 正解：按 `host/tools.ts` 的 `DEFERRED_DESCRIPTION_PREFIX` 跳过占位注册；真归属交给官方目录/入口产物扫描，或在插件稍后重新注册时捕获。

> ⚠️ **延迟占位只能增量刷新，整份重注册会让当前 step 的延迟工具全部 UNKNOWN_TOOL**
> 症状：开启「延迟」档位后，模型调用 `plugin_manager` / `cordis_inspect_query` 等延迟工具报 `Error: unknown tool "..."`；同一 step 内所有延迟工具都失败，下一个 step 自愈（用户描述为「第一次报错、第二次正常」）。
> 根因：`tools/change` 的 300ms 去抖回调若走 `applyTo`（整份 `release`→重注册），会换掉每个占位定义的**对象身份**。宿主每个 step 的准入集（`tools.resolve` 的 `ResolvedToolSet`）在执行时逐名复核「当前定义 === 准入时定义」且「当前注册 === 准入时注册」，任一不等就把该名字排除、抛 `ToolNotFoundError`。典型触发：`plugin_manager set_plugin` 热重载带延迟工具的插件（如 governance），工具表变化后 300ms 去抖正好落在下一步的模型生成期间。
> 正解：`tools/change` 走 `profiles.refresh()` 增量 diff——已注册的名字直接跳过（摘要以注册簿为准，不能拿占位描述重算，否则【延迟】会套两层）、新增的注册、消失的撤销；`hidden` 面变化才重建 `restrict`（restrict 只影响被 deny 的名字，不改变其它工具的注册身份）。`applyTo` 只用于 `agent/created` 与用户切档位，且重入守卫必须包住 `release`（否则 release 触发的 tools/change 会白排一次去抖）。
> 「消失」的判据必须是**继承层名单**（`tools.view(agent).restrictableNames`），不能只看 `definitions`：占位注册在 agent 自己作用域里，会遮住同名全局工具，`definitions` 里永远还看得见这个名字。只看定义就发现不了「插件已停用、占位却还在、仍能调用已卸载实现」的幽灵工具。
> 验证：`tests/refresh.test.mjs`（未变化的占位只注册一次、背后实现卸载后撤占位、restrict 重建）。

> **人设是两个独立槽位，不是一个总开关**
> `deployment:persona-prefix`（order 0，固定身份之后、所有第一方指导之前，"你是谁"）与 `deployment:persona-suffix`（order 10200，所有第一方指导之后、提示词最末，"收尾叮嘱"）各自配置：`enabled=false` → 该槽位注册空影子（不发送）；`enabled=true && !override` → 不注册（沿用部署 `personaPrefix`/`personaSuffix`）；`override=true` 且 text 非空 → 替换该槽位；`override=true` 且 text 为空 → 该槽位不发送。UI 每个槽位一条开关 + 一条「覆盖部署文本」+ 文本域，两槽位互不影响。不要用「一个总开关 + 一个覆盖」的模型（前缀和后缀的位置、语义、缓存代价都不同，必须分开）。

> ⚠️ **通道过滤器必须按 agent 在 `agent/created` 注册**
> 症状：档位里关掉「注入时间采样」后，请求里仍会出现一条 `Time sampled ...` 的 user 消息（`source.kind: "time-context"`）；工作区指令却能正常滤掉。
> 根因：`time-context` 是 agent preset 插件，在会话创建时挂载，且用 `prepend` 注册 `agent/pre-step`；它晚于插件的全局监听器注册，unshift 后排到全局过滤器**前面**，它追加的时间消息在全局过滤器 `next()` 返回之后才出现。`agent-instructions` 用默认 push（内层），所以能滤掉——不对称由此而来。
> 正解：`agent/created` 时在 `agent.ctx` 上再注册一次同样的过滤器（`{prepend:true}`）。宿主契约（`core/agent` 的 `CreateAgentOptions.setup` 文档）保证 setup 里挂载的预设插件与监听器先于 `agent/created`，所以此时注册才能包住 time-context。全局那份只作拿不到 `agent.ctx.on` 时的兜底。回归：`tests/channels.test.mjs`。

> ⚠️ **工具引导段不是按工具可见性产出的**
> 症状：Chat 档位把工具全部隐藏/关闭后，system 提示里仍追加 pwsh / jobs / goal / workflow 的引导文本；面板里也找不到这些开关（用户实测「全部关闭」后仍多出两段）。
> 根因：`tool-pwsh`、`tool-jobs`、`tool-goal`、`tool-workflow` 注册的是**无条件静态 text**，不读 `context.toolSet`、也不因工具被 restrict 而变空；本插件早期又把 `tool:*` 从 `sections` 过滤与归一化里排除，导致它们既不随工具隐藏、也无法单独关闭。
> 正解：**强绑定工具状态，不单独配置**。`host/tools.ts` 的 `hiddenToolGuide` 在同一 assemble 过滤器里按工具/组终态裁掉；复合段走 `tool-guides.ts` 的别名组与成员表（`jobs`/`goal`/`schedule`/`session-query`），成员全隐藏才隐藏，`defer` 不算隐藏。**判定必须统一交给 `effectiveState`，不要先用「组 = OFF」短路**：工具级 `force` 能把成员提回注入，先短路会得到「工具在、引导段没了」的不一致（回归 `tests/host.test.mjs` 的 force 用例）。
> 验证：`tests/host.test.mjs`（组/单工具/复合/延迟）、`tests/sections.test.mjs`（terminal 隐藏时 pwsh/jobs 被移除、read 保留）、`scripts/smoke.mjs`（工具段不出现在可配置列表）。

- **webServer 路由不自带鉴权**：宿主 webServer 对直接 `register` 的路由不做任何认证/Origin 检查，每个 handler 必须先过 `ctx.connection` 的 `requestRejection`（官方 open-in-app 同款）；宿主无 connection 服务才回退回环 Host 校验。POST 另要求 `application/json`，掐掉 text/plain 简单请求的跨站提交。
- **弹层定位必须先量后放**：内容高度渲染后才知道，`useLayoutEffect` 里量完再 setState，且**同值必须 bail**（返回上一个 state），否则每轮渲染都 set 新对象 → 死循环。
- **Client 端的槽位检查工具用不了**：本版本 `cordis_inspect` 的 Client `Slots.listSubTree` 无论传什么 input 都报 `"input" must be an object`。要查槽位结构直接读宿主源码（路径表见 `docs/dsh-web-ui.md`）。
- **`application: applied` 才是生效**：安装结果里的 `changed` / 日志 / 进程都在，但不等于是新 bundle；以 `application` 字段为准。
- **profile 是链接安装**：不要手动往 profile 的 `node_modules` 里拷文件，也不要改 profile 的 `package.json` / `cordis.patch.yml`——那是 `install_bundle` 的活。

## 排查会话记录（通道/档位是否生效）

解码脚本在 `../dsh-session-bridge/scripts/read-session.mjs`（在该包跑 `npm run session -- --latest`，或 `--session session-<id>` / `--session <file>.zstd`）。它解码 `$DSH_HOME/sessions/**/session.v4.jsonl.zstd`，打印：session 头、该会话在 `session-context-config.json` 里的档位（prompt override、sections off、channels off、contexts off、baseline）、每个 step 的 system 文本长度、user 消息的 `source.kind`、`request/header` 的 tools 数量。

判读口径：

- `system (empty)` = 人设段为空、附加规则全关、其它 system 段也全关/全空；非空看字符数与预览。
- `user time-context` 出现 = 时间采样没被过滤；`agent-instructions` 出现 = 工作区指令没被过滤。两者同时出现/缺失可以区分「配置没生效」和「某条通道的过滤器顺序不对」。
- `request/header tools=0` = 工具全被隐藏，说明档位确实应用到了该会话。
- 会话文件是**多帧 zstd**（每次追加新起一帧），Node 的 `zstdDecompressSync` / `createZstdDecompress` 只解第一帧；脚本按 `28 b5 2f fd` 切帧后逐帧解压。别被「解出来只有 200 字节的 session 头」骗成日志为空。

## 添加或修改 UI 的标准流程

1. 读 `docs/dsh-web-ui.md`：确认槽位、可复用 token、控件几何；要动的宿主源码路径写在该文档的「源码地图」。
2. 改 `src/client/`：样式在 `panel/panel.module.css` 与 `menu/menu.module.css`（编译后类名带 `cp-` 前缀）；两处 chip 复用 `menu/seat.ts` 的 `Seat` / `MenuRow`。
3. `pnpm build`，再 `node scripts/smoke.mjs`；「+ 新建档位」悬停下拉与预设复制也在 smoke 里断言，不通过就别急着截图。
4. `pnpm build` 后约 1s client HMR 自动重挂 entry（**不要刷新页面**）；需要新页面时才重启桌面应用。然后截窗口图，按 DSH 自带控件对齐：触发器 28px 高、菜单行 34px 高、字号 13/20 与 12/16。**配置页版式（页头高度、页签位置、卡片、选中项、开关、折叠说明卡）按 `docs/dsh-web-ui.md` §8 的统一口径**——与 `dsh-skill-mcp-command-manager` 共用，改一处要同步另一侧。
5. 视觉事实有变化才同步 `docs/dsh-web-ui.md`；纯重命名/拆函数不用改文档。

## 已知待优化

- UI 文案硬编码中文，没走 Client locale 服务；`locale/*.json` 只有包级标题。
- 段/上下文的自动发现依赖一次干跑装配：当前没出现、也没被关掉的空条件段不占行（要提前配置只能先让它在会话里出现一次）。
- 自动发现清单的 kind 开关是档位级；关闭 `subagent-settled` / `compact-checkpoint` / `runtime-context` 这类运行期消息会让对应插件收不到自己的通知，只在明确知道作用时关。
- 系统段开关是档位级，只作用于根会话；附加规则也按档位，子代理沿 `parentSession` 跟随所属根会话的档位；解析不到根档位时用顶层 `baseline` 兜底。
- 系统段顺序由宿主 `order` 固定，面板只能包含/排除，不能改先后。
- 工作区指令只能整组关：宿主已把同一批 AGENTS.md/CLAUDE.md 拼成一条 `<system-reminder>`，无法按文件过滤；要排除某类文件名只能在部署级配 `instructionFileCandidates` / `maxBytes`。
- 新建下拉的模板是当前插件版本的 `defaults`；复制结果在面板草稿里是 `custom-*`，保存前不写 state。
- 工具来源只能回溯「本插件装载后」的注册：装载前就注册、又不在官方目录/入口产物里的工具显示「未识别」；官方静态表随 checkout 生成，宿主升级后要重跑 `pnpm gen-known-tools`。

## 文档目录

| 文档 | 角色 | 何时读 |
|---|---|---|
| `README.md` | 用户向说明 | 介绍档位模型、三态落地、数据格式与接口 |
| `docs/dsh-web-ui.md` | 知识笔记 + 事实速查（根 `_docs/dsh-web-ui.md` 的同步副本） | 改 UI、抄 DSH 样式、选槽位、查 token 与几何时 |

## 本文档维护规则

- **核心判据**：只记代码、git log、README 里读不出的东西——为什么这么设计、踩过什么坑、哪些约束不可违反。**过时的条目比缺失更糟**：读到与代码矛盾的断言，当场以代码为准修正。删留只看判据，长度不是标尺。
- **README 与 AGENTS.md 分工**：README 面向使用者（能力、怎么开、数据格式、接口）；AGENTS.md 面向开发（机制取舍、坑、硬约束）。新机制先写 AGENTS.md；只有使用者会直接接触的行为、配置或接口才写 README，且 README 不展开内部判据（如 `deriveMessages` 的 surface 语义）。
- **记**：设计决策的「为什么」（含被否决的方案）、回归坑（症状→根因→正解+验证指针）、跨端契约的同步要求、仓库不可复现的资源与前置。**不记**：方法名与行号、数值与协议标识（归代码常量与定义处注释）、流水账与 git log 可查的元数据、进行中的临时状态。
- **坑条目格式**：一句话断言根因（高发的硬约束用 ⚠️ 块），下面写「症状 → 根因 → 正解 → 验证」；验证指针能补就补。
- **锚点三性**：新增的组件/子系统名必须可 grep、唯一、稳定，写进文档前先 grep 验证。
- **知识归属**：当前任务目标与进度 → 活计划（本仓库暂无）；通用规则 → 本文档；模块特定的操作流程与机制深潜 → `docs/` 对应文档，本文档目录表留入口；单点约束 → 代码注释。
- **指针纪律**：文档间用锚点互指、不复制内容；删除/改名/归档任何载体时，用 grep 清掉全仓指向它的指针。本文档目录表与 `docs/` 文件必须双向一致。
- **模块拆分**：目前单模块，无需拆分。模块局部内容（组件表、坑库、流程）一旦挤压本文档，拆到对应目录的 `AGENTS.md`，本文档换成模块索引表；**所有任务都需要的限制与警告必须留在本文档**。
- **拿不准**：先核实（读代码、查 DSH 源码、问用户），核实后仍无代码依据才不记。
- **代码注释规范**是「约定」节的组成部分，维护本文档时不得丢失或削弱。

### 维护决策表

| 改动类型 | 更新? | 更新什么 |
|---|---|---|
| 加新功能 / 删功能 / 行为变化 | 要 | 概述、关键文件表、必要时标准流程加一步 |
| 纯重构（重命名、拆函数），行为不变 | 不要 | 仅当文档锚点失效时修锚点 |
| 修 bug / 发现新坑 | 要 | 坑库按「症状→根因→正解」入档；坑被修掉就删条目，不留「已修」标记 |
| 改依赖 / 构建 / 安装方式 / 权限 | 要 | 「构建、安装与验证」与对应硬约束 |
| 改了控件几何 / 菜单结构 / 槽位用法 | 要 | `docs/dsh-web-ui.md`；本文档只在规则变化时改 |
| 新增 `docs/` 文档 | 要 | 文档目录表加行，行与文件双向一致 |
| 删 / 归档 / 改名知识载体 | 要 | 目录表同步，并 grep 清指针 |
| 读到文档与代码矛盾 | 要 | 当场以代码为准修正 |
| 拿不准 | 先核实再定 | 查代码 / DSH 源码 / 问用户；核实后仍无据才不记 |
