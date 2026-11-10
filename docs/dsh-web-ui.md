# DSH Web UI 样式与接入速查

改本插件的界面、抄宿主样式、挑槽位之前读这篇。内容来自对 DSH 源码（`packages/client/*`）的核对，用于**对齐外观**，不是 DSH 官方 API 承诺。

## 0. 先记住三条

1. **类名不可当契约**：DSH 的组件样式走 CSS Modules，产物类名带哈希（例如 `.heroOptions` 编译后是 `an3WzG_heroOptions`，逐版本变化）。能稳定用的只有 **设计 token（`--dsw-*`）** 和 **槽位锚点 `[data-slot="<slot key>"]`**。
2. **宿主 `ui-primitives` 可以 import**（2026-11-08 实证修正，旧版此处断言有误）：它是平台种子词——`packages/client/web/src/platform.ts` 的 `PLATFORM_MODULES` 含该行，`require` 第一跳命中种子表——任何 client bundle（含本项目手写 `client.js`）都能拿到 `Menu`、图标、`Tooltip`、`Checkbox`、`SegmentedControl` 等。本项目组件仍是自绘（历史设计、已验证），不是拿不到；真正拿不到的是表外 specifier（见第 7 节）。
3. **本文数值是抄写值**：真正的源头是 DSH 源码（第 6 节源码地图）。宿主升级后如果观感不对，先回源码复核，再同步本文与 `client.js` 的 `CSS` 块。

## 1. 设计 token（可直接用在我们的 CSS 里）

全部由 `body` 上的浅/深色主题切换，**不用自己写两套颜色**（深色由 `body[data-ds-dark-theme]` 重绑定）。

| 用途 | 变量 | 浅色取值 |
|---|---|---|
| 圆角 | `--dsw-radius-xs / sm / md / lg / xl / panel` | 4 / 8 / 12 / 16 / 20 / 28 px |
| 主文字 | `--dsw-alias-label-primary` | neutral-bluish-1000 |
| 次文字 | `--dsw-alias-label-secondary` / `-tertiary` | 700 / 600 |
| 说明文字 | `--dsw-alias-label-caption` | neutral-bluish-400 |
| 禁用文字 | `--dsw-alias-label-quaternary` | 更低对比 |
| 菜单图标 | `--dsw-alias-menu-icon` | neutral-bluish-800 |
| 悬停底色 | `--dsw-alias-interactive-bg-hover` | `rgba(38,49,72,.06)` |
| 按下底色 | `--dsw-alias-interactive-bg-active` | `rgba(38,49,72,.1)` |
| 危险悬停 | `--dsw-alias-interactive-bg-hover-danger` | 淡红 |
| 描边 | `--dsw-alias-border-l1 / l2 / l3 / l4` | 由浅到深；`l3` 用于深色菜单描边 |
| 状态色 | `--dsw-alias-state-success/error/warn/idle-primary` | 绿 / 红 / 琥珀 / 灰 |
| 品牌色 | `--dsw-alias-brand-primary` | deepseek 主色 |
| 浮层填充 | `--dsw-menu-surface-fill` / `--dsw-specific-menu` | 浅色 70% 不透明（`rgba(252,253,254,.7)`），深色 64% |
| 浮层模糊 | `--dsw-menu-backdrop-filter` | `blur(40px) saturate(150%)` |
| 浮层阴影 | `--dsw-elevation-prominent` | `0 0 0 .5px stroke` + 两层极淡柔影 |
| 侧栏底色 | `--dsw-specific-sidebar-fill` | 浅灰 |

两条使用规则：

- **阴影依赖缝合变量**：`--dsw-elevation-*` 里的那圈 0.5px 描边读的是 `--dsw-elevation-stroke-color`。宿主菜单会在卡片上把它重绑成 `--dsw-alias-border-l1`（深色主题用 `l3`）。自己画浮层时要照做，否则描边色会继承到别处。
- **高层级表面不画 border**：宿主的做法是 `border: 0` + elevation 阴影自带描边，避免描边占布局。

宿主自带的 14 个 alias token 也能用检查工具拿：`cordis_inspect_query` 的 Client `Theme.listTokens`（这个通道可用；`Slots` 那个有 input 校验 bug，见 AGENTS.md 坑库）。

## 2. 控件几何（抄自宿主，用来对齐观感）

