# AGENTS.md — Client 半边（配置面板与两个 chip）

本模块文档覆盖：`src/client/**`（`apply.ts` 槽位装配、`panel/` 配置面板、`menu/` 浮层与席位、`chips/` 两个切换入口、`state/` 数据层、`contract/` 跨域类型）。

跨模块约定、构建/热重载见根 [`AGENTS.md`](../AGENTS.md)；Host 半边见 [`../host/AGENTS.md`](../host/AGENTS.md)；设计 token、控件几何与槽位源码地图见 [`docs/dsh-web-ui.md`](../../docs/dsh-web-ui.md)（根 `_docs/dsh-web-ui.md` 的同步副本）。本文只记 Client 侧读代码读不出的设计与坑。

## 组件锚点

| 文件 | 职责 |
|---|---|
| `src/client/index.ts` | 浏览器入口：只导出 `inject`/`apply` |
| `src/client/apply.ts` | 唯一跨域装配点：四个槽位注册；hero/session 槽位以 inject face 提供 `sessionId`（组件不收 ctx） |
| `src/client/contract/` | 域间共享类型（只有 type） |
| `src/client/state/` | 数据层（store/订阅 hooks）与档位解析（与 Host 同规则） |
| `src/client/menu/` | 浮层与席位原语（Popover/Seat/MenuRow/图标/复选行）+ `menu.module.css`；分段选择用宿主 ui-primitives 的 `SegmentedControl`（类型面在 `src/ambient.d.ts`） |
| `src/client/panel/` | 配置面板：`ConfigPanel.ts`（页面骨架、档位增删/预设下拉/保存读取）、`ProfileTabs.ts`（档位页签，配置页页签几何）、`cards.ts`（按消息分卡 + 默认行为卡）、`group-cards.ts`、`options.ts`（`CONTEXT_SWITCHES`/`CHANNEL_CARDS`/`SECTION_OPTIONS` 元数据）、`draft.ts`（草稿派生）、`sticky.ts`（档位栏吸顶检测）、`PreviewDialog.ts`、`ToolDescription.ts`（原文/中文切换）、`translations.ts`（已知工具内置中文）、`tool-language.ts`、`panel.module.css` |
| `src/client/chips/` | 新会话 chip（`conversation.hero.options`）+ 会话头部 chip（`conversation.session.header.actions`，紧跟「模式」标签）+ 共用 picker |
| `docs/dsh-web-ui.md` | 设计 token、控件几何、槽位接入与验证配方——改 UI 前先读 |

## 设计要点

