# AGENTS.md — @jia-tools/dsh-session-context-config（上下文档位）

DSH 的持久插件（bundle）：给新会话选择注入哪些工具、用哪段系统提示词。Host 做档位解析与装配，Client 在 Web UI 里出一个配置面板和两个切换 chip。

**权限与作用边界**：所有 HTTP 路由先过宿主 connection 信任栅栏（Host/Origin/浏览器会话认证；宿主无该服务时回退回环 Host 校验）；状态落 `~/.dsh/session-context-config.json`（旧名 `context-profile.json`，首次启动自动迁移并留成 `.migrated`；`DSH_HOME` 存在时以它为准）；档位只作用于根会话，子代理不受影响。

档位模型（三级状态表 + 四态解析）、三态怎么落地、数据与接口格式，都已写在 `README.md`，本文不重复；本文只记代码与 git log 里读不出的约束和坑。

## 关键文件

| 文件 | 职责 |
|---|---|
| `src/index.ts` | Host 半边插件面：name/inject/apply + 装配（附加规则段注册、webServer 路由、agent/created·disposed、tools/change、通道拦截 pre-step、运行时上下文与 system 段逐项过滤、重装载补、teardown） |
| `src/types.ts` | 宿主服务面最小结构声明（镜像 checkout 形状，未验证字段不写） |
| `src/baseline.ts` | 附加规则层（界面名；代码沿用 baseline）：行为契约/卡片回执/不可信下载三段提示词 |
| `src/host/constants.ts` | 状态字面量、组表(含 platform/devtools 拆分)、通道表、运行时上下文清单/order 映射、人设段常量、内置档位、token 估算系数 |
| `src/host/translations.ts` | 工具说明按需翻译:默认模型(agentDefaultModel→llm.prepareCall)+ 以原始文本为 key 的缓存(独立文件),只供面板显示 |
| `src/host/state.ts` | 状态文件路径、默认值、**读入归一化**（坏字段静默丢弃，面板与装配不必各自防御） |
| `src/host/tools.ts` | 档位解析（`effectiveState`）与延迟占位（`skeleton`/`placehold`）——**与 `src/client/state/resolve.ts` 同规则双份** |
| `src/host/state-store.ts` | 状态存取：加载/旧文件名迁移/防抖落盘 |
| `src/host/sessions.ts` | 会话与 agent 小工具集：身份解析、blank/根判定、schema/定义读取 |
| `src/host/profiles.ts` | 档位应用运行时：planFor/applyTo/release、tool_search 注册与查询面 |
| `src/host/environment.ts` | 环境事实的 per-agent 注册与释放（探测一次固定；是否进请求按档位 contexts 过滤） |
| `src/host/environment-facts.ts` | 环境事实探测（platform/shell/git）与文本渲染（从 baseline.ts 拆出） |
| `src/host/catalog.ts` | agent preset 目录枚举（15s 缓存） |
| `src/host/routes.ts` | 五条 HTTP 路由（state/session/preview/assemble/translate，connection 栅栏 + loopback 回退）与快照/预览 |
| `src/client/index.ts` | 浏览器入口：只导出 inject/apply |
| `src/client/apply.ts` | 唯一跨域装配点：四个槽位注册；hero/session 槽位以 inject face 提供 `sessionId`（组件不收 ctx） |
| `src/client/contract/` | 域间共享类型（只有 type） |
| `src/client/state/` | 数据层（store/订阅 hooks）与档位解析（与 Host 同规则） |
| `src/client/menu/` | 浮层与席位原语（Popover/Seat/MenuRow/图标/复选行）+ `menu.module.css`；分段选择用宿主 ui-primitives 的 `SegmentedControl`（类型面在 `src/ambient.d.ts`） |
| `src/client/panel/` | 配置面板（ConfigPanel/cards/group-cards/PreviewDialog/options/ToolDescription/translations）+ `panel.module.css`；`cards.ts` 按最终请求的消息分卡（系统提示词/快照/工作区指令/时间采样），`options.ts` 的 `CONTEXT_SWITCHES`、`CHANNEL_CARDS`、`SECTION_OPTIONS` 是 UI 清单，与 Host 的上下文名/段名同步；`translations.ts` 是已知工具的**内置中文**（key=原始描述文本），`ToolDescription.ts` 是「文A」原文/中文切换与按需翻译 loading |
| `src/client/chips/` | 新会话 chip（`conversation.hero.options`）+ 会话头部 chip（`conversation.session.header.actions`，紧跟「模式」标签）+ 共用 picker |
| `build/` | 本地构建 preset（复刻官方 tsdown.client.ts 产物契约，含 CSS Modules 编译与基线校验；偏差清单见 `../dsh-ask-choice/AGENTS.md`） |
| `tests/` | 直读 src 的单元测试：host 纯函数、附加规则快照、环境事实（`host/environment-facts.ts`）、不可信下载规则可执行性、v2→v3 迁移、人设开关/覆盖、system 段过滤（含 `global:true` 注册断言） |
| `scripts/smoke.mjs` | 逻辑/DOM 冒烟：happy-dom 里装一遍 lib/client.js，喂假快照渲染面板与两个 chip 并点击 |
| `scripts/harness.mjs` | 离线激活脚手架：按 loader 方式加载 lib/client.js，验 id/槽位注册/样式注入/inject face |
| `package.json` | bundle 清单；`dsh.client` 段声明客户端注入（sidebar、layout），`exports` 决定宿主能取到哪些子路径 |
| `cordis.patch.yml` | 装载入口：只 insert 一行 `session-context-config` |
| `locale/*.json` | 仅包级 title/description；**界面文案是硬编码中文，没走 locale 服务**（见「已知待优化」） |
| `docs/dsh-web-ui.md` | DSH Web UI 的设计 token、控件几何、槽位接入与验证配方——改 UI 前先读 |

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

