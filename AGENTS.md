# AGENTS.md — dsh-session-context-config（上下文档位）

DSH 的持久插件（bundle）：给新会话选择注入哪些工具、用哪段系统提示词。Host 做档位解析与装配，Client 在 Web UI 里出一个配置面板和两个切换 chip。

**权限与作用边界**：所有 HTTP 路由先过宿主 connection 信任栅栏（Host/Origin/浏览器会话认证；宿主无该服务时回退回环 Host 校验）；状态落 `~/.dsh/session-context-config.json`（旧名 `context-profile.json`，首次启动自动迁移并留成 `.migrated`；`DSH_HOME` 存在时以它为准）；档位只作用于根会话，子代理不受影响。

档位模型（三级状态表 + 四态解析）、三态怎么落地、数据与接口格式，都已写在 `README.md`，本文不重复；本文只记代码与 git log 里读不出的约束和坑。

## 关键文件

| 文件 | 职责 |
|---|---|
| `index.js` | Host 半个插件：解析档位、`applyTo()` 装配、`tool_search` 延迟工具、HTTP 快照/切换接口 |
| `client.js` | Client 半个插件：配置面板 + 新会话 chip（`conversation.hero.options`）+ 会话头部 chip（`conversation.session.header.actions`，紧跟「模式」标签）；样式以单块 CSS 常量注入 `document.head` |
| `package.json` | bundle 清单；`dsh.client` 段声明客户端注入（sidebar、layout），`exports` 决定宿主能取到哪些子路径 |
| `cordis.patch.yml` | 装载入口：只 insert 一行 `session-context-config` |
| `locale/*.json` | 仅包级 title/description；**界面文案是硬编码中文，没走 locale 服务**（见「已知待优化」） |
| `docs/dsh-web-ui.md` | DSH Web UI 的设计 token、控件几何、槽位接入与验证配方——改 UI 前先读 |

## 构建、安装与验证

没有构建步骤：`index.js` 是可被宿主直接 import 的 ESM，`client.js` 是 `window.__ModuleLoader__.load({ id, factory })` 形式的浏览器脚本，两者都手写、直接运行。

```bash
# 静态检查（两个都能直接查语法）
node --check client.js && node --check index.js

# 逻辑/DOM 冒烟：happy-dom 里装一遍 bundle，喂假快照渲染两个 chip 并点击
node scripts/smoke.mjs
```

`scripts/smoke.mjs` 借用 DSH 源码仓库 `node_modules/.pnpm` 里的 react/react-dom/happy-dom，环境变量 `DSH_SRC` 指向该仓库根目录（必填，未设置时脚本直接报错退出）。它断言：触发器是 seat 结构、菜单行带 `aria-checked`、只有选中行有勾、会话头部菜单含状态块与确认块。

**装到 profile**：`plugin_manager` 的 `install_bundle` 指向本目录。profile 里装成 `link:`，所以改文件即时生效、不需要重装。**但这套桌面安装没有 `dsh-client-hmr`**（`app.asar` 的 `@deepseek-ai` 下查不到这个包），页面不会自动重载——改完要在应用里刷新一次（`Ctrl+R`）才看得到新界面。同版本重复安装会返回 `already-installed`，要更新得先 `remove_bundle` 再 `install_bundle`（或先改 `package.json` 的 version）。安装结果以返回里的 `application: applied` 为准。

**看真实效果**：DSH 桌面端当前没有开放调试端口（Web 端口要进程内 token），接不上 CDP。做法是截桌面窗口的图核对——**不要用系统级鼠标/键盘自动化**去点用户界面：会打断用户操作、留下文字选中，而且验证价值不如一次截图。

## 约定

- 全文中文；代码标识符用英文。
- **命名**：包名 `dsh-` + kebab-case，`cordis.patch.yml` 的行 id 是包名去掉 `dsh-` 前缀；`profile`（部署档案 `$DSH_PROFILE`）、`preset`（模型/agent 预设）、`mode`（会话头部的「模式」）都是宿主已占的词，不要拿来当词根。
- **代码注释规范**：类/函数级注释写「职责 + 为什么这么设计」；行内只写这一处代码读不出的单点约束和取舍；不写逐行翻译、不写「从哪拆来的/以前怎样」这类过程记录。注释过时比没有更糟——读到与代码矛盾的注释当场以代码为准修或删。行内注释同样用中文。
- 单点约束写进注释，跨文件规则写进本文档并互留锚点，同一约束不双份维护。
- 本目录目前**不是 git 仓库**，不要假定能 `git commit`；若以后初始化，提交时机是「阶段成果自验通过」时，而不是改完就提。

## 核心机制要点

