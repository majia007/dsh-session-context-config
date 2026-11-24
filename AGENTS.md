# AGENTS.md — @jia-tools/dsh-session-context-config（上下文档位）

DSH 的持久插件（bundle）：给新会话选择注入哪些工具、用哪段系统提示词。Host 做档位解析与装配，Client 在 Web UI 里出一个配置面板和两个切换 chip。

**权限与作用边界**：所有 HTTP 路由先过宿主 connection 信任栅栏（Host/Origin/浏览器会话认证；宿主无该服务时回退回环 Host 校验）；状态落 `~/.dsh/session-context-config.json`（新文件不存在时，首次启动把 `context-profile.json` 迁入并留成 `.migrated`；`DSH_HOME` 存在时以它为准）；工具/上下文/系统段档位只作用于根会话，子代理不套用；附加规则例外——子代理沿 `parentSession` 跟随所属根会话的 `profile.baseline`。

档位模型（三级状态表、四态取值与三态落地）、数据与接口格式，都已写在 `README.md`，本文不重复；本文只记代码与 git log 里读不出的约束和坑。

## 模块索引

按知识域分两份模块文档：Host 侧机制/坑、Client 侧面板/坑。根文档只留跨模块与全局内容。

| 模块 | 范围 | 文档 | 何时读 |
|---|---|---|---|
| Host 半边 | `src/index.ts`、`src/host/`、`src/baseline.ts`、`src/tool-guides.ts`、`src/types.ts` | [`src/host/AGENTS.md`](src/host/AGENTS.md) | 改档位解析/延迟/tool_search/上下文与段开关/注入消息/默认行为开关/人设/来源、或排查宿主侧行为不生效时 |
| Client 半边 | `src/client/` | [`src/client/AGENTS.md`](src/client/AGENTS.md) | 改配置面板/卡片/开关控件/chip/浮层、或调 UI 样式与槽位时 |

范围之外（`build/`、`scripts/`、`tests/`、包根清单）没有模块文档，知识都在本文档与「文档目录」列出的 docs。

## 共享基础设施（vendored 副本）

三份**生成文件**（全仓一份规范源，同步渲染后随包提交；勿手改——同步会覆盖，门禁会失败）：

| 文件 | 作用 |
|---|---|
| `build/preset-kernel.mjs` | 构建 preset 的稳定内核；`build/preset.mjs` 只写本包差异（`cp-` 前缀、单表即注） |
| `src/host/connection-fence.ts` | connection 信任栅栏（路由的 `guard()` 包一层 `fenceRequest`，回退 403） |
| `src/client/tokens.module.css` | 共享字号变量块，按 `cp-` 前缀生成 |

`tests/shared-vendored.test.mjs` 是配套门禁：头行 `@<sha256>` = 正文（LF 归一）内容哈希；CSS 里禁止 `--dsh-plugin-*` 与裸 `--fs-*` / `--font-boost`；`lib/client.js` 里只允许带 `cp-` 前缀的名字。门禁读 `lib/` 产物，`pnpm test` 前先 `pnpm build`。

## 构建、安装与验证

构建形态（TS + tsdown）：`pnpm build` 产出 `lib/index.js`（Host 单文件）、`lib/client.js`（浏览器 factory bundle，CSS Modules 编译进产物）、`lib/types/**`；`lib/` **禁止入 git**（`.gitignore` 已忽略，需要时 `pnpm build`；测试/smoke 加载的就是它，克隆/清理后先 build）。

**client 产物必须单文件，源码可多模块**：浏览器只服务 `dsh.client` 声明的入口（批量资源 URL `plugins/??<id>/client.js,…&rev=<hash>` 中的资源名），但构建形态下源码在 `src/client/` 拆成多模块（contract/state/menu/panel/chips + apply.ts），由 tsdown 打成单文件 `lib/client.js`。改客户端源码后 `pnpm build` 即可，桌面自带 client HMR 会在约 1s 内自动重挂该 entry；不要刷新页面。

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

`scripts/smoke.mjs` 的依赖（react/react-dom/happy-dom）来自本项目 devDependencies；它断言：触发器是 seat 结构、菜单行带 `aria-checked`、只有选中行有勾、会话头部菜单含状态块与确认块。CSS Modules 类名编译后带 `cp-` 前缀（确定性，见 `build/preset.mjs`），smoke 的类选择器与真机一致。**happy-dom 的 `window`/`document` 必须在 `require('react-dom')` 之前装成全局**：React 在模块初始化时用 `canUseDOM` 决定 `input` 事件走原生还是 IE9 polyfill，装晚了受控输入框的 `input` 事件不触发 `onChange`，模拟输入会静默不生效（断言看着绿，实际没驱动组件）。