# 离线激活脚手架（B0 预检）
node scripts/harness.mjs
```

`scripts/smoke.mjs` 的依赖（react/react-dom/happy-dom）来自本项目 devDependencies；它断言：触发器是 seat 结构、菜单行带 `aria-checked`、只有选中行有勾、会话头部菜单含状态块与确认块。CSS Modules 类名编译后带 `cp-` 前缀（确定性，见 build/preset.mjs），smoke 的类选择器与真机一致。

**装到 profile**：`plugin_manager` 的 `install_bundle` 指向本目录。profile 里装成 `link:`，所以改文件即时生效、不需要重装。**client bundle 有自动热更**：桌面 boot 图里有 `@deepseek-ai/dsh-client-hmr`（2026-11-09 实测 `/plugins/events` SSE 返回 200，旧文档「桌面没有 client HMR」错误），Host 每 500ms stat-poll `lib/client.js` 的 mtime/ctime/size，变化即推 `rebuilt` 帧重挂该 entry——`pnpm build` 后约 1s 新前端自动出现，**不需要刷新或重启**（用临时标记实证；期间本插件的主面板会因 entry 重挂而关闭，重新打开即可）。**Host 侧不会自动更新**：Host HMR 的 chokidar watch 忽略 `**/node_modules`，link: 安装的源码目录不被 watch，`lib/index.js` 改动要走下面的 disable→enable 或重启。**不要刷新页面**：实测刷崩过 DSH（偶尔能加载新 bundle 但属未定义行为）。崩溃恢复用错误对话框的「重启」（会重新 collect 快照），**不要点「禁用第三方插件、备份 profile patch 并重启」**（会停用全部第三方插件并改写 patch）。同版本重复安装会返回 `already-installed`，要更新得先 `remove_bundle` 再 `install_bundle`（或先改 `package.json` 的 version）。安装结果以返回里的 `application: applied` 为准。

**Host 侧热重载（不重启 app）**：`plugin_manager` 对运行中的行执行 disable → enable；target 必须是 exact entryId `include:session-context-config`（用行 id 本身会得 `unknown-plugin`），返回 `application: applied` 且 `list_plugins` 里 fiberPhase 回 `active` 即新 Host 已加载。**Windows pnpm junction 坑**：link: 安装后 profile node_modules 里的 junction 目标可能被拼坏（`profileDir\D:\...`），bundle 解析报错；修法与验证脚本先例在 `../dsh-model-efforts/install-to-dsh.ps1`。不要手动往 profile 的 node_modules 拷文件，也不要改 profile 的 `package.json` / `cordis.patch.yml`。

**看真实效果**：桌面端默认不开放调试端口；以 `--remote-debugging-port=9202` 启动后可用 `use-chrome` 技能直连（CDP 端口 9202，`node cdp.mjs eval/screenshot --port=9202`），比系统级鼠标/键盘自动化可靠。不带调试参数时退回截桌面窗口的图核对；**不要用系统级鼠标/键盘自动化**去点用户界面：会打断用户操作、留下文字选中，而且验证价值不如一次截图。

## 约定

- 全文中文；代码标识符用英文。
- **命名**：包名 `dsh-` + kebab-case，`cordis.patch.yml` 的行 id 是包名去掉 `dsh-` 前缀；`profile`（部署档案 `$DSH_PROFILE`）、`preset`（模型/agent 预设）、`mode`（会话头部的「模式」）都是宿主已占的词，不要拿来当词根。
- **代码注释规范**：类/函数级注释写「职责 + 为什么这么设计」；行内只写这一处代码读不出的单点约束和取舍；不写逐行翻译、不写「从哪拆来的/以前怎样」这类过程记录。注释过时比没有更糟——读到与代码矛盾的注释当场以代码为准修或删。行内注释同样用中文。
- 单点约束写进注释，跨文件规则写进本文档并互留锚点，同一约束不双份维护。
- 本目录已是 git 仓库（origin 指向 GitHub）；提交时机是「阶段成果自验通过」时，而不是改完就提。不要自行 push。

## 核心机制要点

- **四级状态解析**：组和 server 只给默认值，`force` / `off` 两个极端压过子项；工具级只有三态。解析同时存在于 Host 与 Client（Client 那份必须与 Host 同规则，改一侧必改另一侧）。
- **延迟不是删除**：延迟工具在 tools 数组里保留「名字 + 功能摘要 + 必需参数」的占位定义，完整 schema 由 `tool_search` 以工具结果的形式追加进历史。这样 tools 数组整场不变，加载动作不打断前缀缓存——这是整套设计的核心取舍，别顺手改成「按需注册/注销」。
- **生效边界**：`agent/created` 时套用会话记录或 `lastUsedId`；已开始的会话不跟随配置变化，只在用户确认切换时重算；`tools/change`（可见工具集合变化）时就地按同一档位重算，因为那一刻 schema 本来就在变，不额外付缓存代价。
- **运行时上下文逐项开关**：`ContextProfile.contexts` 只存关掉的上下文名（缺省=注入）；旧 `runtimeContext` / `workingDirectory` / `baseline.environmentFacts` 在 `normalizeProfile` 里一次性迁移成逐项 false。`host/profiles.ts` 对每个 false 在 agent 作用域注册同名非 required 空上下文（required 段靠它遮住 required 标志），`src/index.ts` 的全局 `system-prompt/assemble`（`prepend`）在 `next()` 之后按名字过滤；因此 `refreshContext` 不会把 required 段补回。验收：`/api/assemble` 的 `contexts` 与 `refreshedContexts` 都要遵守同一份开关。
- **system 段逐项开关**：`ContextProfile.sections` 只存关掉的段名（缺省=包含）。同一份 `system-prompt/assemble` 过滤器在 `next()` 之后按名字删 `assembly.sections`；`refreshContext` 不重跑 sections，所以不需要影子段。**过滤器必须 `{prepend:true, global:true}` 注册**（见坑库：assemble 走 scopeTarget 过滤派发）。`deployment:persona-prefix` / `deployment:persona-suffix` 与 3 条附加规则段受保护：人设是 `prompt.prefix` / `prompt.suffix` 两个独立槽位（各自 `enabled/override/text`），附加规则走全局 baseline 开关。**工具引导段（`tool:*`）跟随工具可用性（工具被隐藏时宿主不再产出文本），不落 `profile.sections`，归一化时剪掉，面板也不列**。`sccFullSections: true` 是面板列目录的私有旁路（返回未过滤名单）；真正的请求路径不带这个字段。面板段列表按 `assembly.sections` 的**实际顺序**扁平排列（不再分「人设/宿主固定/工具引导」小区域），人设两个槽位按各自 order 插在列表里（prefix 紧随 identity，suffix 在 app:web-surface 之后）；附加规则 order 固定 20000+，用「本插件附加 · 全局」小标题与分割线分隔并排在最后；消息卡标题不带「system 消息 / user 消息」前缀，角色由右上角 `role:` 标签表达。
- **内置档位与 v4 迁移**：`full` = 全部开启 + 编排/目标/调度/MCP/插件开发/第三方延迟；`lean` = full 再隐藏编排/目标/调度/插件开发；`minimal` = lean 再隐藏交互/技能与网络/协作/MCP/第三方，**平台（工作目录、随包依赖路径、lsp）始终开启**。组已拆分：`platform` = `load_workspace_dependencies|working_directory|lsp`，`devtools` = `plugin_manager|cordis_*`。`normalizeState` 接受 v2/v3/v4；v3→v4 **就地替换三个内置 id 的定义**（不新增缺失的内置档位），custom-*、sessions、baseline 原样保留。
- **工具说明翻译（只供面板显示）**：默认显示中文。已知工具走 `src/client/panel/translations.ts` 的内置字典（key=原始描述文本）；未知工具在面板挂载时自动按需翻译（串行队列，带 loading/失败重试），走 `POST /session-context-config/api/translate` → 命中 `$DSH_HOME/session-context-config-translations.json`（key 是**原始文本**）即返回，否则用 `agentDefaultModel.currentSelection()` + `llm.prepareCall`（与 dsh-web-extract 同链路）翻译并落盘。每个工具的显示语言按工具名记在 localStorage（`dsh-session-context-config:tool-lang`，默认 `zh`，切回原文会记住）。模型侧工具 schema / 延迟摘要 / `tool_search` 完全不动。
- **附加规则不再控制环境事实**：界面上的「附加规则」只保留三段提示词；环境事实是 `contexts` 里的 `session-context-config:environment`，按档位开关。子代理没有档位，环境事实默认保留。
- 切换档位会重建整个工具表与前缀缓存；面向用户的确认话术已写在菜单里，改动这段行为时同步它。

## 关键技术边界与坑

> **client 产物必须单文件，源码可多模块**：浏览器只服务 `dsh.client` 声明的入口（`/plugins/<pkg>/client.js`），但构建形态下源码在 `src/client/` 拆成多模块（contract/state/menu/panel/chips + apply.ts），由 tsdown 打成单文件 `lib/client.js`。改客户端源码后 `pnpm build` 即可，桌面自带 client HMR 会在约 1s 内自动重挂该 entry（见「构建、安装与验证」）；不要刷新页面。

> ⚠️ **DSH 的 CSS Module 类名带哈希，不能当选择器/样式契约**
> 症状：照源码写的 `.heroOptions{...}` 完全不生效，编译产物里类名是 `an3WzG_heroOptions`。
> 根因：宿主用 CSS Modules 构建，类名逐版本变化。
> 正解：只依赖**设计 token**（`--dsw-*`）和**槽位锚点** `[data-slot="<slot key>"]`；控件几何按源码数值重写成自己的类。细节见 `docs/dsh-web-ui.md`。

> ⚠️ **新会话行的插件选项被推到行尾**
> 症状：注册在 `conversation.hero.options` 的控件总是贴右端，`margin-right:auto` 之类怎么调都没用。
> 根因：宿主把该槽包在 `.heroOptions` 里并给了 `margin-left:auto`。
> 正解：用槽位锚点选中「装着该槽的那一层」再覆盖——`client.js` 里的 `div:has(> [data-slot="conversation.hero.options"]){margin-left:0}`。注意锚点自身是 `display:contents`，对它设 margin 无效。

> **宿主 `ui-primitives` 是平台种子词，client bundle 的 `require` 直接可用**（2026-11-08 实证，修正旧条目「require 只有 react / react-dom」的错误断言）
> 实证：tag `dsh-v0.2.2-rc.1` 的 `packages/client/web/src/platform.ts` 里 `PLATFORM_MODULES`（11 项）含 `@deepseek-ai/dsh-client-ui-primitives`；require 解析第一跳是种子表（`packages/client/modules/src/client/system.ts` 的 `makeRequire`），与插件自己的 `dsh.client.inject` 无关，手写 bundle 同样命中；重构前的旧内核 `web/src/seed.ts` 也一直含这行。`Menu`/`MenuSurface`/`Checkbox`/`SegmentedControl`/`Input`/`Toast`/图标都在包导出面（`ui-primitives/src/index.ts`）。
> 真正 require 不到的是表外 specifier：宿主包自己的依赖（如 `clsx`）与包内子路径——require 这些才会报 `missed the module table`。
> 本项目组件仍保持自绘（历史设计选择，不是拿不到）：几何已对齐并有 smoke/截图验证，不为对齐翻新；新写组件可直接 import primitives。

- **模块表三层与 `dsh.client` 四字段**：require 面 = 平台种子表（上文 11 项，人人相同）→ graph 行（声明 `dsh.client` + `exports["./client"]` 的包；`<pkg>` 与 `<pkg>/client` 同键）→ 包内局部 chunk。要稳定 require 另一个包，把它列进 `dsh.client.external`（Host 据此拓扑排序让依赖 factory 先到；自指与环报错）；`inject` 是双重角色（所列包的 cordis client 插件组合进你的 entry + factory 先到）；`platform` 只认 `'web'`；本项目 `dsh.client` 用了 `immediately: true`（模块系统启动期预取脚本注册 factory）。完整实证版在仓库根 `../AGENTS.md`「Client bundle 模块表与 require 面」。

> ⚠️ **宿主服务方法解构后再调用会丢 `this`**
> 症状：配置面板下方的工具分组整块消失；`GET /api/state` 里 `tools: 0`，每个 preset 的诊断都是 `Cannot read properties of undefined (reading 'retain')`。
> 根因：`const acquire = registry.acquireScope; await acquire(id)` 把方法从服务对象上摘了下来；当前宿主实现内部用 `this.retain`，严格模式下 `this` 为 `undefined`。目录枚举又是软失败（catch 后记诊断继续），所以界面只表现为「工具区没了」。
> 正解：始终 `registry.acquireScope(id)` 原样调用；租约释放用 `Symbol.asyncDispose`（旧宿主可能给 `.dispose()`，两个都兜）。回归测试 `tests/catalog.test.mjs`。

> ⚠️ **未 inject 的服务不能用属性访问**
> 症状：配置页打不开，接口返回 `cannot get property "connection" without inject`。
> 根因：`Reflect.get(ctx, 'connection')` 与 `ctx.connection` 一样会触发 Cordis 的注入检查，而 `connection` 是可选的、不在 `inject` 名单里。
> 正解：可选服务一律走 `ctx.get(name)`（缺失返回 `undefined`），方法先判存在。验证：`Invoke-WebRequest http://127.0.0.1:<port>/session-context-config/api/state` 应得到 **401**（栅栏拒绝），而不是 400 的注入错误。