- **面板按「最终请求里的消息」分卡**：`DSH 默认行为`、系统提示词、运行时上下文快照、工作区指令、时间采样、其他注入消息（自动发现）。角色由卡片右上角的 `role: developer` / `role: user` 标签表达，标题不带「system 消息 / user 消息」前缀。行的 `title` 统一放实际注入正文（模板变量已按本次装配渲染；关闭的段给出关闭前文本）。
- **只有「DSH 默认行为」卡用轨道开关**：五个开关语义是「开启 = 本插件介入、关闭 = 宿主原样」，与其它卡「勾选 = 注入」相反，所以用 `role="switch"` + `aria-checked` 的轨道开关把两类语义分开；其余卡仍是「checkbox + 内容说明」的复选行。其中 `ask_user_question` 那一行是「调整 ask_user_question 超时时间」开关 + 秒数输入的组合（标题里嵌实际工具名，等宽字体；开关 = 本插件是否接管等待：开启后秒数框可编辑，留空 = -1 不设期限、填 N = N 秒后 pending；关闭 = 不介入，秒数框禁用），开关右侧写**实际生效的等待效果**（不会超时、断线可恢复 / N 秒后返回 pending / 不介入，宿主原样）——**「不介入」时禁止写死宿主会不会超时**：那由宿主版本与 `tool-ask-user` 那行的 loader 配置决定（legacy 阻塞 / timed 按行配置超时），要写结论就必须先读实际配置；校验通过时不显示任何状态行，只有失效才出提示（`askUser.reason === 'schema'` 禁用控件并告警，无 live 会话 / 该档位延迟 / 定义缺字段给一句中性提示、不禁用，档位是配置面，能否生效要到会话创建时才定）。五者的档位字段与 Host 语义见 Host 文档「默认行为改写」。**行的状态短文案一律紧跟标题**（`.segmentMeta` / `.askMeta`，都靠 `.segmentTitle` 的 `flex-wrap` 折行；**不要**用 `margin-left:auto` 推到行尾——隔半个屏第一眼看不见），文字样式是 12px caption 色。**标题行三块文字按「同一行高 + 盒子中心」对齐**（标题 13px/20、等宽标签 11px/16＋padding、状态文案 12px/20）：行高统一到标题的 20px + boost，`align-items: center` 时三者的字框中心才真正重合（实测差 ≤0.5px）。**不要为了「对齐基线」改成 `align-items: baseline`**：`.tags` 是 `align-items: center` 的 flex 容器、不参与外边基线对齐，它的基线按边框盒底边合成，胶囊标签会整体下沉 2px（实测踩过，看起来像整行文字偏低）；同理别只把行高调成 18px——字号不同、行高不同时居中只对齐盒子中心，字框仍会错开 1~2px。
- **体量标签统一按估算 token**：段、上下文、人设沿用文本、附加规则、注入消息与工具一律写 `约 267 token`，数字来自 `src/tokens.ts` 的分档估算器（Host 的工具目录与 Client 标签共用同一份）；面板只拿得到截断正文时按全文长度比例放大（`cards.ts` 的 `tokensOf`）。**字符数与 `≈` 前缀都不再上文案**：口径要唯一，两套单位并排会被读成可换算。新增计数文案照这条走。
- **段列表按装配实际顺序扁平排列**：不分「人设/宿主固定/工具引导」小区域；人设两个槽位按各自 order 插在列表里（prefix 紧随 identity，suffix 在 app:web-surface 之后）；附加规则 order 固定 20000+，用「本插件附加 · 本档位」小标题与分割线分隔并排在最后。**已关闭但当前装配里没有出现的已知段也会列**（让条件段关掉后仍能重新开启），meta 标「已关闭 · 当前未出现」——这是档位状态里的显式 false，不是该档位多出的注入项；段清单本身是所有 live 装配共享的。**配套段（`tool:*`、`mcp:<server>` / `mcp:<server>:tools`）不列**：它们跟随工具/组与 MCP server 的状态由 Host 自动隐藏/恢复，面板不提供单独开关。
- **上下文名单动态发现**：`CONTEXT_SWITCHES` 只提供已知项的中文名/说明/顺序；装配里出现的未知 name 按原始 name 自动补行并立即可开关。`CHANNEL_CARDS`、`SECTION_OPTIONS` 同理只是**已知项**元数据，真名单来自快照。
- **消息 kind 可关**：每行写 `profile.channels[kind]='off'`，Host 的 pre-step 过滤器按同一键剔除；列表底部可手动输入任意 kind 提前关闭（写入同一 `channels` 表，未观察到的以「手动」行保留），已知通道 id/来源拒绝重复添加。运行期消息可能承载状态同步，**UI 必须保留风险提示**；面板只取当前选中档位那一组（Host 侧分桶见 Host 文档）。
- **chip 报的是「真实生效」，不是「可能要用的档位」**：档位名取 `snapshot.sessions[sessionId]`（含显式的 `none` = 不处理）；只有 live、非空白、又没有 applied 的会话才判「未套用」（`live.applied === false`），此时显示「不处理」——最后的兜底才是 `lastUsedId`（它只是拿不到工作区时的默认值；新会话的默认档位按工作区记在快照的 `lastUsedByWorkspace` 里，blank 会话的 `recorded` 才是它的实际档位）。弹层的「开启/延迟/关闭」与逐行三态标签只在 `status.applied !== false` 时展示；未套用时写一行「未套用档位 · 工具按模式原样注入」、每行标「原样」，不能拿 `lastUsedId` 的档位名冒充该会话（旧 Host 快照缺 `applied` 时按「已套用」保持旧行为）。fork 会话正常会由 Host 侧认亲继承到来源档位、显示成那个档位；显式「不处理」只出现在认不出来源时。**档位名与勾选以 `/api/session` 的实时 `profileId` 为准**，快照只作回落：快照是整页共享的，可能是本会话创建之前取的（新 fork 在旧快照的 `sessions` / `live` 里都没有），只靠快照会把 `lastUsedId` 的档位名挂到本会话上（实测 fork 后显示「Chat」，实际生效的是「完整」）。`usePicker` 发现快照不含本会话时会补拉一次 `/api/state`（每个会话一次，不轮询）。
- **新建档位两种入口**：「+ 新建档位」直接点击建全启用档位；悬停出下拉，从快照 `defaults`（当前插件版本内置预设）复制成 `custom-*`。两者都只改面板草稿，保存前不写状态文件、也不切换当前会话的档位。旧快照缺 `profile.baseline` 时用顶层 `baseline` 兜底（`draft.ts`），**不能用模板默认值**——否则升级后首次打开会把用户已关闭的附加规则显示成开启。
- **档位页签与吸顶行（`.cp-profileBar`）**：配置页很长，切档位不该先滚回顶部，所以档位 tab 那一行钉在滚动区顶上。sticky 的活动范围限于自己的包含块，所以 tab 必须与下面的「名称/描述」卡分开成独立元素，不能和它们挤在同一张卡里。这一行**不套卡片**：`padding: 0`，左右与页面边距对齐（页边由 `.scroll` 的 22px 给），行高就是页签轨道的高度（34px）；吸顶时只收起「+ 新建档位 / 删除当前」——**钉住的那一行里只留 tab**。
  - **页签自绘（`ProfileTabs.ts`），不用宿主 `SegmentedControl`**：几何抄 `dsh-skill-mcp-command-manager` 的页签行（与宿主 `SegmentedTabs` 的 `sm` 档同口径）——轨道 2px 内距、`radius-md + 2px`、底色 `bg-module-platform`；页签 30px 高、`0 16px`、13/20、未选 500/`label-secondary`；选中片 `bg-layer-3` + 0.5px `border-l3`、600。两个配置页的页签必须同一套观感；分段选择（`SegmentedControl`）只留给组 / server / 工具行。页签多时轨道自己横向滚动（`min-width: 0` + `overflow-x: auto`）。
  - **「名称/描述」卡不随吸顶收起**（否决过）：栏是滚动区第一条内容，`scrollTop` 一过 0 就钉住；此刻把 180px 高的那张卡 `display:none`，下面整片卡片会当场往上蹿（滚动锚定补偿也盖不住整块消失）。它照常从栏底下滚走；同理行高在两种状态不变（不做「吸顶变细」）——行高一变，吸顶瞬间同样带位移。
  - **遮挡挂在页签轨道上，行不铺底色**：行本身透明，`.profileTabs` 给一圈页面底色柔光 `box-shadow: 0 0 10px 10px var(--dsw-alias-bg-base)`——轨道自带底色，柔光只在轨道外侧可见，正文从页签后面滑过去时在轨道周围淡出，读起来是「页签浮在正文上 + 与正文分开」；给整行铺底色会变成一条不透明白带、把正文整块切断。别用 `::before` 做遮罩（会盖掉卡片 0.5px 的上边框），也别指望 `box-shadow` 盖住元素自身（外阴影只画在边框盒之外）——见坑库那两条。
  - 吸顶判定在 `sticky.ts`：几何量判断 + resize 重算，命中才置 `data-stuck="1"`；`scrollTop > 0` 的守卫顺带让无布局环境（happy-dom 全零矩形）恒判未吸顶，冒烟因此不需要额外桩。
  - 吸顶后预设下拉要一起收（锚点已被隐藏）：见 `ConfigPanel.ts` 里 `stuck` 那个 effect。
