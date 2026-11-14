# DSH Web UI 样式与接入速查

> **本文是同步副本，权威源在仓库根 `_docs/dsh-web-ui.md`**。子项目独立 checkout 时用本文；改设计语言先改根文档，再同步回本文，两边内容必须一致。

改本插件的界面、抄宿主样式、挑槽位之前读这篇。内容来自对 DSH 源码（`packages/client/*`）的核对，用于**对齐外观**，不是 DSH 官方 API 承诺。

## 0. 先记住四条

1. **类名不可当契约**：DSH 的组件样式走 CSS Modules，产物类名带哈希（例如 `.heroOptions` 编译后是 `an3WzG_heroOptions`，逐版本变化）。能稳定用的只有 **设计 token（`--dsw-*`）** 和 **槽位锚点 `[data-slot="<slot key>"]`**。
2. **宿主 `ui-primitives` 可以 import**（实证修正，旧断言「拿不到」不成立）：它是平台种子词——`packages/client/web/src/platform.ts` 的 `PLATFORM_MODULES` 含该行，`require` 第一跳命中种子表——任何 client bundle（含本项目手写 `client.js`）都能拿到 `Menu`、图标、`Tooltip`、`Checkbox`、`SegmentedControl` 等。本项目组件仍是自绘（历史设计、已验证），不是拿不到；真正拿不到的是表外 specifier（见第 7 节）。
3. **本文数值是抄写值**：真正的源头是 DSH 源码（第 6 节源码地图）。宿主升级后如果观感不对，先回源码复核，再同步本文与对应的 `*.module.css`。
4. **全圆角必须显式退出 superellipse，实心色块禁用 `#fff`**：`corner-shape.css` 给 `*` 套了 `superellipse(1.5)`，`border-radius: 50%` / `999px` 这类不封顶圆角必须在**同一规则里**配 `corner-shape: round`，否则胶囊两端被方化、圆点变超椭圆（宿主有 `ui-theme/tests/corner-shape-styles.client.spec.ts` 全量扫 `packages/`，**插件不在覆盖内、必须自查**）。实心状态色块上的文字用 `--dsw-alias-bg-layer-3` 或 `--dsw-alias-label-primary-foreground`（随主题翻转），抄 `#fff` 深色主题下必错。细节见 2.5。

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

宿主自带的 14 个 alias token 也能用检查工具拿：`cordis_inspect_query` 的 Client `Theme.listTokens`（这个通道可用；`Slots` 那个有 input 校验 bug：无论传什么都报 `"input" must be an object`，查槽位结构直接读宿主源码）。

## 2. 控件几何（抄自宿主，用来对齐观感）

> 表里的字号 / 行高是**标准档（界面字号 14–15px）的设计值**，且是宿主抄写值。代码里小字号只有四档，按信息层级取：**11** = 角标/计数/代码片段/标签胶囊，**12** = 辅助说明与元信息（描述、提示、状态行、工具名、分组标题、时间），**13** = 正文与行标题，**14** = 输入框与按钮文字；原先 10px 的并入 11 或 12，不再出现 10px。实现一律写 `font-size: var(--dsh-plugin-fs-N, Npx)`、行高写 `calc(Npx + var(--dsh-plugin-font-boost, 0px))`，16px 以上的标题用 `calc(16px + var(--dsh-plugin-font-boost, 0px))`。变量定义集中在 `panel.module.css` 顶部的 `body` 规则，`menu.module.css` 共用同一份（同一 bundle 一起注入）；规则原文与理由见下面 2.0。

### 2.0 字号响应（全插件统一）

字号随设置里的界面字号 `--dsh-content-font-size`（标准 14px）缩放。14/15px 用各控件的设计字号；用户调到更小，用户字号是上限（允许低于 11/12 的设计下限）；调到更大，按 `max(0, 用户字号 - 15px)` 的增量上调。实现统一走 `body` 上的共享变量（**每个插件一份**，贴在该插件主 CSS 顶部；同插件的多个 CSS 文件共用这一份、同一 bundle 一起注入，值必须一致）：