> ⚠️ **session 作用域槽位的 `inject` 必须收位置参数，不能去读 `ctx.sessions`**
> 症状：已开始会话的头部 chip（本会话档位切换入口）整块消失，只剩新会话行还能选档位。
> 根因：宿主渲染器把会话 id 作为 `inject` 的第一个实参传入（`packages/client/ui-renderer/src/client/scoped-slots.tsx` 的 `runInject` 传 `binding.key`）；旧代码忽略参数改用 `ctx.sessions.current()`，而 `sessions` 不在插件 `inject = ['slots']` 名单里，Cordis 注入检查抛错后被 try/catch 吞成 `null`，`SessionChip` 直接 `return null`。新会话行有 `fallbackBlank`（从快照里挑空白会话）兜底，所以症状只出现在已开始的会话。
> 正解：`inject: (sessionId) => ({ sessionId: sessionIdFrom(sessionId) })`（hero 与 header 两个 session 作用域槽位同一写法）。冒烟测试的假 ctx 原先自带 `sessions` 服务，掩盖了真实契约；现已删除，并要求 `register` 按槽位作用域传会话 id（`scripts/smoke.mjs` 的 `SESSION_SCOPED_SLOTS` + `inject face 从槽位参数拿到 sessionId` 断言）。验证：打开已存在会话，`[data-slot="conversation.session.header.actions"]` 内应出现 `button.cp-seat`；切换档位后 `GET /api/session?id=...` 的 tools 数随档位变化，持久化映射写回 `~/.dsh/session-context-config.json` 的 `sessions`。