- **面板草稿与「重新读取」**：草稿干净时跟随快照重建；有未保存改动时冻结（chip 切档位、外部快照更新都不得覆盖）。「重新读取」是显式丢弃入口：重新拉快照后按最新响应重建草稿并置干净；读取失败时草稿留在组件里，重试成功后按同一路径重建。
- **快照复用与「打开即重读」**：同一页面快照由 client store 复用。面板每次挂载都是一次新挂载（`main` 是 keyed 槽位，一次只挂选中的那个 entry），所以 mount 上的 `loadSnapshot()` 就是「打开面板即重读」——工具目录/段/上下文/注入消息都由宿主动态生成，不重读就会出现「工具表里明明有、面板里没有」（实测：MCP server 连上、工具已注册，面板仍只列旧 server）。`useSnapshot` 只在 store 为空时拉一次，chip 不触发重读，所以这条重读只挂在面板上。`loadSnapshot` 是单飞的：已有在途请求直接复用（在途请求本身就是最新的，再发一份只会让旧响应的到达顺序决定 store 里留下哪一份）。刷新失败时保留旧快照、只在脚注提示，不把还能用的面板换成错误卡（`store.error` 只给「从来没读到过数据」）。拉取时机不是每请求/定时，见 Host 文档「注入内容自动发现」；没有版本/插件键缓存，版本/插件变化等下次拉取自然生效。
- **工具说明显示侧**：默认显示中文。已知工具走 `translations.ts` 的内置字典（key = 原始描述文本）；未知工具在面板挂载时按需翻译（串行队列，带 loading/失败重试），走 `POST …/api/translate`（Host 侧链路见 Host 文档）。每个工具的显示语言按工具名记在 `localStorage` 的 `dsh-session-context-config:tool-lang`（默认 `zh`，切回原文会记住）。模型侧 schema 完全不动。
- **控件几何与 token**：触发器 28px 高、菜单行 34px 高、字号 13/20 与 12/16；开关 36×20 轨道（padding 2px）+ 16px 圆点、选中 `brand-primary`、全圆轨道配 `corner-shape: round`；配置页版式（页头高度、页签、卡片、选中项、折叠说明卡）按 `docs/dsh-web-ui.md` §8，与 `dsh-skill-mcp-command-manager` 共用，改一处要同步另一侧。**所有行内开关放行首（左）**，与「点行展开详情」拆成两个按钮（交互元素不嵌套）。CSS Modules 类名编译后带 `cp-` 前缀（确定性，`scripts/smoke.mjs` 的类选择器与真机一致）。