```css
body {
  --dsh-plugin-font-boost: max(0px, calc(var(--dsh-content-font-size, 14px) - 15px));
  --dsh-plugin-fs-11: min(var(--dsh-content-font-size, 14px), calc(11px + var(--dsh-plugin-font-boost)));
  --dsh-plugin-fs-12: min(var(--dsh-content-font-size, 14px), calc(12px + var(--dsh-plugin-font-boost)));
  --dsh-plugin-fs-13: min(var(--dsh-content-font-size, 14px), calc(13px + var(--dsh-plugin-font-boost)));
  --dsh-plugin-fs-14: min(var(--dsh-content-font-size, 14px), calc(14px + var(--dsh-plugin-font-boost)));
}
```

- **小字号只有四档**（11/12/13/14），按**信息层级**选档，不照抄宿主某个控件的 px：**11** = 角标 / 计数 / 代码片段 / 标签胶囊；**12** = 辅助说明与元信息（描述、提示、状态行、工具名、分组标题、时间）；**13** = 正文与行标题；**14** = 输入框与按钮文字。原先 10px 的一律并入 11 或 12，不再出现 10px。
- 11–14px 文本一律 `font-size: var(--dsh-plugin-fs-N, Npx)`（N 取上面四档之一），不要写死。16px 及以上的标题/触屏输入用 `calc(16px + var(--dsh-plugin-font-boost, 0px))`（结构字号，不参与小字号收缩）。
- 固定 `line-height` 同步 `calc(Npx + var(--dsh-plugin-font-boost, 0px))`；正文已经用 `--dsh-content-font-delta` 的行高不要重复加。
- 下面的几何速查表记的是**宿主抄写值**（13/20、12/22、11/15），都是 14/15px 标准档的设计值；本仓库插件按四档归并，个别控件因此与宿主差 1px（如分组标题行宿主 11/15 → 插件 12/18）。以「同一层级同一档」为先，不为逐像素一致退回写死 px。
- `happy-dom` 不解析 `min()`（会把 `min(12px,14px)` 算成 16px）；只用它做结构断言的测试要显式把 `--dsh-plugin-fs-*` 覆盖成设计值（先例：`dsh-session-context-config/scripts/smoke.mjs`）。

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

### 2.4 复选行与分段选择

复选行是本项目自绘（原生 checkbox）；分段选择直接用宿主 `SegmentedControl`（`ui-primitives`，第 0 节，选项表在 `src/client/panel/options.ts` 的 `GROUP_STATES` / `TOOL_STATES`），档位行、组 / server、工具行渲染的都是同一个宿主组件。

- **复选行**：`<label>` 包住 `input[type=checkbox]` + 文字，点整行文字即可切换。勾选框 16×16、`accent-color: var(--dsw-alias-brand-primary)`、与文字 `gap: 8px`；DSH 原版 gap 是 6px，本项目 13px 字号用 8px。出处 `ui-primitives/src/Checkbox.tsx` + `Checkbox.module.css`。对应 `.cp-check` / `.cp-checkBody`。
- **分段选择（宿主组件的观感抄写值）**：轨道 `padding: 4px`、`border-radius: var(--dsw-radius-md)`、底色 `--dsw-alias-interactive-bg-hover`；选中片高 28px、底色 `--dsw-alias-bg-layer-1`、`box-shadow: var(--dsw-elevation-soft)`（表面把 `--dsw-elevation-stroke-color` 重绑到 `border-l1`）、圆角 `--dsw-radius-sm`；未选中文字 `label-secondary`，选中 `label-primary`。出处 `ui-primitives/src/SegmentedControl.tsx` + `SegmentedControl.module.css`。
- **选中态不是实心品牌色**：DSH 的分段选中片是「抬起的浅色面」，靠阴影和轨道底色分离；状态色调（开启/延迟/关闭）只染选中段文字，取 `state-success/warn/*` token。不要把选中段做成黑底白字。四态标签字面接近（组的「开启」与「默认」都是全开），差别靠每个选项的原生 `title` 说明，组头另放一个 `?` 标记承载总说明。
- 键盘行为：宿主 `SegmentedControl` 自带 tablist + roving tabindex（方向键走位、`aria-selected`），冒烟脚本断言的就是这套 DOM 契约；本项目不再自绘 radio 版本。