> 表里的字号 / 行高是**标准档（界面字号 14–15px）的设计值**，且是宿主抄写值。代码里小字号只有四档，按信息层级取：**11** = 角标/计数/代码片段/标签胶囊，**12** = 辅助说明与元信息（描述、提示、状态行、工具名、分组标题、时间），**13** = 正文与行标题，**14** = 输入框与按钮文字；原先 10px 的并入 11 或 12，不再出现 10px。实现一律写 `font-size: var(--dsh-plugin-fs-N, Npx)`、行高写 `calc(Npx + var(--dsh-plugin-font-boost, 0px))`，16px 以上的标题用 `calc(16px + var(--dsh-plugin-font-boost, 0px))`。变量定义集中在 `panel.module.css` 顶部的 `body` 规则，`menu.module.css` 共用同一份（同一 bundle 一起注入）；规则原文与理由见仓库根 `AGENTS.md` 的「字号响应规则」。

### 2.1 触发器 chip —— 对应宿主的 `.workspace`（工作区）与 `.seat`（模式）

| 项 | 值 |
|---|---|
| 布局 | `inline-flex`，`align-items:center`，`gap:4px` |
| 尺寸 | `min-height:28px`，`padding:0 8px`，`max-width:min(100%,240px)`（工作区是 360px） |
| 圆角 / 边框 | `border-radius: var(--dsw-radius-sm)`，`border:none` |
| 默认态 | 透明底，`color: var(--dsw-alias-label-primary)`，13px / 20px，字重 500 |
| 悬停 / 展开 | `background: var(--dsw-alias-interactive-bg-hover)` |
| 图标 | 16px，`flex:none`，色 `label-primary` |
| 后缀箭头 | 16px，色 `label-caption` |
| 文字 | `min-width:0` + 省略号，保证窄容器里先压文字不压图标 |

出处：`ui-conversation/.../HeroShell.module.css` 的 `.workspace`；`ui-agent-preset/.../AgentPresetSeat.module.css` 的 `.seat`（两者几何一致，注释里也写明「mirrors HeroShell's .workspace」）。

**会话头部的「模式」标签小一档**（`AgentPresetLabel.module.css` 的 `.label`）：22px 高、12px / 22px、`label-tertiary`、`border-radius: var(--dsw-radius-xs)`、`gap:4px`、`padding: 0 2px 0 0`，图标 14px。它引用的 `background: var(--dsw-alias-fill-tsp-secondary)` **在整个 UI 源码里没有定义**，实际等于透明底——想和它对齐就照抄这条声明，不要自己补填充色。本项目对应 `.cp-seat[data-compact="1"]`。

### 2.2 下拉菜单 —— 对应宿主的 `Menu` / `MenuSurface` / `MenuItem`

| 项 | 值 |
|---|---|
| 卡片 | `padding:4px`，`border-radius: var(--dsw-radius-lg)`，`border:0`，`box-shadow: var(--dsw-elevation-prominent)`，底色 `--dsw-specific-menu` + `backdrop-filter: var(--dsw-menu-backdrop-filter)` |
| 宽度 | 下限 `min(144px, 100vw-24px)`，上限 `min(360px, 100vw-24px)`，`width:max-content` |
| 行 | `display:flex`，`gap:6px`，`width:100%`，`min-height:34px`，`padding:6px 8px`，`border-radius: var(--dsw-radius-md)`，13px / 20px |
| 行悬停 / 键盘焦点 | `background: var(--dsw-alias-interactive-bg-hover)`，焦点不画 outline |
| 行图标 / 勾 | 14px；勾在行尾，色 `label-primary` |
| 分组标题行 | `padding:6px 8px`，11px / 15px（宿主值；本项目按四档统一为 12px / 18px），色 `label-tertiary` |
| 分隔线 | 高 `.5px`，`margin:3px 8px`，色 `border-l2` |
| 多行条目 | 名称 13/20 `label-primary`，描述 12/16 `label-caption`，`white-space:normal` |
| 进场动画 | 只动 opacity，时长走 `--dsh-menu-*`；`prefers-reduced-motion` 归零 |

出处：`ui-primitives/src/Menu.module.css`、`MenuSurface.module.css`、`MenuRow.tsx`。

### 2.3 需要留意的排版细节

- 行内「名称 + 描述」两行时，行高从 34 起，靠 `align-items:flex-start` 让图标/勾与首行文字对齐（勾的 `margin-top` 约 3px）。
- 行尾有勾时会给剩余列挤位：**未选中的行也要留出等宽的空勾位**，否则数字/短标签会左右跳（本项目踩过，见 `client.js` 里 `MenuRow` 的占位 span）。
- 卡片内边距 4px 时，内嵌的状态块要用 `padding:4px 8px` 才能和行的左右边对齐。
- 清单类区域（工具状态那种可能上百条的列表）用**固定可视高度 + 内部滚动**，不要截断成「另外 N 个」：区域高度稳定，菜单不会再随数据长高。本项目对应 `.cp-tools`。