## client bundle 契约（本地副本，对应 tag `dsh-v0.2.2-rc.2`）

- **模块表三层**：① 平台种子表 `PLATFORM_MODULES`（11 项，所有 bundle 共享，`require` 第一跳命中，与 `dsh.client` 声明无关）→ ② graph 行（声明 `dsh.client` + `exports["./client"]` 的包，`<pkg>` 与 `<pkg>/client` 同键；要稳定 require 另一个包就列进 `dsh.client.external`，Host 据此拓扑排序让依赖 factory 先到，自指与环报错，未到达抛 `missed the module table`）→ ③ 包内 `require.async` 局部 chunk。
- **`dsh.client` 四字段**：`platform` 只认 `'web'`；`inject` = 包名边（informational），只驱动所列包 factory 的到达/预取顺序，不做 cordis 组合、不提供服务注入；服务注入看 client 入口自己导出的 `inject`（服务名）；`external` 只管模块表请求、不做 cordis 组合；`immediately` 启动期预取（本项目用了 `immediately: true`）。
- **`ui-primitives` 是平台种子词**：`PLATFORM_MODULES` 含 `@deepseek-ai/dsh-client-ui-primitives`，所以 `require` 它直接命中（`Menu`/`MenuSurface`/`Checkbox`/`SegmentedControl`/`Input`/`Toast`/图标都在导出面）。真正 require 不到的是表外 specifier：宿主包自己的依赖（如 `clsx`）与包内子路径——require 这些才会报 `missed the module table`。本项目组件保持自绘（设计选择，不是拿不到）：几何已对齐并有 smoke/截图验证，不为对齐重写；新写组件可直接 import primitives。