### 2.5 圆角与「全圆」的 superellipse 退出

`ui-theme/src/styles/corner-shape.css` 在 `@supports (corner-shape: superellipse(1.5))` 里给 `*`（含 `::before/::after`）设了 `corner-shape: superellipse(1.5)`。所以任何**不封顶**的圆角——`border-radius: 50%`、`999px`、或远大于盒子高度的 pill 半径——都必须在**同一条规则里**配 `corner-shape: round`，否则胶囊两端被切方、圆点变成超椭圆。宿主有全量 spec（`ui-theme/tests/corner-shape-styles.client.spec.ts`）只扫 `packages/`，插件不在覆盖内，只能自查。本插件对应 `.cp-msgBadge` / `.cp-tag`（999px）与 `.cp-sw`（50%）。

**实心状态色块上的文字不要写 `#fff`**：前景色随主题翻转，用 `--dsw-alias-bg-layer-3` 或 `--dsw-alias-label-primary-foreground`（宿主先例 `ui-agent-preset/.../AgentPresetSection.module.css`）。

### 2.6 样式注入规则

- 样式写在 `*.module.css` 里，构建期由 preset 的 lightningcss 插件编译进 bundle、factory 求值期注入带 `data-plugin-css` tag 的 `<style>`（skip-if-present 幂等；官方 preset 同款取舍：卸载后样式残留）。
- **禁止 inline style 对象**：hover / focus ring / 箭头旋转 / 折叠动画 inline 表达不了。
- 类名空间每插件专属前缀（`dsws-` 先例，`dsh-me-` 恒等——前提见根 `_docs/plugin-build.md` 的 CSS Modules 条目）。
- 顺序敏感的多张表用显式有序清单钉注入顺序（`CSS_SHEET_ORDER`），新增文件必须登记。

## 3. 槽位接入

本节留注册时必须遵守的通用规则，以及与视觉落地直接相关的两条。完整挂载点清单与「换组件」先例是另一份速查（根 `_docs/slot-mount-points.md`），改到未列出的槽位时再查。

- **注册一律包 `ctx.slots.inject(slot, () => ctx.slots.register(...))`**：冷启动时声明方可能晚于插件激活，裸 `register` 抛错会让 fiber failed、web-boot 门禁拒绝启动。
- **keyed 槽必须带 `options.key`**（运行时检查）；**list 条目必须带 `id`**（不是 key）；single 槽不同优先级互相遮蔽、同优先级才 throw；卸载插件自动还原官方注册。
- **session 作用域注册项的 `inject` 首参是 sessionId**（`runInject` 把 binding.key 当实参）；标准 props 也会经 `BUILTIN_SOURCE` 送达 sessionId，两条通道并存。
- **`[data-slot="<key>"]` 是唯一稳定结构锚点**（外层 `display:contents`），CSS Module 类名带哈希、不可当契约。
- 宿主 `Slots.listSubTree` 有 input 校验 bug（无论传什么都报 `"input" must be an object`），查槽位结构直接读宿主源码（`packages/client/ui-renderer/src/client/scoped-slots.tsx`）。

### 3.1 覆盖宿主给插件层加的外边距

`.heroOptions` 的 `margin-left:auto` 会把整块插件选项推到右端。由于我们只能从自己的 CSS 里选到它，用锚点反向选中父层：

```css
/* menu.module.css 里唯一一条全局规则，别改成 :has(> .cp-seat-*)：
   直接父元素是 display:contents 的锚点，不是 .heroOptions。 */
div:has(> [data-slot="conversation.hero.options"]) { margin-left: 0 }
```