### 2.4 复选行与分段选择（配置页里的原生控件）

`Checkbox` / `SegmentedControl` 可以从 `ui-primitives` import（第 0 节）；本项目照着 `ui-primitives` 的几何自绘，是历史设计选择：

- **复选行**：`<label>` 包住 `input[type=checkbox]` + 文字，点整行文字即可切换。勾选框 16×16、`accent-color: var(--dsw-alias-brand-primary)`、与文字 `gap: 8px`；DSH 原版 gap 是 6px，本项目 13px 字号用 8px。出处 `ui-primitives/src/Checkbox.tsx` + `Checkbox.module.css`。对应 `.cp-check` / `.cp-checkBody`。
- **分段选择**：轨道 `padding: 4px`、`border-radius: var(--dsw-radius-md)`、底色 `--dsw-alias-interactive-bg-hover`；选中片高 28px、底色 `--dsw-alias-bg-layer-1`、`box-shadow: var(--dsw-elevation-soft)`（表面把 `--dsw-elevation-stroke-color` 重绑到 `border-l1`）、圆角 `--dsw-radius-sm`；未选中文字 `label-secondary`，选中 `label-primary`。出处 `ui-primitives/src/SegmentedControl.tsx` + `SegmentedControl.module.css`。对应 `.cp-choice`；`.cp-choice.sm` 把轨道内边距降到 2px、段高 24px，仅用于工具行。
- **选中态不是实心品牌色**：DSH 的分段选中片是「抬起的浅色面」，靠阴影和轨道底色分离；状态色调（强制开启/延迟/隐藏）只染选中段文字，取 `state-success/warn/*` token。不要把选中段做成黑底白字。
- 键盘行为：DSH 原版是 tablist + roving tabindex；本项目用原生 radio（`name` 分组、隐藏 input、label 全行可点）复刻外观，方向键与读屏语义交给浏览器，不另写 roving tabindex。

### 2.5 圆角与「全圆」的 superellipse 退出

`ui-theme/src/styles/corner-shape.css` 在 `@supports (corner-shape: superellipse(1.5))` 里给 `*`（含 `::before/::after`）设了 `corner-shape: superellipse(1.5)`。所以任何**不封顶**的圆角——`border-radius: 50%`、`999px`、或远大于盒子高度的 pill 半径——都必须在**同一条规则里**配 `corner-shape: round`，否则胶囊两端被切方、圆点变成超椭圆。宿主有全量 spec（`ui-theme/tests/corner-shape-styles.client.spec.ts`）只扫 `packages/`，插件不在覆盖内，只能自查。本插件对应 `.cp-chip`（999px）与 `.cp-sw`（50%）。

**实心状态色块上的文字不要写 `#fff`**：前景色随主题翻转，用 `--dsw-alias-bg-layer-3` 或 `--dsw-alias-label-primary-foreground`（宿主先例 `ui-agent-preset/.../AgentPresetSection.module.css`）。

## 3. 槽位接入

### 3.1 新会话 hero 行的 DOM 形状

```
div.heroWorkspaceRow            flex, gap 2px, padding 0 16px 0 20px
├─ 工作区 chip                  宿主自有
├─ [data-slot="conversation.hero.workspace"]     display:contents
├─ [data-slot="conversation.hero.agentPreset"]   display:contents   ← 「标准模式」在这
├─ div.heroOptions              flex, gap 2px, margin-left:auto      ← 插件选项被推到行尾的原因
│  └─ [data-slot="conversation.hero.options"]    display:contents   ← 我们的触发器在这
└─ …
```

这行的每个槽位都由 `renderSlot()` 渲染，外面总会套一层 `[data-slot="<key>"]`，并带 `display:contents`（`ui-renderer/src/client/scoped-slots.tsx` 的 `SlotOutlet` / `ANCHOR_STYLE`）。宿主注释把这一层称为 **addressable seam**——它就是给动态样式用的，是唯一稳定的结构锚点。

槽位类型与作用域（同一文件里的 `children` 声明）：

| 槽位 | kind | scope | 含义 |
|---|---|---|---|
| `conversation.hero.options` | list | session | 可多个插件并排；**仅当 `sessionId` 存在时整块才渲染** |
| `conversation.hero.agentPreset` | single | session-maybe | 单一占用者（模式选择器），不要往里抢 |
| `conversation.hero.workspace` | single | root | 工作区选择相关 |
| `conversation.session.header.actions` | list | session | 标题右侧的操作区；宿主的「模式」静态标签在这里（order -10），我们的 chip 用 order 10 紧跟其后 |
| `conversation.session.header.utilities` | list | session | 整行**最右端**的工具区（不要放这里，会被推到标题行尽头） |