> ⚠️ **消息卡在 flex column 里必须 `flex:none`**
> 症状：配置页四张消息卡只剩几条横线，内容全无；档位卡和工具卡正常。
> 根因：`.cp-scroll` 是 flex column；`.cp-msgCard` 的 `overflow:hidden` 会把 flex item 的自动最小高度变成 0，内容超过面板高度时卡片被压扁到只剩边框。
> 正解：`.msgCard { flex: none }`（已写在 `panel.module.css`）。验证：headless Chrome 加载宿主主题 CSS + 插件编译 CSS，量 `.cp-msgCard` 高度；无 `flex:none` 时 46/46/16/16，修复后 528/528/171/171。

> ⚠️ **`system-prompt/assemble` 监听器必须 `{global: true}`，否则真机上根本不触发**
> 症状：段开关/上下文开关只写状态，装配结果毫无变化；单测全绿。
> 根因：宿主在 `core/system-prompt` 用 `scopeTarget(this, scope)` 派发这个 waterfall，Cordis 的 context filter 只放行 `hook.global`、无 filter、或 scope 链上的监听器（`vendor/cordis/src/events.ts` 的 `_resolve`）；插件的根 ctx 监听器在真机上被挡掉。
> 正解：`ctx.on('system-prompt/assemble', listener, { prepend: true, global: true })`。单测直接调 listener 发现不了，`tests/sections.test.mjs` 额外断言 `hook.options.global === true`。2026-11-09 真机实证：修复后 `/api/assemble` 的 sections 不再包含被关掉的段（contexts 仍可能被宿主的 required 补回，靠 agent 作用域空 shadow 把文本变空，见上下文开关条目）。