### 3.2 浮层怎么放

宿主用 CSS anchor positioning（`position-anchor` + `anchor()` + `position-try-fallbacks`）。我们这套是手写实现的简化版：`portal` 到 `body` + `position:fixed`，**渲染后量自己的尺寸再定坐标**，右侧与底部都夹在视口内，下方放不下就翻到触发器上方。要重做定位时优先沿用「先量后放」，别退回「渲染前估算」。**「先量后放」必须带同值 bail**：`useLayoutEffect` 量完再 setState，新坐标与上一个 state 相等时返回上一个 state——否则每轮 set 新对象 → 重渲染 → 再测量，死循环。

## 4. 本项目对宿主样式的复刻对照

数值都写在 `src/client/**/*.module.css`（构建期编译进 client bundle），本文只解释「抄的是谁、为什么这么写」。

| 本项目 | 复刻自 | 说明 |
|---|---|---|
| `.cp-seat` / `.cp-seatIcon` / `.cp-seatLabel` / `.cp-seatCount` / `.cp-seatChevron` | `.workspace` / `.seat` | 计数器是本项目加的，用 12px `label-caption` |
| `.cp-seat[data-compact="1"]` | `.label`（会话头部「模式」标签） | 22px 高、12/22、`label-tertiary`、图标 14px；仅会话头部使用 |
| `.cp-menu` | `MenuSurface` + `Menu.module.css` 的 `.list` | 材质、圆角、4px 内边距、阴影缝合变量 |
| `.cp-pop` / `.cp-popHead` | `MenuSurface`（同上） | 预览浮层：半径、材质、阴影与菜单一致（无描边、`--dsw-specific-menu` + backdrop、`--dsw-elevation-prominent`），只有位置由 JS 量算 |
| `.cp-menuHead` / `.cp-menuNote` | `.label`（分组标题） | 右侧说明是本项目加的 |
| 宿主 `SegmentedControl`（直接 import） | `SegmentedControl` | 档位行、组 / server、工具行的分段选择都用宿主组件，tablist 语义随组件自带 |
| `.cp-check` / `.cp-checkBody` | `Checkbox` | label 包 input，点文字即切换；标题 13/20 + 说明 12/18 |
| `.cp-groupHead` / `.cp-sep` / `.cp-sectionHead` / `.cp-sectionTitle` | 无直接对应 | 工具分组标题行、档位卡内分隔线、分区小标题（附加规则 / 工具目录） |
| `.cp-btn` | `ui-primitives` 的 Button | md 档：36px 高、14px 字、radius-md、`0 14px`；主按钮 `--dsw-alias-button-primary-fill` + 前景色（不是品牌色 + `#fff`） |
| `.cp-tool` / `.cp-nameCell` / `.cp-stateTag` / `.cp-tokenTag` / `.cp-clear` | 宿主 `Tag` | 工具清单的定宽列：名字（含两枚标签）/描述（超宽折行，完整显示）/状态。两枚标签都用 `Tag` 胶囊：`.cp-stateTag` 按生效状态取 `success` / `warning` / `neutral` 色调并补一圈同色 inset 描边（`.cp-stateTagInner`），被组或 server 改写时用 tooltip 说明本行选择；`.cp-tokenTag` 用默认 `outline` 灰标签显示 token 估算 |
| `.cp-row` / `.cp-rowMain` / `.cp-rowName` / `.cp-rowDesc` / `.cp-rowCount` / `.cp-rowCheck` | `.item` / `.itemIcon` / `.itemLabel` / `.check` | 两行条目 + 行尾计数 + 勾 |
| `.cp-menuSep` | `.separator` | 0.5px + `border-l2` |
| `.cp-status` / `.cp-statusRow` / `.cp-tools` | 无直接对应 | 会话头部的工具状态清单，沿用本项目自己的紧凑排版；`.cp-tools` 是固定可视高度 + 内部滚动的清单区（全量渲染，不截断成「另外 N 个」） |