## 关键技术边界与坑

> ⚠️ **session 作用域槽位的 `inject` 必须收位置参数，不能去读 `ctx.sessions`**
> 症状：已开始会话的头部 chip（本会话档位切换入口）整块消失，只剩新会话行还能选档位。
> 根因：宿主渲染器把会话 id 作为 `inject` 的第一个实参传入（`packages/client/ui-renderer/src/client/scoped-slots.tsx` 的 `runInject` 传 `binding.key`）；若忽略参数去读 `ctx.sessions.current()`，`sessions` 不在插件 `inject = ['slots']` 名单里，Cordis 注入检查抛错后被 try/catch 吞成 `null`，`SessionChip` 直接 `return null`。新会话行有 `fallbackBlank`（从快照里挑空白会话）兜底，所以症状只出现在已开始的会话。
> 正解：`inject: (sessionId) => ({ sessionId: sessionIdFrom(sessionId) })`（hero 与 header 两个 session 作用域槽位同一写法）。冒烟测试的假 ctx 不带 `sessions` 服务，且 `register` 按槽位作用域传会话 id——假 ctx 自带 `sessions` 会掩盖真实契约。验证：打开已存在会话，`[data-slot="conversation.session.header.actions"]` 内应出现 `button.cp-seat`；切换档位后 `GET /api/session?id=…` 的 tools 数随档位变化。

> ⚠️ **吸顶判定的钉住位置是「内容盒顶边」，不是滚动区外框顶边**
> 症状：档位栏肉眼已经钉住，面板却始终不加 `data-stuck`——「+ 新建档位 / 删除当前」不收起，吸顶像没生效。
> 根因：滚动区的 `padding-top`（`.cp-scroll` 是 16px）把 sticky 的落点推到内容盒顶边；拿 `getBoundingClientRect().top` 直接和滚动区外框顶边比，差值恒等于这条内距，判据永远不成立（实测：`scrollTop=400` 时栏矩形顶边仍停在外框下方 16px 处不动）。
> 正解：钉住位置按 `外框顶边 + borderTopWidth + paddingTop` 算，再和栏的矩形顶边比，留 1px 容差吸收分数缩放（`panel/sticky.ts` 的 `isPinned`）。验证：`scrollTop=40` 时栏矩形顶边 = 滚动区顶边 + 16 且带 `data-stuck="1"`；`scrollTop=0` 时无该属性。

> ⚠️ **sticky 条的遮罩别用绝对定位伪元素，也别指望 box-shadow 盖住元素自身**
> 症状：① 用 `::before { position: absolute; bottom: 100%; background: 页面底色 }` 遮罩时，卡片 0.5px 的上边框像没画；② 改用 `box-shadow: 0 -20px 0 20px` 后，滚动内容从这一行里面透出来（行内没有被盖住）。
> 根因：① 伪元素是该卡片的后代、画在它的边框之上，`bottom: 100%` 的落点与 0.5px 边框在栅格化时贴到一起，边框被底色盖掉（`bottom: 100%` 的包含块是内边距盒，肉眼容易以为它停在边框内侧）；② 外阴影按规范只绘制在边框盒之外——边框盒以内的部分被裁掉，所以再大的 spread 也盖不住元素自身。
> 正解：把柔光挂在**自带底色**的那块材质上（页签轨道）——`box-shadow: 0 0 10px 10px <页面底色>` 只在轨道外侧可见，正文滑过时在轨道周围淡出；确实需要整条遮挡时才给行铺 `background`。两者都别用伪元素，也别指望 box-shadow 盖住元素自身。验证：元素级截图取像素——用伪元素时上边框那行是纯白（应有 `border-l4` 灰）；轨道外侧的正文像素应被柔光稀释，而不是被整块不透明覆盖。