会话头部的 `titleRow` 是两段式：`[crumbs + headerActions]` 撑满剩余宽度、`headerUtilities` 固定贴右并自带 `margin-left:20px`；`headerActions` 不收缩、跟着标题走。所以「把开关挪到标题旁」= 换个槽，不需要任何样式覆盖；`actions` 里的顺序由 `order` 决定（宿主模式标签是 -10）。

### 3.2 覆盖宿主给插件层加的外边距

`.heroOptions` 的 `margin-left:auto` 会把整块插件选项推到右端。由于我们只能从自己的 CSS 里选到它，用锚点反向选中父层：

```css
/* client.js 顶部 CSS 块里就这一条，别改成 :has(> .cp-seat-*)：
   直接父元素是 display:contents 的锚点，不是 .heroOptions。 */
div:has(> [data-slot="conversation.hero.options"]) { margin-left: 0 }
```

### 3.3 浮层怎么放

宿主用 CSS anchor positioning（`position-anchor` + `anchor()` + `position-try-fallbacks`）。我们这套是手写实现的简化版：`portal` 到 `body` + `position:fixed`，**渲染后量自己的尺寸再定坐标**，右侧与底部都夹在视口内，下方放不下就翻到触发器上方。要重做定位时优先沿用「先量后放」，别退回「渲染前估算」。

## 4. 本项目对宿主样式的复刻对照

数值都写在 `client.js` 顶部的 `CSS` 块里，本文只解释「抄的是谁、为什么这么写」。

| 本项目 | 复刻自 | 说明 |
|---|---|---|
| `.cp-seat` / `.cp-seatIcon` / `.cp-seatLabel` / `.cp-seatCount` / `.cp-seatChevron` | `.workspace` / `.seat` | 计数器是本项目加的，用 12px `label-caption` |
| `.cp-seat[data-compact="1"]` | `.label`（会话头部「模式」标签） | 22px 高、12/22、`label-tertiary`、图标 14px；仅会话头部使用 |
| `.cp-menu` | `MenuSurface` + `Menu.module.css` 的 `.list` | 材质、圆角、4px 内边距、阴影缝合变量 |
| `.cp-pop` / `.cp-popHead` | `MenuSurface`（同上） | 预览浮层：半径、材质、阴影与菜单一致（无描边、`--dsw-specific-menu` + backdrop、`--dsw-elevation-prominent`），只有位置由 JS 量算 |
| `.cp-menuHead` / `.cp-menuNote` | `.label`（分组标题） | 右侧说明是本项目加的 |
| `.cp-choice` / `.cp-choiceOpt` | `SegmentedControl` | 轨道 + 抬起的选中片；用原生 radio 取代 tablist，外观一致、键盘交给浏览器 |
| `.cp-check` / `.cp-checkBody` | `Checkbox` | label 包 input，点文字即切换；标题 13/20 + 说明 12/18 |
| `.cp-groupHead` / `.cp-divider` / `.cp-subhead` | 无直接对应 | 分组标题、设置分组与 0.5px `border-l2` 分隔线 |
| `.cp-btn` | `ui-primitives` 的 Button | md 档：36px 高、14px 字、radius-md、`0 14px`；主按钮 `--dsw-alias-button-primary-fill` + 前景色（不是品牌色 + `#fff`） |
| `.cp-tool` / `.cp-nameCell` / `.cp-stateTag` / `.cp-tokenTag` / `.cp-clear` | 宿主 `Tag` | 工具清单的定宽列：名字（含两枚标签）/描述（超宽折行，完整显示）/状态。两枚标签都用 `Tag` 胶囊：`.cp-stateTag` 按生效状态取 `success` / `warning` / `neutral` 色调并补一圈同色 inset 描边（`.cp-stateTagInner`），被组或 server 改写时用 tooltip 说明本行选择；`.cp-tokenTag` 用默认 `outline` 灰标签显示 token 估算 |
| `.cp-row` / `.cp-rowMain` / `.cp-rowName` / `.cp-rowDesc` / `.cp-rowCount` / `.cp-rowCheck` | `.item` / `.itemIcon` / `.itemLabel` / `.check` | 两行条目 + 行尾计数 + 勾 |
| `.cp-menuSep` | `.separator` | 0.5px + `border-l2` |
| `.cp-status` / `.cp-statusRow` / `.cp-tools` | 无直接对应 | 会话头部的工具状态清单，沿用本项目自己的紧凑排版；`.cp-tools` 是固定可视高度 + 内部滚动的清单区（全量渲染，不截断成「另外 N 个」） |