## 5. 验证配方

```bash
node --check lib/client.js
node scripts/smoke.mjs        # happy-dom 里渲染配置面板与两个 chip 并点击，断言结构与语义
```

冒烟脚本覆盖不到像素，只断言结构与语义（seat 结构、`aria-checked`、勾只在选中行、配置面板的复选行/分段选择语义与 label 可点、头部菜单含状态块与确认块）。真相看截图：截 DSH 桌面窗口，对照 2.1/2.2/2.4/8 的几何自己比。**不要用系统级鼠标/键盘自动化去点 UI**（打断用户操作、留文字选中，验证价值不如一张截图）。桌面端默认不开放调试端口；以 `--remote-debugging-port=9202` 启动后可用 `use-chrome` 技能直连（本机实例即如此：`DevToolsActivePort` 可读、`/json/version` 可连），不带调试参数时退回截桌面窗口的图核对。真渲染验证脚本（读 checkout 主题表 + 容器规则渲 HTML、无头截图量残差）先例在 `dsh-model-efforts/scripts/preview-*.mjs`。token 查询通道：`cordis_inspect_query` 的 Client `Theme.listTokens` 可用；`Slots.listSubTree` 有 input 校验 bug（无论传什么都报 `"input" must be an object`），查槽位结构直接读宿主源码。

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
| `packages/client/ui-theme/src/styles/focus.css` | focus ring 宽度与颜色约定 |
| `packages/client/ui-theme/src/styles/corner-shape.css` | superellipse 圆角；全圆形状要 `corner-shape: round` 退出 |
| `packages/client/ui-theme/src/client/styles.ts` | 上述各表由谁、何时上屏 |
| `packages/client/ui-renderer/src/client/scoped-slots.tsx` | `SlotOutlet`、`[data-slot]` 锚点、`display:contents`、list/single/chain 的分发 |
| `packages/client/modules/src/client/system.ts`、`manifest.ts` | `dsh.client.external` 怎么解析——为什么 `require` 只有基线模块 |

⚠️ **桌面安装里的源码在 `app.asar` 内**：普通 shell、ripgrep、node 都读不进去（只有宿主自己的文件读取能打开）。查样式一律用上面的源码仓库；实在要读 asar，按 asar 头解析（`extract.mjs` 这类小脚本），不要指望 `cat` / `rg`。

### 6.1 跨插件机制（非 UI）

| 路径（相对 DSH 源码根） | 看什么 |
|---|---|
| `packages/core/agent/src/index.ts` | `CreateAgentOptions.setup` 契约（setup 里注册的预设插件/监听器先于 `agent/created`）与 create/announce/dispose 生命周期 |
| `packages/core/agent-loop/src/runtime-context.ts` | system prompt 与 runtime-context 快照的投影/去重：system 节点 0、快照 append/replace 条件 |
| `packages/context/time-context/src/index.ts` + `request-zone.ts` | 时间采样的 pre-step（`prepend`）、三行文本（时间/浏览器时区/间隔）、`refreshIntervalMs` |
| `packages/context/agent-instructions/src/index.ts` | 工作区指令的 pre-step（默认 push）、增量/去重/投影 |
| `vendor/cordis/src/events.ts` | 事件顺序：`prepend` = unshift、waterfall 外层先跑；「同类监听器谁包住谁」的判据 |
| `docs/user/guide/providers.md` | pi-ai reasoning effort 行为权威文档 |

## 7. 明确不可复用的东西