> **人设是两个独立槽位，不是一个总开关**
> `deployment:persona-prefix`（order 0，固定身份之后、所有第一方指导之前，"你是谁"）与 `deployment:persona-suffix`（order 10200，所有第一方指导之后、提示词最末，"收尾叮嘱"）各自配置：`enabled=false` → 该槽位注册空影子（不发送）；`enabled=true && !override` → 不注册（沿用部署 `personaPrefix`/`personaSuffix`）；`override=true` 且 text 非空 → 替换该槽位；`override=true` 且 text 为空 → 该槽位不发送。UI 每个槽位一条开关 + 一条「覆盖部署文本」+ 文本域，两槽位互不影响。不要退回「一个总开关 + 一个覆盖」的旧模型（前缀和后缀的位置、语义、缓存代价都不同，必须分开）。

> ⚠️ **通道过滤器必须按 agent 在 `agent/created` 注册**
> 症状：档位里关掉「注入时间采样」后，请求里仍会出现一条 `Time sampled ...` 的 user 消息（`source.kind: "time-context"`）；工作区指令却能正常滤掉。
> 根因：`time-context` 是 agent preset 插件，在会话创建时挂载，且用 `prepend` 注册 `agent/pre-step`；它晚于插件的全局监听器注册，unshift 后排到全局过滤器**前面**，它追加的时间消息在全局过滤器 `next()` 返回之后才出现。`agent-instructions` 用默认 push（内层），所以能滤掉——不对称由此而来。
> 正解：`agent/created` 时在 `agent.ctx` 上再注册一次同样的过滤器（`{prepend:true}`）。宿主契约（`core/agent` 的 `CreateAgentOptions.setup` 文档）保证 setup 里挂载的预设插件与监听器先于 `agent/created`，所以此时注册才能包住 time-context。全局那份只作拿不到 `agent.ctx.on` 时的兜底。回归：`tests/channels.test.mjs`。