## 5. 验证配方

```bash
node --check client.js
node scripts/smoke.mjs        # happy-dom 里渲染配置面板与两个 chip 并点击，断言结构与语义
```

冒烟脚本覆盖不到像素，只断言结构与语义（seat 结构、`aria-checked`、勾只在选中行、配置面板的复选行/分段选择语义与 label 可点、头部菜单含状态块与确认块）。真相看截图：截 DSH 桌面窗口，对照 2.1/2.2/2.4 的几何自己比。**不要用系统级鼠标自动化去点**（见 AGENTS.md）。

查宿主源码时最省事的几条命令（`DSH_SRC` 换成你的源码路径）：

```bash
rg -n "heroOptions" packages/client/ui-conversation/src
rg -n "data-slot=" packages/client/ui-renderer/src/client/scoped-slots.tsx
rg -n "^\.item|^\.label|^\.separator" packages/client/ui-primitives/src/Menu.module.css
rg -n "menu-surface-fill|radius-sm" packages/client/ui-theme/src/styles
```

## 6. 源码地图

| 路径（相对 DSH 源码根） | 看什么 |
|---|---|
| `packages/client/ui-conversation/src/client/skeleton/ConversationContent.tsx` | hero 行的 JSX、四个槽位的调用与 props |
| `packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css` | `.heroWorkspaceRow` / `.heroOptions` 的 flex 与外边距 |
| `packages/client/ui-conversation/src/client/skeleton/HeroShell.module.css` | 工作区 chip 的几何 |
| `packages/client/ui-conversation/src/client/skeleton/ContextMeter.tsx` | 「点按钮开浮层」的完整宿主范例：portal + 外部点击关闭 + Escape |
| `packages/client/ui-agent-preset/src/client/AgentPresetSeat.tsx` + `.module.css` | 模式 chip 与 `Menu` 的用法、菜单项两行文案 |
| `packages/client/ui-primitives/src/Menu.module.css` / `MenuSurface.module.css` / `MenuRow.tsx` | 菜单卡片、行、勾、标题行、分隔线的全部几何 |
| `packages/client/ui-primitives/src/Checkbox.tsx` / `Checkbox.module.css` | 复选行：16px 原生勾选框、`accent-color`、label 包 input |
| `packages/client/ui-primitives/src/SegmentedControl.tsx` / `SegmentedControl.module.css` | 分段选择：轨道、28px 段、抬起选中片、键盘 walk |
| `packages/client/ui-theme/src/styles/base.css` | 圆角与字体栈 |
| `packages/client/ui-theme/src/styles/design-platform.css` | 颜色 token、菜单填充（浅 70% / 深 64%） |
| `packages/client/ui-theme/src/styles/gradient-shadow-text.css` | elevation 三档与 `backdrop-filter` |
| `packages/client/ui-renderer/src/client/scoped-slots.tsx` | `SlotOutlet`、`[data-slot]` 锚点、`display:contents`、list/single/chain 的分发 |
| `packages/client/modules/src/client/system.ts`、`manifest.ts` | `dsh.client.external` 怎么解析——为什么 `require` 只有基线模块 |

⚠️ **桌面安装里的源码在 `app.asar` 内**：普通 shell、ripgrep、node 都读不进去（只有宿主自己的文件读取能打开）。查样式一律用上面的源码仓库；实在要读 asar，按 asar 头解析（`extract.mjs` 这类小脚本），不要指望 `cat` / `rg`。

## 7. 明确不可复用的东西

| 东西 | 为什么不行 |
|---|---|
| CSS Module 哈希类名（`.an3WzG_heroOptions`） | 每次构建都变 |
| `clsx` 等宿主包自己的依赖、包内子路径 specifier | 不在 `PLATFORM_MODULES` 种子表（`platform.ts`，2026-11-08 核对为 11 项）；`ui-primitives` 本体**在表内**，`require` 直接可用 |
| `ui-conversation` 等宿主 UI 包的内部 React 组件（HeroShell 等） | 包有 `dsh.client` 声明、可作 graph row require，但 `./client` 导出面是 cordis 插件与服务契约（`apply`/`inject`/`ConversationController` 等），不导出内部组件；内部路径不属于公开契约 |
| 宿主的 anchor-positioning 定位代码 | 依赖较新的 Chromium 特性与宿主自己的 `position-try` 变量；我们用的是 JS 量尺寸方案 |