| 东西 | 为什么不行 |
|---|---|
| CSS Module 哈希类名（`.an3WzG_heroOptions`） | 每次构建都变 |
| `clsx` 等宿主包自己的依赖、包内子路径 specifier | 不在 `PLATFORM_MODULES` 种子表（`platform.ts`，核对为 11 项）；`ui-primitives` 本体**在表内**，`require` 直接可用 |
| `ui-conversation` 等宿主 UI 包的内部 React 组件（HeroShell 等） | 包有 `dsh.client` 声明、可作 graph row require，但 `./client` 导出面是 cordis 插件与服务契约（`apply`/`inject`/`ConversationController` 等），不导出内部组件；内部路径不属于公开契约 |
| 宿主的 anchor-positioning 定位代码 | 依赖较新的 Chromium 特性与宿主自己的 `position-try` 变量；我们用的是 JS 量尺寸方案 |

## 8. 配置页版式（两个配置页共用）

适用对象：本仓库的两个「配置页」——`dsh-session-context-config`（上下文档位）与 `dsh-skill-mcp-command-manager`（Skill · Command · MCP）。两者是同一个 `sidebar.panellist` + `main` 的页面形态，版式必须一致；改一侧先看另一侧。

**骨架**（自上而下）：

| 区段 | 几何 / 规则 |
|---|---|
| 页头 | 34×34 图标（radius-sm、`bg-layer-2`）+ 标题 16/24 600 + 说明 12/18 `label-secondary`；内距 `14px 22px 12px`，合计约 70px，**底部分隔线归页头**；关闭钮 30×30 radius-sm 贴右。**页面页签不进这里** |
| 页面页签行 | 页头**分隔线之下**的正文首行（body 的第一个子元素），不占页头高度、行底不再画线。几何抄宿主 `SegmentedTabs` 的 `sm` 档：轨道 padding 2px、radius `md+2`、底色 `bg-module-platform`；tab 30px 高、`0 16px`、13/20、未选 500/`label-secondary`；选中片 `bg-layer-3` + 0.5px `border-l3`、600 |
| 正文 | 卡片承载：0.5px `border-l4` + `bg-layer-1` + `radius-lg` + `14px 16px` 内距 |
| 卡片头 | 标题行 + 可选描述行，**各占一行**：标题 13/20 600，描述 12/18 `label-tertiary`（**允许换行**，不 nowrap）；统计/徽标紧跟标题同一行。无描述时标题上下居中（头上下 padding 相等）。头与正文之间画 `0.5px` `border-l4` 分割线。**卡片本体不设内距**（`padding:0`），上下留白分别由头（`12px 16px`）和正文容器（`8px 16px 14px`）自己控制——不要给卡片再叠一层 padding，否则头/正文各多一段留白 |
| 折叠卡 | 头与普通卡片头同构（标题行 + 可选描述），折叠时只显示头、**不画分割线**；展开时头与 content 之间画 `0.5px` `border-l4`。头内距 `12px 16px`，content `10px 16px 14px` |
| 页脚 | 数据文件/状态说明 + 操作按钮；固定页底，不随正文滚动 |

**页面级左右边距统一 22px**（用户纠正：页签行 22px 比两栏的 8/16px 大）：页头、页签行、正文、页脚一律 22px；两栏页里左右列**只在靠页边的一侧**承担这 22px，靠分隔线的一侧保留较小的列内距（SMC：`.rail` `10px 8px 12px 22px`、`.pane` `12px 22px 16px 16px`）。单栏页的滚动容器把 22px 写进自身 padding（SCC `.scroll` `16px 22px 26px`）。两栏各自滚动，右列的滚动条（宿主 `--dsh-scrollbar-width`，5px）额外占内容盒宽度——量到的卡片右缘会比 22px 多一个滚动条宽度，这是滚动容器的固有偏差，不要用负 padding 硬凑。行内字段说明（`.configDesc` 这类标签下的描述）不设 `max-width` 上限，跟随容器宽度换行。

**页签位置**：参照宿主 `ui-plugin-manager` 的 pageBar——tabs 在 `pageHead` 下方（`pageTabs` 是 `order:3; flex-basis:100%` 的第二行），**但本仓库口径更进一步：页头带底部分隔线，页签行放在分隔线之下、正文容器里**，不和标题同块（用户纠正：页签被放进标题区 = 返工）。宿主值见 `PluginManagerPage.module.css` 的 `.pageTabs` / `.pageTabList`（`size="sm"`、`width:fit-content; min-width:240px`）。