- **四级状态解析**：组和 server 只给默认值，`force` / `off` 两个极端压过子项；工具级只有三态。解析同时存在于 Host 与 Client（Client 那份必须与 Host 同规则，改一侧必改另一侧）。
- **延迟不是删除**：延迟工具在 tools 数组里保留「名字 + 功能摘要 + 必需参数」的占位定义，完整 schema 由 `tool_search` 以工具结果的形式追加进历史。这样 tools 数组整场不变，加载动作不打断前缀缓存——这是整套设计的核心取舍，别顺手改成「按需注册/注销」。
- **生效边界**：`agent/created` 时套用会话记录或 `lastUsedId`；已开始的会话不跟随配置变化，只在用户确认切换时重算；`tools/change`（可见工具集合变化）时就地按同一档位重算，因为那一刻 schema 本来就在变，不额外付缓存代价。
- 切换档位会重建整个工具表与前缀缓存；面向用户的确认话术已写在菜单里，改动这段行为时同步它。

## 关键技术边界与坑

> ⚠️ **DSH 的 CSS Module 类名带哈希，不能当选择器/样式契约**
> 症状：照源码写的 `.heroOptions{...}` 完全不生效，编译产物里类名是 `an3WzG_heroOptions`。
> 根因：宿主用 CSS Modules 构建，类名逐版本变化。
> 正解：只依赖**设计 token**（`--dsw-*`）和**槽位锚点** `[data-slot="<slot key>"]`；控件几何按源码数值重写成自己的类。细节见 `docs/dsh-web-ui.md`。

> ⚠️ **新会话行的插件选项被推到行尾**
> 症状：注册在 `conversation.hero.options` 的控件总是贴右端，`margin-right:auto` 之类怎么调都没用。
> 根因：宿主把该槽包在 `.heroOptions` 里并给了 `margin-left:auto`。
> 正解：用槽位锚点选中「装着该槽的那一层」再覆盖——`client.js` 里的 `div:has(> [data-slot="conversation.hero.options"]){margin-left:0}`。注意锚点自身是 `display:contents`，对它设 margin 无效。

> ⚠️ **Client bundle 的 `require` 只有 react / react-dom**
> 症状：想直接 `require('@deepseek-ai/dsh-client-ui-primitives')` 拿 `Menu`、图标、`Tooltip`，运行时报找不到模块。
> 根因：`require` 来自浏览器模块表，只有基线运行时；`ui-primitives` 没有 `dsh.client` 行，不是可解析的 client module，也没有 `./client` 导出。
> 正解：宿主组件样式「照着写」而不是 import；需要浮层就自己用 portal + `--dsw-*` token 复刻。详见 `docs/dsh-web-ui.md`。

- **webServer 路由不自带鉴权**：宿主 webServer 对直接 `register` 的路由不做任何认证/Origin 检查，每个 handler 必须先过 `ctx.connection` 的 `requestRejection`（官方 open-in-app 同款）；宿主无 connection 服务才回退回环 Host 校验。POST 另要求 `application/json`，掐掉 text/plain 简单请求的跨站提交。
- **弹层定位必须先量后放**：内容高度渲染后才知道，`useLayoutEffect` 里量完再 setState，且**同值必须 bail**（返回上一个 state），否则每轮渲染都 set 新对象 → 死循环。
- **Client 端的槽位检查工具用不了**：本版本 `cordis_inspect` 的 Client `Slots.listSubTree` 无论传什么 input 都报 `"input" must be an object`。要查槽位结构直接读宿主源码（路径表见 `docs/dsh-web-ui.md`）。
- **`application: applied` 才是生效**：安装结果里的 `changed` / 日志 / 进程都在，但不等于是新 bundle；以 `application` 字段为准。
- **profile 是链接安装**：不要手动往 profile 的 `node_modules` 里拷文件，也不要改 profile 的 `package.json` / `cordis.patch.yml`——那是 `install_bundle` 的活。

## 添加或修改 UI 的标准流程

1. 读 `docs/dsh-web-ui.md`：确认槽位、可复用 token、控件几何；要动的宿主源码路径写在该文档的「源码地图」。
2. 改 `client.js`：样式都在顶部 `CSS` 常量块里，组件在「基础组件」段；两处 chip 复用 `Seat` / `MenuRow`。
3. `node --check client.js`，再 `node scripts/smoke.mjs`，断言不通过就别急着截图。
4. 在应用里刷新一次页面（没有 HMR，见上），再截窗口图，按 DSH 自带控件对齐：触发器 28px 高、菜单行 34px 高、字号 13/20 与 12/16。
5. 视觉事实有变化才同步 `docs/dsh-web-ui.md`；纯重命名/拆函数不用改文档。

## 已知待优化

- UI 文案硬编码中文，没走 Client locale 服务；`locale/*.json` 只有包级标题。
- 配置面板的预览弹窗仍是自绘 `.cp-pop`，没跟新的菜单样式统一。

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