> ⚠️ **消息卡在 flex column 里必须 `flex:none`**
> 症状：配置页消息卡只剩几条横线，内容全无；档位卡和工具卡正常。
> 根因：`.cp-scroll` 是 flex column；`.cp-msgCard` 的 `overflow:hidden` 会把 flex item 的自动最小高度变成 0，内容超过面板高度时卡片被压扁到只剩边框。
> 正解：`.msgCard { flex: none }`（见 `panel.module.css`）。验证：headless Chrome 加载宿主主题 CSS + 插件编译 CSS，量 `.cp-msgCard` 高度；缺 `flex:none` 时只剩 46/46/16/16，正常时 528/528/171/171。

> ⚠️ **DSH 的 CSS Module 类名带哈希，不能当选择器/样式契约**
> 症状：照源码写的 `.heroOptions{...}` 完全不生效，编译产物里类名是 `an3WzG_heroOptions`。
> 根因：宿主用 CSS Modules 构建，类名逐版本变化。
> 正解：只依赖**设计 token**（`--dsw-*`）和**槽位锚点** `[data-slot="<slot key>"]`；控件几何按源码数值重写成自己的类。细节见 `docs/dsh-web-ui.md`。

> ⚠️ **新会话行的插件选项位置：不要自己选父层**
> 症状：注册在 `conversation.hero.options` 的控件位置不对，`margin-right:auto` 或给父层设 `margin-left:0` 怎么调都会连累同槽其它插件。
> 根因：宿主把该槽包在 `.heroOptions`（`margin-left:auto`）里；任何插件去改这层或给整块定 order，都会改变别人的位置，而且胜负取决于样式注入顺序。
> 正解：行级排布由 `dsh-remote-web-ui` 独占（摊平 `.heroOptions` + CSS 区号）；本插件只用槽位 `order: 10` 落在「只读状态标记」段，不再写 `.heroOptions`/父层的样式。完整契约见本包 `docs/dsh-web-ui.md` 3.1。

- **弹层定位必须先量后放**：内容高度渲染后才知道，`useLayoutEffect` 里量完再 setState，且**同值必须 bail**（返回上一个 state），否则每轮渲染都 set 新对象 → 死循环。
- **Client 端的槽位检查工具用不了**：本版本 `cordis_inspect` 的 Client `Slots.listSubTree` 无论传什么 input 都报 `"input" must be an object`。要查槽位结构直接读宿主源码（路径表见 `docs/dsh-web-ui.md`）。

## 添加或修改 UI 的标准流程

1. 读 `docs/dsh-web-ui.md`：确认槽位、可复用 token、控件几何；要动的宿主源码路径写在该文档的「源码地图」。
2. 改 `src/client/`：样式在 `panel/panel.module.css` 与 `menu/menu.module.css`（编译后类名带 `cp-` 前缀）；两处 chip 复用 `menu/seat.ts` 的 `Seat` / `MenuRow`。
3. `pnpm build`，再 `node scripts/smoke.mjs`；「+ 新建档位」悬停下拉与预设复制也在 smoke 里断言，不通过就别急着截图。
4. `pnpm build` 后约 1s client HMR 自动重挂 entry（**不要刷新页面**，见根文档）；需要新页面时才重启桌面应用。然后截窗口图，按 DSH 自带控件对齐几何。
5. 视觉事实有变化才同步 `docs/dsh-web-ui.md`（权威源在仓库根 `_docs/dsh-web-ui.md`，先改根再同步回本地副本）；纯重命名/拆函数不用改文档。

## 本文档维护

判据、记/不记清单、维护决策表都在根 [`AGENTS.md`](../AGENTS.md) 末尾「本文档维护规则」——本文件只放 Client 模块局部知识，遵守同一套标准：只记代码读不出的（设计为什么、坑、硬约束），读到与代码矛盾的断言当场以代码为准修正；新增锚点须可 grep、唯一、稳定。