- **webServer 路由不自带鉴权**：宿主 webServer 对直接 `register` 的路由不做任何认证/Origin 检查，每个 handler 必须先过 `ctx.connection` 的 `requestRejection`（官方 open-in-app 同款）；宿主无 connection 服务才回退回环 Host 校验。POST 另要求 `application/json`，掐掉 text/plain 简单请求的跨站提交。
- **弹层定位必须先量后放**：内容高度渲染后才知道，`useLayoutEffect` 里量完再 setState，且**同值必须 bail**（返回上一个 state），否则每轮渲染都 set 新对象 → 死循环。
- **Client 端的槽位检查工具用不了**：本版本 `cordis_inspect` 的 Client `Slots.listSubTree` 无论传什么 input 都报 `"input" must be an object`。要查槽位结构直接读宿主源码（路径表见 `docs/dsh-web-ui.md`）。
- **`application: applied` 才是生效**：安装结果里的 `changed` / 日志 / 进程都在，但不等于是新 bundle；以 `application` 字段为准。
- **profile 是链接安装**：不要手动往 profile 的 `node_modules` 里拷文件，也不要改 profile 的 `package.json` / `cordis.patch.yml`——那是 `install_bundle` 的活。

## 排查会话记录（通道/档位是否生效）

脚本已迁到 `../dsh-session-bridge/scripts/read-session.mjs`（在该包跑 `npm run session -- --latest`，或 `--session session-<id>` / `--session <file>.zstd`）。它解码 `$DSH_HOME/sessions/**/session.v4.jsonl.zstd`，打印：session 头、该会话在 `session-context-config.json` 里的档位（prompt override、sections off、channels off、contexts off、baseline）、每个 step 的 system 文本长度、user 消息的 `source.kind`、`request/header` 的 tools 数量。