**装到 profile**：`plugin_manager` 的 `install_bundle` 指向本目录。profile 里装成 `link:`，所以改文件即时生效、不需要重装。**client bundle 有自动热更**：桌面 boot 图里有 `@deepseek-ai/dsh-client-hmr`（HMR 事件走 `/plugins/events` SSE），Host 按固定间隔 stat-poll `lib/client.js` 的 mtime/ctime/size，变化即推 `rebuilt` 帧重挂该 entry——`pnpm build` 后约 1s 新前端自动出现，**不需要刷新或重启**（改动期间本插件的主面板会因 entry 重挂而关闭，重新打开即可）。**Host 侧不会自动更新**：Host HMR 的 chokidar watch 忽略 `**/node_modules`，link: 安装的源码目录不被 watch，`lib/index.js` 改动要走下面的 `set_plugin` 关→开或重启。**不要刷新页面**：刷新属未定义行为，会刷崩 DSH（偶尔能加载新 bundle）。崩溃恢复用错误对话框的「重启」（会重新 collect 快照），**不要点「禁用第三方插件、备份 profile patch 并重启」**（会停用全部第三方插件并改写 patch）。同版本重复安装会返回 `already-installed`，要更新得先 `remove_bundle` 再 `install_bundle`（或先改 `package.json` 的 version）。安装结果以返回里的 `application: applied` 为准。

**Host 侧热重载（不重启 app）**：`plugin_manager` 的 `set_plugin` 对运行中的行执行关→开（`enabled:false` 再 `true`）；target 必须是 exact entryId `include:session-context-config`（用行 id 本身会得 `unknown-plugin`），返回 `application: applied` 且 `list_plugins` 里 fiberPhase 回 `active` 即新 Host 已加载。**Windows pnpm junction 坑**：link: 安装后 profile node_modules 里的 junction 目标可能被拼坏（`profileDir\D:\...`），bundle 解析报错；先确认 junction 指向本目录再排查装载。不要手动往 profile 的 node_modules 拷文件，也不要改 profile 的 `package.json` / `cordis.patch.yml`。

## 发版

**仅在用户明确要求发布时走**，本仓库只保三条纪律：

- 平时不动 `package.json` 的 `version`；发版时按「修 bug 升 patch、加功能升 minor」，用户指定优先。
- 发布目标由 `publishConfig.registry` 钉住（随包走），不要换成别的源——缺这个字段时 npm 会按执行环境的默认 registry 发，目标不可控。
- 不自行 `git push`、不自行 `npm publish`：改动先落到本地提交，要发版先问用户。

## 关键文件（全局）

| 文件 | 职责 |
|---|---|
| `package.json` | bundle 清单；`dsh.client` 段声明客户端注入（sidebar、layout），`exports` 决定宿主能取到哪些子路径；`publishConfig.registry` 钉住发布目标 |
| `cordis.patch.yml` | 装载入口：只 insert 一行 `session-context-config` |
| `build/` | 本地构建 preset（复刻官方 tsdown.client.ts 产物契约，含 CSS Modules 编译与基线校验；复刻 client factory 形态、平台基线 externals 与 CSS Modules 注入） |
| `tests/` | 直读 `src` 的单元测试：host 纯函数、附加规则快照、环境事实、不可信下载规则、v2/v3→v4 结构迁移、5 个默认预设、tool_search 自动注入/隐藏、附加规则按档位与子代理跟随、面板草稿兜底、人设开关/覆盖与占位符、system 段过滤（含 `global:true` 注册断言）、工具引导自动隐藏、上下文开关/影子、`/api/state` 快照形状、注入消息分桶、工具来源解析、技能注入去重（`dedupe.test.mjs`）、已读工作区指令去重（`instructions.test.mjs`）、发送顺序（`channels.test.mjs`）、默认行为开关默认值、会话是否套档位的决策（`session-decision.test.mjs`） |
| `scripts/smoke.mjs` | 逻辑/DOM 冒烟：happy-dom 里装一遍 `lib/client.js`，喂假快照渲染面板与两个 chip 并点击；覆盖「+ 新建档位」悬停下拉与预设复制、默认行为卡五个开关（含 `ask_user_question` 等待改写行的秒数输入） |
| `scripts/gen-known-tools.mjs` | 从 DSH checkout 的 `docs/tool-catalog.md` 生成 `src/host/known-tools.ts`（`DSH_SRC` 可覆盖 checkout 路径） |
| `scripts/harness.mjs` | 离线激活脚手架：按 loader 方式加载 `lib/client.js`，验 id/槽位注册/样式注入/inject face |
| `locale/*.json` | 仅包级 title/description；**界面文案是硬编码中文，没走 locale 服务** |