**两栏页**：左列是固定宽度导航（220–260px：工作区/档位），右列是卡片流；两栏各自滚动，`.split` 用 `flex:1; min-height:0` 撑满页头到页脚之间。**不要给内容区套 `vh` 相对高度**（`height:min(560px,100vh-320px)` 这类写法会让清单被卡住，是返工项）。

**选中项**：只加一层 `interactive-bg-active` 底色（与侧栏「全局面板」列表选中项同款），**不加左侧色条、不加粗**；hover 用 `interactive-bg-hover`，键盘焦点才画 focus ring。

**列表卡头与筛选**：计数紧跟标题（不要 `margin-left:auto` 推到行尾）；标题下放占满卡宽的筛选输入框，匹配规则是**名称命中优先、描述命中其次**，过滤中计数显示「匹配 N / 总数」。

**布尔开关**：统一 `role="switch"` + `aria-checked`（不用 checkbox）。几何抄宿主 `Switch`：36×20 轨道（padding 2px）+ 16×16 圆点，选中 `brand-primary`、未选 `border-l3`，全圆轨道配 `corner-shape: round`。**所有行内开关（条目行、MCP 服务行、工具行）一律放行首（左）**，与「点行展开详情」拆成两个按钮（交互元素不嵌套），开关 `margin-top` 对齐首行文字。这条被用户连续纠正两次，按硬规则执行。

**行内信息顺序**：状态与提示（transport / 来源 / 连接状态 / 待重启这类标签，以及卡片头的统计与说明）**紧跟标题左对齐**，禁止 `margin-left:auto` 推到行尾；行内从左往右读，右端留白。同样被纠正两次。

**页级提示**：环境说明这类提示用**无底提示行**——告警色「提示」文字标签 + 说明文字，不套灰底/黄底卡片、不画边框，「提示」标签也不做胶囊底；它不该和卡片流抢层级。

**行内改名**：内容右侧一个 22×22 图标按钮（✎），点开内容变输入框，输入框右侧出现「保存 / 取消」两个**文本**按钮（ui-primitives 没有通用勾/叉图标，不要用 √ / ×）；回车保存、Esc 取消，失败保留输入框并由页头报错。图标按钮与输入框按行居中（`align-self: center`，不要 `margin-top` 硬顶）。内容不截断（不设 `max-width` + 省略号）。

**查阅型说明**（格式表、字段表）：做成**整行卡片、默认折叠、点标题展开**，放在页面页签行下方、两栏之上（横跨导航列与内容列），不属于任何一栏；展开后多栏排布、卡内滚动（`min(40vh,380px)`），不吃掉列表高度。

**实测基线**（窗口 2238×1004、DPR 1）：两个页头都是 70px 内容 + 1px 底部分隔线；SMC 正文 `.split` 高 810px（页头到页脚之间全部用上）；宿主 `role=switch` 关掉技能后，下一轮 catalog 里该技能消失（真机证据）。

## 9. 布局与交互实现细节

**焦点时机**：MenuSurface 首帧是测量态（`visibility:hidden`）不可聚焦——焦点等定位落定后再给（`useEffect` 依赖 `[open, menuPos]`），且**每次 open 只给一次**（滚动列表重新定位时不抢用户正在点的行）。

**折叠区的两个根因**（缺一个漏一条空白带）：① grid `0fr` 只压轨道项高度、不裁其自身 padding——轨道项必须是无 padding 的 clip 层，内容放内层 body；② 折叠容器若同时挂有带 gap 的基类，必须显式 `gap: 0` 覆盖。

**border-box**：宿主应用没有全局 border-box reset——尺寸约束落在内容盒上（弹窗 `max-height` 是内容盒，总高 = 值 + padding）；要按边框盒算得自己写 `box-sizing`。