判读口径：

- `system (empty)` = 人设段为空、附加规则全关、其它 system 段也全关/全空；非空看字符数与预览。
- `user time-context` 出现 = 时间采样没被过滤；`agent-instructions` 出现 = 工作区指令没被过滤。两者同时出现/缺失可以区分「配置没生效」和「某条通道的过滤器顺序不对」。
- `request/header tools=0` = 工具全被隐藏，说明档位确实应用到了该会话。
- 会话文件是**多帧 zstd**（每次追加新起一帧），Node 的 `zstdDecompressSync` / `createZstdDecompress` 只解第一帧；脚本按 `28 b5 2f fd` 切帧后逐帧解压。别被「解出来只有 200 字节的 session 头」骗成日志为空。

## 添加或修改 UI 的标准流程

1. 读 `docs/dsh-web-ui.md`：确认槽位、可复用 token、控件几何；要动的宿主源码路径写在该文档的「源码地图」。
2. 改 `src/client/`：样式在 `panel/panel.module.css` 与 `menu/menu.module.css`（编译后类名带 `cp-` 前缀）；两处 chip 复用 `menu/seat.ts` 的 `Seat` / `MenuRow`。
3. `pnpm build`，再 `node scripts/smoke.mjs`，断言不通过就别急着截图。
4. `pnpm build` 后约 1s client HMR 自动重挂 entry（**不要刷新页面**）；需要新页面时才重启桌面应用。然后截窗口图，按 DSH 自带控件对齐：触发器 28px 高、菜单行 34px 高、字号 13/20 与 12/16。
5. 视觉事实有变化才同步 `docs/dsh-web-ui.md`；纯重命名/拆函数不用改文档。

## 已知待优化

- UI 文案硬编码中文，没走 Client locale 服务；`locale/*.json` 只有包级标题。
- 运行时上下文只能按已知名字逐项控制；新插件带来的未知上下文默认注入，要把它加进 `CONTEXT_SWITCHES` 才能在面板里关。system 段不同：未知段会按原始 name 动态列出。
- 系统段开关是档位级，只作用于根会话；子代理的 system 段不受档位开关控制（附加规则是全局例外）。
- 系统段顺序由宿主 `order` 固定，面板只能包含/排除，不能改先后。
- 工作区指令只能整组关：宿主已把同一批 AGENTS.md/CLAUDE.md 拼成一条 `<system-reminder>`，无法按文件过滤；要排除某类文件名只能在部署级配 `instructionFileCandidates` / `maxBytes`。

## 文档目录

| 文档 | 角色 | 何时读 |
|---|---|---|
| `README.md` | 用户向说明 | 介绍档位模型、三态落地、数据格式与接口 |
| `docs/dsh-web-ui.md` | 知识笔记 + 事实速查 | 改 UI、抄 DSH 样式、选槽位、查 token 与几何时 |

## 本文档维护规则

- **核心判据**：只记代码、git log、README 里读不出的东西——为什么这么设计、踩过什么坑、哪些约束不可违反。**过时的条目比缺失更糟**：读到与代码矛盾的断言，当场以代码为准修正。删留只看判据，长度不是标尺。
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