Host 与 Client 的文件级清单在各模块文档的组件锚点表。

## 约定

- 全文中文；代码标识符用英文。
- **命名**：包名 `dsh-` + kebab-case，`cordis.patch.yml` 的行 id 是包名去掉 `dsh-` 前缀；`profile`（部署档案 `$DSH_PROFILE`）、`preset`（模型/agent 预设）、`mode`（会话头部的「模式」）都是宿主已占的词，不要拿来当词根。
- **代码注释规范**：类/函数级注释写「职责 + 为什么这么设计」；行内只写这一处代码读不出的单点约束和取舍；不写逐行翻译、不写「从哪拆来的/以前怎样」这类过程记录。注释过时比没有更糟——读到与代码矛盾的注释当场以代码为准修或删。行内注释同样用中文。
- 单点约束写进注释，跨文件规则写进本文档（或模块文档）并互留锚点，同一约束不双份维护。
- 本目录已是 git 仓库（origin 指向 GitHub）；提交时机是「阶段成果自验通过」时，而不是改完就提。不要自行 push（发版纪律见本文「发版」）。
- **开关与默认值一律挂在档位（`ContextProfile`）下，不做全局配置**：面板编辑的是档位草稿，Host 按会话所属档位解析（`profileOf(agent)`）；顶层 state 只保留 `lastUsedId` / `sessions` / 顶层 `baseline` 兜底这些既有结构。档位是用户唯一可见的配置面，全局开关既没有归属、也无法按会话区分。唯一例外是 `tool_search`：它是延迟加载机制的基础设施，由 `planFor` 自动注入/隐藏，不做档位开关（见 Host 文档）。
- **同规则双端双份**：档位解析（`effectiveState` 与三态落地）在 Host（`src/host/tools.ts`）与 Client（`src/client/state/resolve.ts`）各一份，改一侧必改另一侧；面板显示的四态必须与 Host 实际落地一致。
- **切换档位会重建整个工具表与前缀缓存**：面向用户的确认话术写在菜单里，改这段行为时同步它。

## 添加或修改功能的标准流程

改的是「档位能配什么」时，按类型走完这两侧，漏一侧就会出现「面板能选、Host 不认」或反之：

| 加什么 | Host | Client | 文档/测试 |
|---|---|---|---|
| 档位开关（如五个默认行为开关） | `ContextProfile` 字段 + `DEFAULT_PROFILES` 五个预设 + `normalizeProfile` 默认值 | `contract/types.ts` 的 `Profile` + `allOnProfile` + 对应卡片控件 | README 的档位字段说明 + `tests/defaults.test.mjs` |
| 运行时上下文 | `CONTEXT_ORDER_NAMES`/`CONTEXT_ORDER_FALLBACK` 常量 + 关闭时的同名空影子与 assemble 过滤 | `CONTEXT_SWITCHES` 的中文名/说明 | — |
| 系统段 | 无需登记（自动发现）；受保护段走专用开关 | 需要在面板命名时补 `SECTION_OPTIONS` | — |
| 工具/组归类 | `constants.ts` 组表 + `known-tools.ts`（重跑 `pnpm gen-known-tools`） | `translations.ts` 中文说明 | `tests/defaults.test.mjs` 的组快照 |
| 注入消息来源 | 自动发现（`injected.ts`）；无需登记 | 面板按 kind 自动补行 | — |

新增/修改面板视觉一律按 Client 文档的「添加或修改 UI 的标准流程」。

## 全局危险区

- ⚠️ **不要手改 profile**：不手动往 profile 的 `node_modules` 拷文件，也不改 profile 的 `package.json` / `cordis.patch.yml`——装载、卸载、更新走 `plugin_manager` 的 `install_bundle` / `remove_bundle`。
- ⚠️ **client bundle 自动热更，不要刷新页面**：`pnpm build` 后约 1s 新前端自动出现；刷新是未定义行为，禁止作为验证手段。Host 代码不自动热更，只能 `set_plugin` 关→开或重启。
- ⚠️ **`lib/` 禁止入 git；改 `src` 后跑 smoke/harness 前必须先 `pnpm build`**：否则测到旧产物或报模块找不到。产物必须可重复（同一份 src 两次 build 字节一致）。
- ⚠️ **客户端插件必须导出 `inject`**：漏掉时该 entry 激活失败；真正回滚 profile 的是桌面崩溃恢复对话框的「禁用第三方插件」动作。
- ⚠️ **槽位注册必须包 `ctx.slots.inject(slot, () => register)`**：裸 `register` 在冷启动（声明方尚未激活）时抛错 → 该 entry fiber failed。
- **单测绿 ≠ 运行时证据**：假 ctx 只证明「在期望时机调用了期望服务」；安装版真机行为以实测为准。
- **`application: applied` 才是生效**：安装/启停结果里的 `changed`、日志、进程都在，但不等于是新 bundle。

## 排查会话记录（通道/档位是否生效）

解码 `$DSH_HOME/sessions/**/session.v4.jsonl.zstd`（多帧 zstd，切帧规则见下），打印：session 头、该会话在 `session-context-config.json` 里的档位（prompt override、sections off、channels off、contexts off、baseline）、每个 step 的 system 文本长度、user 消息的 `source.kind`、`request/header` 的 tools 数量。

判读口径：

- `system (empty)` = 人设段为空、附加规则全关、其它 system 段也全关/全空；非空看字符数与预览。
- `user time-context` 出现 = 时间采样没被过滤；`agent-instructions` 出现 = 工作区指令没被过滤。两者同时出现/缺失可以区分「配置没生效」和「某条通道的过滤器顺序不对」。
- `request/header tools=0` = 工具全被隐藏，说明档位确实应用到了该会话。
- 会话文件是**多帧 zstd**（每次追加新起一帧），Node 的 `zstdDecompressSync` / `createZstdDecompress` 只解第一帧；脚本按 `28 b5 2f fd` 切帧后逐帧解压。别被「解出来只有 200 字节的 session 头」骗成日志为空。

## 已知待优化

- UI 文案硬编码中文，没走 Client locale 服务；`locale/*.json` 只有包级标题。
- 段/上下文的自动发现依赖一次干跑装配：当前没出现、也没被关掉的空条件段不占行（要提前配置只能先让它在会话里出现一次）。
- 自动发现清单的 kind 开关是档位级；关闭 `subagent-settled` / `compact-checkpoint` / `runtime-context` 这类运行期消息会让对应插件收不到自己的通知，只在明确知道作用时关。
- 系统段开关是档位级，只作用于根会话；附加规则也按档位，子代理沿 `parentSession` 跟随所属根会话的档位；解析不到根档位时用顶层 `baseline` 兜底。
- 系统段顺序由宿主 `order` 固定，面板只能包含/排除，不能改先后。
- 工作区指令不能按文件名过滤：宿主把同一批 AGENTS.md/CLAUDE.md 拼成一条 `<system-reminder>`；档位的 `channels.workspaceInstructions` 只能整组关，`dedupeReadInstructions` 只按「已完整 read 且内容摘要一致」跳过重复项，不改变注入集合。要排除某类文件名只能在部署级配 `instructionFileCandidates` / `maxBytes`。
- 新建下拉的模板是当前插件版本的 `defaults`；复制结果在面板草稿里是 `custom-*`，保存前不写 state。
- fork 的来源是**按日志内容认的**：宿主 fork 不写 `parentSession`（会话头只有 `isSeeded`），插件用「继承前缀指纹」（前 `inheritedEventCount` 个事件的 `seq|type|time`）先在活会话里找，再按最新优先回读最多 6 条已结束会话（600ms 预算）。来源日志已被清理/迁移失败、或超出回查范围时认不出来，该 fork 记「不处理」，需要在 chip 上手动选一次。
- 工具来源只能回溯「本插件装载后」的注册：装载前就注册、又不在官方目录/入口产物里的工具显示「未识别」；官方静态表随 checkout 生成，宿主升级后要重跑 `pnpm gen-known-tools`。

## 文档目录

| 文档 | 角色 | 何时读 |
|---|---|---|
| `README.md` | 用户向说明 | 介绍档位模型、三态落地、数据格式与接口 |
| `src/host/AGENTS.md` | Host 模块文档 | 改 Host 机制、排查宿主侧不生效时 |
| `src/client/AGENTS.md` | Client 模块文档 | 改面板/chip/样式、走 UI 流程时 |
| `docs/dsh-web-ui.md` | 知识笔记 + 事实速查（根 `_docs/dsh-web-ui.md` 的同步副本） | 改 UI、抄 DSH 样式、选槽位、查 token 与几何时 |

## 本文档维护规则

- **核心判据**：只记代码、git log、README 里读不出的东西（为什么、坑、硬约束）。**过时的文档比没有更糟**：读到与代码矛盾的断言，当场以代码为准修正。删留只看判据，长度不是标尺。
- **记**：设计决策的「为什么」（含被否决的方案）、回归坑（症状→根因→正解+验证指针）、跨模块契约与同步要求、不可复现资源（checkout 路径、profile 位置、junction 脚本）、每次都要遵守的硬约束。**不记**：方法名/行号、数值与协议标识（指向常量与源码，不抄值）、流水账与 git log 可查元数据（完成日期、版本快照、提交哈希）、进行中的临时状态。
- **坑条目格式**：一句话断言根因（高发的硬约束用 ⚠️），下写「症状→根因→正解（+验证指针）」。
- **锚点三性**：新锚点必须可 grep、唯一、稳定（slot key、checkout 路径、错误码这类），写入前先验证。
- **模块拆分**：模块局部内容（该模块的设计要点、坑库、流程、组件表）**出现即写进对应模块文档**，不等根文档膨胀；根只留所有任务都需要的内容。判据是「不动这个模块的任务，踩到这条会不会受伤」：会→根，不会→模块文档。模块按知识域归组，不与目录一一对应；本文件顶部索引表与模块文档双向一致（加/删/改名同步改行），索引表后保留「范围之外=无模块文档」的兜底声明。
- **构建常驻、发版只留纪律**：构建/安装/热重载/真机验证是每次改码都要用的，**留根**；发版是低频且只在用户要求时走，本仓库只留「何时发、怎么记版本、不自行 push」三条纪律。
- **README 与 AGENTS 分工**：README 面向使用者（能力、怎么开、数据格式、接口）；根 AGENTS 面向开发（跨模块约定、构建与安装、危险区、诊断入口）；模块文档面向单模块改造；docs 面向按步骤执行的低频操作。新机制先写对应模块文档；只有使用者会直接接触的行为、配置或接口才写 README，且 README 不展开内部判据（如 `deriveMessages` 的 surface 语义）。
- **质量自检**：改完过「新会话 5 分钟测试」——只读文档能否 (a) 完成构建与安装 (b) 找到改动落点对应的文档 (c) 说出全局危险区 (d) 知道怎么验证。再抽查 3 个反引号锚点能 grep 命中、3 个文档指针目标存在；已拆分时检查索引表每行指向存在的文件、每个模块文档都在索引里、所有任务都需要的警告仍在根。
- **拿不准**：先核实（读代码、查 DSH 源码、问用户），核实后仍无依据才不记。
- **代码注释规范**是「约定」节的组成部分，维护本文档时不得丢失或削弱。

### 维护决策表

| 改动类型 | 更新? | 更新什么 |
|---|---|---|
| 加新功能 / 删功能 / 行为变化 | 要 | 对应模块文档 + 根文档「添加或修改功能」表（新维度）+ 必要时 README |
| 纯重构（重命名、拆函数），行为不变 | 不要 | 代码自解释；仅当文档锚点失效时修锚点 |
| 修 bug / 发现新坑 | 要 | 按归属进模块文档坑库；跨模块的进根「全局危险区」；坑被修复消化就删条目，不留「已修」 |
| 改依赖 / 构建 / 安装方式 / 权限 | 要 | 根「构建、安装与验证」与「全局危险区」 |
| 改发版纪律 / 包元数据 | 要 | 本文「发版」与 `package.json` 的 `version` / `publishConfig` |
| 改控件几何 / 菜单结构 / 槽位用法 | 要 | `docs/dsh-web-ui.md`（权威源在根 `_docs/`，先改根再同步回本地副本） |
| 新增/删除/改名文档（模块或 docs） | 要 | 根「模块索引」与「文档目录」双向改，grep 清死指针 |
| 读到文档与代码矛盾 | 要 | 当场以代码为准修正，两侧同修 |
| DSH 升级 | 要 | 机制类断言按 checkout 复核（基线 0.2.2-rc.5），同步本插件文档与 `docs/dsh-web-ui.md` |
| 拿不准 | 先核实再定 | 查代码 / DSH 源码 / 问用户；核实后仍无依据才不记 |
