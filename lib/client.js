window.__ModuleLoader__.load({
	id: "dsh-session-context-config",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		// \0dsh-css:D:\workspace\projects\dsh-plugins\dsh-session-context-config\src\client\menu\menu.module.css.mjs
		const css$1 = ".cp-choice{border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-interactive-bg-hover,#2631480f);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);flex:none;grid-auto-columns:1fr;grid-auto-flow:column;gap:2px;padding:4px;display:inline-grid}.cp-choiceOpt{border-radius:var(--dsw-radius-sm,8px);height:28px;color:var(--dsw-alias-label-secondary);white-space:nowrap;cursor:pointer;justify-content:center;align-items:center;padding:0 12px;font-size:13px;font-weight:500;line-height:20px;transition:background-color .12s,color .12s;display:inline-flex;position:relative}.cp-choiceOpt[data-on=\"1\"]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-soft,0 1px 2px #10182814)}.cp-choiceOpt[data-tone=ok][data-on=\"1\"]{color:var(--dsw-alias-state-success-primary)}.cp-choiceOpt[data-tone=warn][data-on=\"1\"]{color:var(--dsw-alias-state-warn-primary)}.cp-choiceOpt[data-tone=mute][data-on=\"1\"]{color:var(--dsw-alias-label-secondary)}.cp-choiceInput{opacity:0;pointer-events:none;width:1px;height:1px;margin:0;position:absolute}.cp-choiceOpt:has(.cp-choiceInput:focus-visible){outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.cp-choiceSm{padding:2px}.cp-choiceSm .cp-choiceOpt{min-width:40px;height:24px;padding:0 8px;font-size:12px;line-height:18px}@media (hover:hover){.cp-choiceOpt:hover{color:var(--dsw-alias-label-primary)}}@media (prefers-reduced-motion:reduce){.cp-choiceOpt{transition:none}}.cp-check{border-radius:var(--dsw-radius-sm,8px);cursor:pointer;align-items:flex-start;gap:8px;padding:6px 8px;display:flex}.cp-check:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}.cp-check input{width:16px;height:16px;accent-color:var(--dsw-alias-brand-primary);cursor:inherit;flex:none;margin:2px 0 0}.cp-check input:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.cp-checkBody{flex-direction:column;gap:1px;min-width:0;display:flex}.cp-checkLabel{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}.cp-checkDesc{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px}.cp-menu{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay));min-width:min(248px,100vw - 24px);max-width:min(360px,100vw - 24px);max-height:calc(100dvh - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-prominent,0 16px 40px #1018282e);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;padding:4px;position:fixed;overflow-y:auto}.cp-menuHead{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));white-space:nowrap;align-items:center;gap:8px;padding:6px 8px;font-size:11px;line-height:15px;display:flex}.cp-menuNote{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));text-overflow:ellipsis;margin-left:auto;font-size:11px;overflow:hidden}.cp-row{border-radius:var(--dsw-radius-md,12px);width:100%;min-height:34px;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;align-items:flex-start;gap:8px;padding:6px 8px;display:flex}.cp-row:hover,.cp-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#2631480f);outline:none}.cp-rowMain{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.cp-rowName{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}.cp-rowDesc{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));white-space:normal;font-size:12px;line-height:16px}.cp-rowCount{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));font-variant-numeric:tabular-nums;flex:none;margin-top:1px;font-size:11px;line-height:18px}.cp-rowCheck{width:14px;height:14px;color:var(--dsw-alias-label-primary);flex:none;margin-top:3px}.cp-menuSep{background:var(--dsw-alias-border-l2,var(--dsw-alias-border-l1));height:.5px;margin:3px 8px}.cp-menu .cp-status{padding:4px 8px 6px}.cp-status{padding:10px 12px}.cp-tools{overscroll-behavior:contain;max-height:224px;margin-top:2px;padding-right:2px;overflow-y:auto}.cp-statusRow{align-items:center;gap:8px;padding:2px 0;font-size:11px;display:flex}.cp-sw{corner-shape:round;border-radius:50%;flex:none;width:7px;height:7px}.cp-sw[data-s=on]{background:var(--dsw-alias-state-success-primary)}.cp-sw[data-s=defer]{background:var(--dsw-alias-state-warn-primary)}.cp-sw[data-s=off]{background:var(--dsw-alias-state-error-primary)}.cp-statusRow .cp-nm{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}.cp-statusRow .cp-st{color:var(--dsw-alias-label-secondary);margin-left:auto}.cp-mini{color:var(--dsw-alias-label-secondary);font-size:11px}.cp-btn{box-sizing:border-box;border-radius:var(--dsw-radius-md,12px);height:36px;box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border:0;justify-content:center;align-items:center;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}.cp-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.cp-btn[data-kind=primary]{box-shadow:none;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}.cp-btn[data-kind=primary]:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.cp-btn[disabled]{opacity:.4;cursor:not-allowed}.cp-seat{border-radius:var(--dsw-radius-sm,8px);min-width:0;max-width:min(100%,240px);min-height:28px;color:var(--dsw-alias-label-primary);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:0;align-items:center;gap:4px;padding:0 8px;font-size:13px;font-weight:500;line-height:20px;display:inline-flex}.cp-seat[aria-expanded=true],.cp-seat:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}.cp-seat:disabled{cursor:default;color:var(--dsw-alias-label-quaternary,var(--dsw-alias-label-secondary))}.cp-seatIcon{color:var(--dsw-alias-label-primary);flex:none}.cp-seatLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.cp-seatCount{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));font-variant-numeric:tabular-nums;flex:none;font-size:12px;line-height:20px}.cp-seatChevron{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));flex:none}.cp-seat[data-compact=\"1\"]{border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-fill-tsp-secondary);height:22px;min-height:22px;color:var(--dsw-alias-label-tertiary);gap:4px;padding:0 4px 0 2px;font-size:12px;font-weight:400;line-height:22px}.cp-seat[data-compact=\"1\"][aria-expanded=true],.cp-seat[data-compact=\"1\"]:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}.cp-seat[data-compact=\"1\"] .cp-seatCount{line-height:22px}div:has(>[data-slot=\"conversation.hero.options\"]){margin-left:0}";
		const tagId$1 = "dsh-session-context-config/menu.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-context-config";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var menu_module_css_default = {
			"seatIcon": "cp-seatIcon",
			"row": "cp-row",
			"rowDesc": "cp-rowDesc",
			"choiceOpt": "cp-choiceOpt",
			"seatCount": "cp-seatCount",
			"btn": "cp-btn",
			"seatLabel": "cp-seatLabel",
			"statusRow": "cp-statusRow",
			"menuHead": "cp-menuHead",
			"rowCount": "cp-rowCount",
			"sw": "cp-sw",
			"mini": "cp-mini",
			"rowName": "cp-rowName",
			"seat": "cp-seat",
			"check": "cp-check",
			"choice": "cp-choice",
			"checkDesc": "cp-checkDesc",
			"rowMain": "cp-rowMain",
			"status": "cp-status",
			"nm": "cp-nm",
			"checkLabel": "cp-checkLabel",
			"menuNote": "cp-menuNote",
			"st": "cp-st",
			"choiceSm": "cp-choiceSm",
			"menu": "cp-menu",
			"choiceInput": "cp-choiceInput",
			"checkBody": "cp-checkBody",
			"seatChevron": "cp-seatChevron",
			"rowCheck": "cp-rowCheck",
			"tools": "cp-tools",
			"menuSep": "cp-menuSep"
		};
		// ../src/client/menu/controls.ts
		/** 表单控件:分段选择与复选行。原生控件藏在 label 里,键盘/读屏语义沿用原生。 */
		/**
		* 分段选择:原生 radio 藏在 label 里,点整段即选中,键盘方向键沿用原生
		* radiogroup 行为。外观照 DSH SegmentedControl:浅色轨道 + 浮起的白色选中片。
		*/
		function Choice({ value, options, onChange, name, label, small }) {
			return (0, react.createElement)("div", {
				className: `${menu_module_css_default.choice}${small ? ` ${menu_module_css_default.choiceSm}` : ""}`,
				role: "radiogroup",
				"aria-label": label
			}, ...options.map(([id, text, tone]) => (0, react.createElement)("label", {
				key: id,
				className: menu_module_css_default.choiceOpt,
				"data-on": value === id ? "1" : "0",
				"data-tone": tone || void 0
			}, (0, react.createElement)("input", {
				className: menu_module_css_default.choiceInput,
				type: "radio",
				name,
				checked: value === id,
				onChange: () => onChange(id)
			}), (0, react.createElement)("span", null, text))));
		}
		/** 复选行:label 包住 input,点文字就能切换,键盘/读屏语义来自原生控件。 */
		function CheckRow({ checked, onChange, label, desc }) {
			return (0, react.createElement)("label", { className: menu_module_css_default.check }, (0, react.createElement)("input", {
				type: "checkbox",
				checked,
				onChange: (event) => onChange(event.target.checked)
			}), (0, react.createElement)("span", { className: menu_module_css_default.checkBody }, (0, react.createElement)("span", { className: menu_module_css_default.checkLabel }, label), desc ? (0, react.createElement)("span", { className: menu_module_css_default.checkDesc }, desc) : null));
		}
		// ../src/client/menu/icons.ts
		/** 插件图标与菜单内的小图形(纯展示,样式类来自 menu.module.css)。 */
		function Glyph({ size = 18, className }) {
			return (0, react.createElement)("svg", {
				viewBox: "0 0 24 24",
				width: size,
				height: size,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.7,
				strokeLinecap: "round",
				"aria-hidden": true,
				className,
				style: { display: "block" }
			}, (0, react.createElement)("path", { d: "M4 7h10" }), (0, react.createElement)("path", { d: "M18 7h2" }), (0, react.createElement)("circle", {
				cx: 16,
				cy: 7,
				r: 2
			}), (0, react.createElement)("path", { d: "M4 17h4" }), (0, react.createElement)("path", { d: "M12 17h8" }), (0, react.createElement)("circle", {
				cx: 10,
				cy: 17,
				r: 2
			}));
		}
		function Chevron({ size = 16 }) {
			return (0, react.createElement)("svg", {
				viewBox: "0 0 24 24",
				width: size,
				height: size,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.6,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				className: menu_module_css_default.seatChevron,
				style: { display: "block" }
			}, (0, react.createElement)("path", { d: "m6 9.5 6 6 6-6" }));
		}
		function Check() {
			return (0, react.createElement)("svg", {
				viewBox: "0 0 16 16",
				width: 14,
				height: 14,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.5,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				className: menu_module_css_default.rowCheck,
				style: { display: "block" }
			}, (0, react.createElement)("path", { d: "M3.4 8.4 6.3 11.3 12.6 4.8" }));
		}
		// ../src/client/state/store.ts
		const API_STATE$1 = "/session-context-config/api/state";
		const store = {
			snapshot: null,
			error: null,
			inflight: null,
			listeners: /* @__PURE__ */ new Set()
		};
		function emit() {
			for (const listener of [...store.listeners]) try {
				listener();
			} catch {}
		}
		async function request(url, options) {
			const response = await fetch(url, {
				cache: "no-store",
				headers: options?.body ? { "content-type": "application/json" } : void 0,
				...options
			});
			const text = await response.text();
			let parsed = null;
			try {
				parsed = text ? JSON.parse(text) : null;
			} catch {
				throw new Error(`接口返回的不是 JSON（HTTP ${response.status}）`);
			}
			const record = parsed;
			if (!response.ok || !record?.ok) throw new Error(record?.error || `请求失败（HTTP ${response.status}）`);
			return parsed;
		}
		function loadSnapshot(force) {
			if (store.inflight && !force) return store.inflight;
			store.inflight = request(API_STATE$1).then((snapshot) => {
				store.snapshot = snapshot;
				store.error = null;
				store.inflight = null;
				emit();
				return snapshot;
			}).catch((error) => {
				store.error = error.message || String(error);
				store.inflight = null;
				emit();
				throw error;
			});
			return store.inflight;
		}
		/** 测试/保存后直接写回快照(POST /state 的响应携带最新快照)。 */
		function setSnapshot(snapshot) {
			store.snapshot = snapshot;
			store.error = null;
			emit();
		}
		function storeInternal() {
			return store;
		}
		// ../src/client/state/hooks.ts
		/** React 订阅胶水:以最小面暴露 store 的快照与错误。 */
		function useSnapshot() {
			const [, tick] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const listener = () => tick((value) => value + 1);
				const store = storeInternal();
				store.listeners.add(listener);
				if (!store.snapshot && !store.error) loadSnapshot().catch(() => {});
				return () => {
					store.listeners.delete(listener);
				};
			}, []);
			return storeInternal().snapshot;
		}
		function useError() {
			const [, tick] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const listener = () => tick((value) => value + 1);
				const store = storeInternal();
				store.listeners.add(listener);
				return () => {
					store.listeners.delete(listener);
				};
			}, []);
			return storeInternal().error;
		}
		const DEFER = "defer";
		const NONE = "none";
		const STATE_LABEL = {
			on: "注入",
			defer: "延迟",
			off: "隐藏",
			force: "强制开启"
		};
		function effective(profile, tool) {
			const groupState = profile.groups?.[tool.group] ?? "on";
			const serverState = tool.server ? profile.servers?.[tool.server] ?? "on" : "on";
			const toolState = profile.tools?.[tool.name] ?? "on";
			if (groupState === "force") return "on";
			if (groupState === "off") return "off";
			if (serverState === "force") return "on";
			if (serverState === "off") return "off";
			if (toolState === "off") return "off";
			if (toolState === "defer") return DEFER;
			if (groupState === "defer" || serverState === "defer") return DEFER;
			return "on";
		}
		function statsFor(profile, tools, presetToolNames) {
			let on = 0;
			let defer = 0;
			let off = 0;
			let onTokens = 0;
			let deferTokens = 0;
			for (const tool of tools) {
				if (presetToolNames && !presetToolNames.has(tool.name)) continue;
				const state = effective(profile, tool);
				if (state === "on") {
					on += 1;
					onTokens += tool.tokens;
				} else if (state === "defer") {
					defer += 1;
					deferTokens += Math.max(8, Math.round(tool.tokens * .35));
				} else off += 1;
			}
			return {
				on,
				defer,
				off,
				onTokens,
				deferTokens
			};
		}
		function formatTokens(value) {
			if (!Number.isFinite(value)) return "—";
			if (value >= 1e3) return `${(value / 1e3).toFixed(value >= 1e4 ? 0 : 1)}k`;
			return String(Math.round(value));
		}
		function presetNames(snapshot, presetId) {
			const preset = snapshot?.presets?.find((item) => item.id === presetId);
			return preset ? new Set(preset.tools.map((tool) => tool.name)) : null;
		}
		// ../src/client/panel/options.ts
		const GROUP_STATES = [
			[
				"force",
				"强制开启",
				"ok"
			],
			[
				"on",
				"开启",
				""
			],
			[
				"defer",
				"延迟",
				"warn"
			],
			[
				"off",
				"隐藏",
				"mute"
			]
		];
		const TOOL_STATES = [
			[
				"on",
				"开启",
				""
			],
			[
				"defer",
				"延迟",
				"warn"
			],
			[
				"off",
				"隐藏",
				"mute"
			]
		];
		const CHANNELS = [[
			"workspaceInstructions",
			"拦截工作区指令",
			"不把 AGENTS.md 等工作区指令发给模型。"
		], [
			"timeContext",
			"拦截时间采样",
			"不把「Time sampled …」时间采样发给模型。"
		]];
		const PROMPT_MODES = [
			[
				"inherit",
				"沿用",
				""
			],
			[
				"replace",
				"替换人设段",
				""
			],
			[
				"complete",
				"极简（仅这段）",
				""
			]
		];
		// \0dsh-css:D:\workspace\projects\dsh-plugins\dsh-session-context-config\src\client\panel\panel.module.css.mjs
		const css = ".cp-root{background:var(--dsw-alias-bg-base);height:100%;min-height:0;color:var(--dsw-alias-label-primary);flex-direction:column;font-size:13px;line-height:20px;display:flex}.cp-head{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;align-items:flex-start;gap:12px;padding:18px 22px 14px;display:flex}.cp-headIcon{border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-2);flex:none;justify-content:center;align-items:center;width:34px;height:34px;display:flex}.cp-headText{flex:1;min-width:0}.cp-title{margin:0;font-size:16px;font-weight:600;line-height:24px}.cp-sub{color:var(--dsw-alias-label-secondary);margin:3px 0 0;font-size:12px}.cp-iconBtn{border-radius:var(--dsw-radius-sm,8px);width:30px;height:30px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;flex:none;justify-content:center;align-items:center;display:flex}.cp-iconBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}.cp-scroll{flex-direction:column;flex:1;gap:14px;min-height:0;padding:16px 22px 26px;display:flex;overflow:auto}.cp-card{border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:var(--dsw-radius-lg,16px);padding:14px 16px}.cp-cardTitle{margin:0 0 10px;font-size:13px;font-weight:600}.cp-chipRow{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.cp-chip{border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);corner-shape:round;font:inherit;cursor:pointer;border-radius:999px;align-items:center;gap:6px;padding:5px 13px;font-size:12px;display:inline-flex}.cp-chip:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}.cp-chip[data-on=\"1\"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);font-weight:600}.cp-link{color:var(--dsw-alias-brand-primary);font:inherit;cursor:pointer;background:0 0;border:0;padding:4px 2px;font-size:12px}.cp-link:hover{text-decoration:underline}.cp-link[disabled]{color:var(--dsw-alias-state-idle-primary);cursor:default;text-decoration:none}.cp-field{flex-direction:column;gap:6px;margin-top:10px;display:flex}.cp-input,.cp-textarea,.cp-search{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1);width:100%;color:var(--dsw-alias-label-primary);font:inherit;outline:none;font-size:14px;line-height:22px}.cp-input,.cp-search{height:32px;padding:0 8px}.cp-textarea{resize:vertical;min-height:96px;padding:8px 10px}.cp-input:focus,.cp-textarea:focus,.cp-search:focus{border-color:var(--dsw-alias-state-business-primary)}.cp-groupHead{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;margin-bottom:2px;padding:0 0 8px;display:flex}.cp-groupName{font-size:13px;font-weight:600}.cp-count{color:var(--dsw-alias-label-secondary);font-size:11px}.cp-push{margin-left:auto}.cp-serverRow{border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-2);align-items:center;gap:8px;margin:8px -8px 2px;padding:4px 8px;display:flex}.cp-serverRow .cp-srv{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:18px}.cp-tool{border-radius:var(--dsw-radius-sm,8px);grid-template-columns:minmax(120px,148px) minmax(0,1fr) 46px 42px auto;align-items:center;gap:10px;margin:0 -8px;padding:5px 8px;display:grid}.cp-tool:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}.cp-tool .cp-nm{white-space:nowrap;text-overflow:ellipsis;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:18px;overflow:hidden}.cp-tool .cp-zh{min-width:0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));white-space:nowrap;text-overflow:ellipsis;font-size:12px;line-height:18px;overflow:hidden}.cp-tool .cp-cost{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));font-variant-numeric:tabular-nums;text-align:right;font-size:11px;line-height:18px}.cp-shift{white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;flex:none;width:42px;font-size:11px;line-height:18px}.cp-shift[data-s=on]{color:var(--dsw-alias-state-success-primary)}.cp-shift[data-s=defer]{color:var(--dsw-alias-state-warn-primary)}.cp-shift[data-s=off]{color:var(--dsw-alias-label-tertiary)}.cp-clear{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font:inherit;border-radius:var(--dsw-radius-xs,4px);cursor:pointer;background:0 0;border:0;align-items:center;margin:2px 0 0 -6px;padding:4px 6px;font-size:12px;line-height:18px;display:inline-flex}.cp-clear:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary)}.cp-foot{border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none;align-items:center;gap:10px;padding:12px 22px;display:flex}.cp-footNote{min-width:0;color:var(--dsw-alias-label-secondary);white-space:nowrap;text-overflow:ellipsis;flex:1;font-size:12px;overflow:hidden}.cp-btn{box-sizing:border-box;border-radius:var(--dsw-radius-md,12px);height:36px;box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border:0;justify-content:center;align-items:center;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}.cp-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.cp-btn[data-kind=primary]{box-shadow:none;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}.cp-btn[data-kind=primary]:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.cp-btn[disabled]{opacity:.4;cursor:not-allowed}.cp-empty{color:var(--dsw-alias-label-secondary);padding:16px 2px;font-size:12px}.cp-error{color:var(--dsw-alias-state-error-primary);word-break:break-word;font-size:12px}.cp-sep{background:var(--dsw-alias-border-l1);height:1px;margin:10px 0}.cp-checks{flex-direction:column;gap:2px;margin:4px -8px 0;display:flex}.cp-hint{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));margin:4px 0 0;font-size:12px;line-height:18px}.cp-checks+.cp-hint{margin-left:24px}.cp-divider{background:var(--dsw-alias-border-l2,var(--dsw-alias-border-l1));height:.5px;margin:14px 0 10px}.cp-subhead{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));margin:0 0 2px;font-size:12px;font-weight:500;line-height:18px}.cp-mini{color:var(--dsw-alias-label-secondary);font-size:11px}.cp-pop{z-index:2000;box-sizing:border-box;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay));min-width:min(300px,100vw - 24px);max-width:min(460px,100vw - 24px);max-height:calc(100dvh - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-prominent,0 16px 40px #1018282e);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;position:fixed;overflow:auto}.cp-popHead{border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);justify-content:space-between;gap:12px;padding:9px 12px;font-size:12px;display:flex}.cp-status{padding:10px 12px}.cp-statusRow{align-items:center;gap:8px;padding:2px 0;font-size:11px;display:flex}.cp-statusRow .cp-nm{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}.cp-statusRow .cp-st{color:var(--dsw-alias-label-secondary);margin-left:auto}";
		const tagId = "dsh-session-context-config/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-context-config";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"pop": "cp-pop",
			"headText": "cp-headText",
			"search": "cp-search",
			"field": "cp-field",
			"textarea": "cp-textarea",
			"groupName": "cp-groupName",
			"statusRow": "cp-statusRow",
			"iconBtn": "cp-iconBtn",
			"shift": "cp-shift",
			"srv": "cp-srv",
			"chip": "cp-chip",
			"title": "cp-title",
			"serverRow": "cp-serverRow",
			"tool": "cp-tool",
			"nm": "cp-nm",
			"foot": "cp-foot",
			"footNote": "cp-footNote",
			"head": "cp-head",
			"divider": "cp-divider",
			"sub": "cp-sub",
			"card": "cp-card",
			"subhead": "cp-subhead",
			"zh": "cp-zh",
			"cost": "cp-cost",
			"mini": "cp-mini",
			"status": "cp-status",
			"headIcon": "cp-headIcon",
			"cardTitle": "cp-cardTitle",
			"st": "cp-st",
			"error": "cp-error",
			"input": "cp-input",
			"popHead": "cp-popHead",
			"link": "cp-link",
			"count": "cp-count",
			"clear": "cp-clear",
			"checks": "cp-checks",
			"scroll": "cp-scroll",
			"chipRow": "cp-chipRow",
			"root": "cp-root",
			"groupHead": "cp-groupHead",
			"btn": "cp-btn",
			"hint": "cp-hint",
			"push": "cp-push",
			"sep": "cp-sep",
			"empty": "cp-empty"
		};
		// ../src/client/panel/cards.ts
		/** 系统提示词卡与基线卡:档位的 prompt/通道开关 + 与档位无关的基线开关。 */
		function SystemPromptCard({ profile, patch }) {
			return (0, react.createElement)("section", { className: panel_module_css_default.card }, (0, react.createElement)("h2", { className: panel_module_css_default.cardTitle }, "系统提示词"), (0, react.createElement)(Choice, {
				value: profile.prompt.mode,
				options: PROMPT_MODES,
				onChange: (mode) => patch((target) => {
					target.prompt.mode = mode;
				}),
				name: "scc-prompt-mode",
				label: "系统提示词来源"
			}), profile.prompt.mode === "inherit" ? null : (0, react.createElement)("div", { className: panel_module_css_default.field }, (0, react.createElement)("textarea", {
				className: panel_module_css_default.textarea,
				value: profile.prompt.text,
				maxLength: 2e4,
				placeholder: "例如：你是一个只做最小改动的编码代理，回复用中文，先给结论。",
				onChange: (event) => {
					const value = event.target.value;
					patch((target) => {
						target.prompt.text = value;
					});
				}
			})), (0, react.createElement)("div", { className: panel_module_css_default.divider }), (0, react.createElement)("div", { className: panel_module_css_default.subhead }, "上下文注入"), (0, react.createElement)("div", { className: panel_module_css_default.checks }, (0, react.createElement)(CheckRow, {
				checked: profile.runtimeContext !== false,
				onChange: (value) => patch((target) => {
					target.runtimeContext = value;
				}),
				label: "注入运行时上下文",
				desc: "控制快照里的可选段（文件策略、批准策略等）；当前工作目录始终保留。"
			}), ...CHANNELS.map(([key, label, desc]) => (0, react.createElement)(CheckRow, {
				key,
				checked: profile.channels?.[key] === "off",
				onChange: (blocked) => patch((target) => {
					target.channels = target.channels ?? {};
					if (blocked) target.channels[key] = "off";
					else delete target.channels[key];
				}),
				label,
				desc
			}))), (0, react.createElement)("p", { className: panel_module_css_default.hint }, "拦截只影响发给模型的请求；消息仍写入会话记录，在轨迹里仍可见。"));
		}
		/** 基线是插件级开关(与档位无关),所以改的是 draft.baseline 而不是某个档位。 */
		function BaselineCard({ draft, patchBaseline }) {
			return (0, react.createElement)("section", { className: panel_module_css_default.card }, (0, react.createElement)("h2", { className: panel_module_css_default.cardTitle }, "基线（所有新会话）"), (0, react.createElement)("p", { className: panel_module_css_default.hint }, "与档位无关：新会话总会收到这些内容，关闭后从下一场新会话起生效。"), (0, react.createElement)("div", { className: panel_module_css_default.checks }, (0, react.createElement)(CheckRow, {
				checked: draft?.baseline?.contract !== false,
				onChange: (value) => patchBaseline("contract", value),
				label: "行为契约",
				desc: "不可逆动作先确认、如实汇报、信息足够就行动、跟随周边风格等 6 条。"
			}), (0, react.createElement)(CheckRow, {
				checked: draft?.baseline?.cardReceipt !== false,
				onChange: (value) => patchBaseline("cardReceipt", value),
				label: "卡片回执",
				desc: "UI 已渲染卡片时只回一句确认，不复述字段；失败仍给细节。"
			}), (0, react.createElement)(CheckRow, {
				checked: draft?.baseline?.untrustedFiles !== false,
				onChange: (value) => patchBaseline("untrustedFiles", value),
				label: "不可信下载",
				desc: "隔离目录、路径传参、python -I 三条读取规则。"
			}), (0, react.createElement)(CheckRow, {
				checked: draft?.baseline?.environmentFacts !== false,
				onChange: (value) => patchBaseline("environmentFacts", value),
				label: "环境事实",
				desc: "platform / shell / git 状态，每会话探测一次。"
			}), (0, react.createElement)(CheckRow, {
				checked: draft?.baseline?.inCompletePrompt !== false,
				onChange: (value) => patchBaseline("inCompletePrompt", value),
				label: "complete 档位也保留基线",
				desc: "complete 会独占 developer 消息，勾选表示把基线并进那段文本。"
			})));
		}
		// ../src/client/panel/group-cards.ts
		/** 工具行与目录摘要输入(组卡片的行级构件)。 */
		function toolRow(tool, profile, setToolState) {
			const state = effective(profile, tool);
			const raw = profile.tools?.[tool.name] ?? "on";
			return (0, react.createElement)("div", {
				className: panel_module_css_default.tool,
				key: tool.name
			}, (0, react.createElement)("span", {
				className: panel_module_css_default.nm,
				title: tool.name
			}, tool.name), (0, react.createElement)("span", { className: panel_module_css_default.zh }, tool.server ? "" : tool.description ?? ""), (0, react.createElement)("span", { className: panel_module_css_default.cost }, `≈${formatTokens(tool.tokens)}`), (0, react.createElement)("span", {
				className: panel_module_css_default.shift,
				"data-s": state,
				title: state !== raw ? `生效：${STATE_LABEL[state]}（工具级记录：${STATE_LABEL[raw]}）` : void 0
			}, state !== raw ? `→${state === "on" ? "开启" : STATE_LABEL[state]}` : ""), (0, react.createElement)(Choice, {
				small: true,
				value: raw,
				options: TOOL_STATES,
				onChange: (next) => setToolState(tool.name, next),
				name: `scc-tool-${tool.name}`,
				label: `${tool.name} 状态`
			}));
		}
		/** 目录摘要输入:summaryKey 命中时显示,值写进 profile.summaries。 */
		function summaryInput(key, hint, profile, summaryKey, patch) {
			return summaryKey === key ? (0, react.createElement)("div", {
				className: panel_module_css_default.field,
				style: { margin: "4px 0 8px" }
			}, (0, react.createElement)("input", {
				className: panel_module_css_default.input,
				value: profile.summaries?.[key] ?? "",
				placeholder: hint,
				onChange: (event) => {
					const value = event.target.value;
					patch((target) => {
						if (value.trim()) target.summaries[key] = value;
						else delete target.summaries[key];
					});
				}
			})) : null;
		}
		/** 组头部的状态徽标说明(server 生效状态被组改写时的「→开启」小列)。 */
		function shiftBadge(serverEffective, serverState) {
			return (0, react.createElement)("span", {
				className: panel_module_css_default.shift,
				"data-s": serverEffective,
				title: serverEffective !== serverState ? `生效：${STATE_LABEL[serverEffective]}` : void 0
			}, serverEffective !== serverState ? `→${serverEffective === "on" ? "开启" : STATE_LABEL[serverEffective]}` : "");
		}
		// ../src/client/panel/PreviewDialog.ts
		/** 预览浮层:各 agent preset 下这套档位的注入/延迟/隐藏统计。 */
		function PreviewDialog({ profile, snapshot, onClose }) {
			const rows = snapshot.presets.map((preset) => {
				const names = new Set(preset.tools.map((tool) => tool.name));
				return {
					preset,
					stats: statsFor(profile, snapshot.tools, names)
				};
			});
			return (0, react.createElement)("div", {
				className: panel_module_css_default.pop,
				style: {
					left: "50%",
					top: 80,
					transform: "translateX(-50%)",
					width: 460,
					maxWidth: "90vw"
				}
			}, (0, react.createElement)("div", { className: panel_module_css_default.popHead }, (0, react.createElement)("span", null, `预览：${profile.name}`), (0, react.createElement)("button", {
				className: panel_module_css_default.link,
				onClick: onClose
			}, "关闭")), (0, react.createElement)("div", { className: panel_module_css_default.status }, ...rows.map(({ preset, stats }) => (0, react.createElement)("div", {
				className: panel_module_css_default.statusRow,
				key: preset.id
			}, (0, react.createElement)("span", { className: panel_module_css_default.nm }, preset.name), (0, react.createElement)("span", { className: panel_module_css_default.st }, `注入 ${stats.on} · 延迟 ${stats.defer} · 隐藏 ${stats.off} · ≈${formatTokens(stats.onTokens)} tokens`)))));
		}
		// ../src/client/panel/ConfigPanel.ts
		/**
		* 配置面板:档位草稿(增删改名/组/server/工具状态/摘要)、系统提示词与基线开关、
		* 保存与预览。草稿干净时跟随快照镜像,脏时冻结;写成功后置干净等镜像重derive。
		*/
		const API_STATE = "/session-context-config/api/state";
		const LABEL$1 = "上下文档位";
		function ConfigPanel(props) {
			const snapshot = useSnapshot();
			const error = useError();
			const [draft, setDraft] = (0, react.useState)(null);
			const [selectedId, setSelectedId] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [status, setStatus] = (0, react.useState)(null);
			const [previewOpen, setPreviewOpen] = (0, react.useState)(false);
			const [previewMode, setPreviewMode] = (0, react.useState)(null);
			const [summaryKey, setSummaryKey] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (!snapshot || draft) return;
				setDraft(JSON.parse(JSON.stringify({
					profiles: snapshot.profiles,
					lastUsedId: snapshot.lastUsedId,
					baseline: snapshot.baseline ?? {}
				})));
				setSelectedId(snapshot.profiles[0]?.id ?? null);
			}, [snapshot, draft]);
			const profile = (0, react.useMemo)(() => draft?.profiles?.find((item) => item.id === selectedId) ?? null, [draft, selectedId]);
			const groups = snapshot?.groups ?? [];
			const tools = snapshot?.tools ?? [];
			const toolsByGroup = (0, react.useMemo)(() => {
				const map = /* @__PURE__ */ new Map();
				for (const tool of tools) {
					if (!map.has(tool.group)) map.set(tool.group, []);
					map.get(tool.group).push(tool);
				}
				return map;
			}, [tools]);
			const dirty = (0, react.useMemo)(() => {
				if (!snapshot || !draft) return false;
				return JSON.stringify(draft) !== JSON.stringify({
					profiles: snapshot.profiles,
					lastUsedId: snapshot.lastUsedId,
					baseline: snapshot.baseline ?? {}
				});
			}, [snapshot, draft]);
			const patchBaseline = (0, react.useCallback)((key, value) => {
				setDraft((current) => current ? {
					...current,
					baseline: {
						...current.baseline,
						[key]: value
					}
				} : current);
				setStatus(null);
			}, []);
			const patch = (0, react.useCallback)((mutate) => {
				setDraft((current) => {
					if (!current) return current;
					const next = JSON.parse(JSON.stringify(current));
					const target = next.profiles.find((item) => item.id === selectedId);
					if (!target) return current;
					mutate(target);
					return next;
				});
				setStatus(null);
			}, [selectedId]);
			const setGroupState = (0, react.useCallback)((groupId, state) => {
				patch((target) => {
					if (state === "on") delete target.groups[groupId];
					else target.groups[groupId] = state;
				});
			}, [patch]);
			const setServerState = (0, react.useCallback)((serverId, state) => {
				patch((target) => {
					if (state === "on") delete target.servers[serverId];
					else target.servers[serverId] = state;
				});
			}, [patch]);
			const setToolState = (0, react.useCallback)((toolName, state) => {
				patch((target) => {
					if (state === "on") delete target.tools[toolName];
					else target.tools[toolName] = state;
				});
			}, [patch]);
			const clearGroupTools = (0, react.useCallback)((groupId) => {
				patch((target) => {
					for (const tool of toolsByGroup.get(groupId) ?? []) delete target.tools[tool.name];
				});
			}, [patch, toolsByGroup]);
			const addProfile = (0, react.useCallback)(() => {
				if (!draft) return;
				let index = draft.profiles.length + 1;
				let id = `custom-${index}`;
				while (draft.profiles.some((item) => item.id === id)) {
					index += 1;
					id = `custom-${index}`;
				}
				setDraft({
					...draft,
					profiles: [...draft.profiles, {
						id,
						name: `档位 ${index}`,
						description: "",
						prompt: {
							mode: "inherit",
							text: ""
						},
						runtimeContext: true,
						channels: {},
						groups: {},
						servers: {},
						tools: {},
						summaries: {}
					}]
				});
				setSelectedId(id);
				setStatus(null);
			}, [draft]);
			const removeProfile = (0, react.useCallback)(() => {
				if (!draft || draft.profiles.length <= 1) return;
				const rest = draft.profiles.filter((item) => item.id !== selectedId);
				setDraft({
					...draft,
					profiles: rest
				});
				setSelectedId(rest[0].id);
				setStatus(null);
			}, [draft, selectedId]);
			const save = (0, react.useCallback)(async () => {
				if (!draft) return;
				setBusy(true);
				try {
					const result = await request(API_STATE, {
						method: "POST",
						body: JSON.stringify(draft)
					});
					setSnapshot(result.snapshot);
					setDraft(JSON.parse(JSON.stringify({
						profiles: result.snapshot.profiles,
						lastUsedId: result.snapshot.lastUsedId,
						baseline: result.snapshot.baseline ?? {}
					})));
					setStatus("已保存");
					emit();
				} catch (cause) {
					setStatus(cause.message || String(cause));
				} finally {
					setBusy(false);
				}
			}, [draft]);
			if (error) return (0, react.createElement)("div", { className: panel_module_css_default.root }, (0, react.createElement)("div", { className: panel_module_css_default.scroll }, (0, react.createElement)("div", { className: panel_module_css_default.card }, (0, react.createElement)("p", { className: panel_module_css_default.error }, error), (0, react.createElement)("button", {
				className: panel_module_css_default.btn,
				onClick: () => loadSnapshot(true),
				style: { marginTop: 10 }
			}, "重试"))));
			if (!snapshot || !draft || !profile) return (0, react.createElement)("div", { className: panel_module_css_default.root }, (0, react.createElement)("div", { className: panel_module_css_default.empty }, "正在读取…"));
			const s = statsFor(profile, tools, presetNames(snapshot, previewMode ?? snapshot.defaultPreset) ?? presetNames(snapshot, snapshot.defaultPreset));
			const perMode = snapshot.presets.map((preset) => ({
				id: preset.id,
				name: preset.name,
				...statsFor(profile, tools, new Set(preset.tools.map((tool) => tool.name)))
			}));
			const groupRows = groups.map((group) => {
				const list = toolsByGroup.get(group.id) ?? [];
				const configuredServers = group.id === "mcp" ? Object.keys(profile.servers ?? {}) : [];
				const servers = [.../* @__PURE__ */ new Set([...list.map((tool) => tool.server).filter((server) => Boolean(server)), ...configuredServers])];
				if (list.length === 0 && servers.length === 0) return null;
				const groupState = profile.groups?.[group.id] ?? "on";
				const groupDeferred = groupState === "defer" || groupState !== "off" && groupState !== "force" && list.some((tool) => effective(profile, tool) === "defer");
				const customized = list.some((tool) => (profile.tools?.[tool.name] ?? "on") !== "on");
				return (0, react.createElement)("div", {
					className: panel_module_css_default.card,
					key: group.id
				}, (0, react.createElement)("div", { className: panel_module_css_default.groupHead }, (0, react.createElement)("span", { className: panel_module_css_default.groupName }, group.title), (0, react.createElement)("span", { className: panel_module_css_default.count }, `${list.length} 个`), group.id === "mcp" && servers.length > 0 ? (0, react.createElement)("span", { className: panel_module_css_default.mini }, `${servers.length} 个 server`) : null, (0, react.createElement)("span", { className: panel_module_css_default.push }), groupDeferred ? (0, react.createElement)("button", {
					className: panel_module_css_default.link,
					type: "button",
					title: "目录摘要",
					onClick: () => setSummaryKey(summaryKey === group.id ? null : group.id)
				}, "摘要") : null, (0, react.createElement)(Choice, {
					value: groupState,
					options: GROUP_STATES,
					onChange: (next) => setGroupState(group.id, next),
					name: `scc-group-${group.id}`,
					label: `${group.title}组状态`
				})), summaryInput(group.id, "目录摘要（默认取首个工具描述的首句）", profile, summaryKey, patch), group.id === "mcp" ? servers.map((serverId) => {
					const serverTools = list.filter((tool) => tool.server === serverId);
					const serverState = profile.servers?.[serverId] ?? "on";
					const serverEffective = effective(profile, {
						name: "",
						group: group.id,
						server: serverId
					});
					return (0, react.createElement)("div", { key: serverId }, (0, react.createElement)("div", { className: panel_module_css_default.serverRow }, (0, react.createElement)("span", {
						className: panel_module_css_default.srv,
						title: serverId
					}, serverId), (0, react.createElement)("span", { className: panel_module_css_default.count }, serverTools.length > 0 ? `${serverTools.length} 个` : "未上线"), (0, react.createElement)("span", { className: panel_module_css_default.push }), (0, react.createElement)("button", {
						className: panel_module_css_default.link,
						type: "button",
						title: "目录摘要",
						onClick: () => setSummaryKey(summaryKey === serverId ? null : serverId)
					}, "摘要"), shiftBadge(serverEffective, serverState), (0, react.createElement)(Choice, {
						small: true,
						value: serverState,
						options: GROUP_STATES,
						onChange: (next) => setServerState(serverId, next),
						name: `scc-server-${serverId}`,
						label: `${serverId} 状态`
					})), summaryInput(serverId, `目录摘要（server ${serverId}）`, profile, summaryKey, patch), ...serverTools.map((tool) => toolRow(tool, profile, setToolState)));
				}) : list.map((tool) => toolRow(tool, profile, setToolState)), group.id === "mcp" || !customized ? null : (0, react.createElement)("button", {
					className: panel_module_css_default.clear,
					type: "button",
					onClick: () => clearGroupTools(group.id)
				}, "清除本组工具级设置"));
			});
			return (0, react.createElement)("div", { className: panel_module_css_default.root }, (0, react.createElement)("header", { className: panel_module_css_default.head }, (0, react.createElement)("div", { className: panel_module_css_default.headIcon }, (0, react.createElement)(Glyph, { size: 18 })), (0, react.createElement)("div", { className: panel_module_css_default.headText }, (0, react.createElement)("h1", { className: panel_module_css_default.title }, LABEL$1), (0, react.createElement)("p", { className: panel_module_css_default.sub }, "在这里配置档位；新会话与已开始的会话都可以选它。组只提供默认值，隐藏与强制开启会压过子项。")), props?.closePanel ? (0, react.createElement)("button", {
				className: panel_module_css_default.iconBtn,
				onClick: props.closePanel,
				title: "关闭"
			}, "✕") : null), (0, react.createElement)("div", { className: panel_module_css_default.scroll }, (0, react.createElement)("section", { className: panel_module_css_default.card }, (0, react.createElement)("div", { className: panel_module_css_default.chipRow }, ...draft.profiles.map((item) => (0, react.createElement)("button", {
				key: item.id,
				className: panel_module_css_default.chip,
				"data-on": item.id === selectedId ? "1" : "0",
				onClick: () => setSelectedId(item.id)
			}, item.name)), (0, react.createElement)("button", {
				className: panel_module_css_default.link,
				type: "button",
				onClick: addProfile
			}, "+ 新建档位"), (0, react.createElement)("button", {
				className: panel_module_css_default.link,
				type: "button",
				onClick: removeProfile,
				disabled: draft.profiles.length <= 1
			}, "删除当前")), (0, react.createElement)("div", { className: panel_module_css_default.field }, (0, react.createElement)("input", {
				className: panel_module_css_default.input,
				value: profile.name,
				maxLength: 60,
				"aria-label": "档位名称",
				onChange: (event) => {
					const value = event.target.value;
					patch((target) => {
						target.name = value;
					});
				}
			}), (0, react.createElement)("input", {
				className: panel_module_css_default.input,
				value: profile.description,
				maxLength: 200,
				placeholder: "一句话说明这套档位用来做什么",
				"aria-label": "档位说明",
				onChange: (event) => {
					const value = event.target.value;
					patch((target) => {
						target.description = value;
					});
				}
			})), (0, react.createElement)("div", { className: panel_module_css_default.sep }), (0, react.createElement)("div", { className: panel_module_css_default.chipRow }, (0, react.createElement)("span", { className: panel_module_css_default.mini }, `注入 ${s.on} · 延迟 ${s.defer} · 隐藏 ${s.off}`), (0, react.createElement)("span", { className: panel_module_css_default.mini }, `≈ ${formatTokens(s.onTokens)} tokens`), (0, react.createElement)("button", {
				className: panel_module_css_default.link,
				type: "button",
				onClick: () => setPreviewOpen(true)
			}, "预览各模式结果")), (0, react.createElement)("div", {
				className: panel_module_css_default.chipRow,
				style: { marginTop: 6 }
			}, ...perMode.map((item) => (0, react.createElement)("span", {
				className: panel_module_css_default.mini,
				key: item.id
			}, `${item.name} ${item.on}${item.defer ? `+${item.defer}迟` : ""}`)))), (0, react.createElement)(SystemPromptCard, {
				profile,
				patch
			}), (0, react.createElement)(BaselineCard, {
				draft,
				patchBaseline
			}), ...groupRows, snapshot.live?.some((item) => !item.blank) ? (0, react.createElement)("p", { className: panel_module_css_default.mini }, "已开始的会话不会自动套用这里的改动；它们只在会话头部确认切换时重算。") : null), (0, react.createElement)("footer", { className: panel_module_css_default.foot }, (0, react.createElement)("div", { className: panel_module_css_default.footNote }, status ?? (dirty ? "有未保存的改动" : "已保存")), (0, react.createElement)("button", {
				className: panel_module_css_default.btn,
				type: "button",
				onClick: () => loadSnapshot(true),
				disabled: busy
			}, "重新读取"), (0, react.createElement)("button", {
				className: panel_module_css_default.btn,
				"data-kind": "primary",
				type: "button",
				onClick: save,
				disabled: busy || !dirty
			}, busy ? "保存中…" : "保存")), previewOpen ? (0, react.createElement)(PreviewDialog, {
				profile,
				snapshot,
				onClose: () => setPreviewOpen(false)
			}) : null);
		}
		// ../src/client/menu/popup.ts
		/** 锚定浮层:portal 到 body,先量后放(同值 bail),下方放不下翻到触发器上方。 */
		function Popover({ anchor, onClose, label, children }) {
			const [pos, setPos] = (0, react.useState)(null);
			const ref = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const onDoc = (event) => {
					if (ref.current && !ref.current.contains(event.target) && !anchor?.current?.contains(event.target)) onClose();
				};
				const onKey = (event) => {
					if (event.key === "Escape") onClose();
				};
				document.addEventListener("mousedown", onDoc);
				document.addEventListener("keydown", onKey);
				return () => {
					document.removeEventListener("mousedown", onDoc);
					document.removeEventListener("keydown", onKey);
				};
			}, [anchor, onClose]);
			(0, react.useLayoutEffect)(() => {
				const el = ref.current;
				const box = anchor?.current;
				if (!el || !box) return;
				const a = box.getBoundingClientRect();
				const p = el.getBoundingClientRect();
				const left = Math.min(Math.max(8, a.left), Math.max(8, window.innerWidth - p.width - 8));
				let top = a.bottom + 4;
				if (top + p.height > window.innerHeight - 8) top = Math.max(8, a.top - p.height - 4);
				setPos((prev) => prev && prev.left === left && prev.top === top ? prev : {
					left,
					top
				});
			});
			return (0, react_dom.createPortal)((0, react.createElement)("div", {
				className: menu_module_css_default.menu,
				ref,
				role: "menu",
				"aria-label": label,
				style: pos ? {
					left: pos.left,
					top: pos.top
				} : {
					left: -9999,
					top: -9999,
					visibility: "hidden"
				}
			}, children), document.body);
		}
		// ../src/client/menu/seat.ts
		/** 触发器与菜单行:新会话行用整尺寸 seat;会话头部用 compact(与宿主「模式」静态标签同字号/同色)。 */
		function Seat({ anchorRef, open, onClick, title, label, count, compact }) {
			return (0, react.createElement)("button", {
				ref: anchorRef,
				type: "button",
				className: menu_module_css_default.seat,
				"data-compact": compact ? "1" : void 0,
				"aria-haspopup": "menu",
				"aria-expanded": open ? "true" : "false",
				title,
				onClick
			}, (0, react.createElement)(Glyph, {
				size: compact ? 14 : 16,
				className: menu_module_css_default.seatIcon
			}), (0, react.createElement)("span", { className: menu_module_css_default.seatLabel }, label), count != null ? (0, react.createElement)("span", { className: menu_module_css_default.seatCount }, String(count)) : null, (0, react.createElement)(Chevron, { size: compact ? 14 : 16 }));
		}
		function MenuRow({ selected, onClick, name, desc, count }) {
			return (0, react.createElement)("button", {
				type: "button",
				role: "menuitemradio",
				"aria-checked": selected ? "true" : "false",
				className: menu_module_css_default.row,
				onClick
			}, (0, react.createElement)("span", { className: menu_module_css_default.rowMain }, (0, react.createElement)("span", { className: menu_module_css_default.rowName }, name), desc ? (0, react.createElement)("span", { className: menu_module_css_default.rowDesc }, desc) : null), count != null ? (0, react.createElement)("span", { className: menu_module_css_default.rowCount }, String(count)) : null, selected ? (0, react.createElement)(Check, null) : (0, react.createElement)("span", {
				className: menu_module_css_default.rowCheck,
				"aria-hidden": true
			}));
		}
		// ../src/client/chips/picker.ts
		/**
		* 两个 chip 共用的选择器逻辑:会话定位、当前档位、候选列表与切换请求。
		* 组件不再收 ctx:当前会话 id 由注册面(apply.ts 的 inject face)以 props 传入。
		*/
		const API_SESSION$1 = "/session-context-config/api/session";
		function resolveSessionId(props) {
			return props?.session?.id ?? props?.session?.sessionId ?? props?.sessionId ?? null;
		}
		function usePicker(props, options) {
			const snapshot = useSnapshot();
			const anchor = (0, react.useRef)(null);
			const [open, setOpen] = (0, react.useState)(false);
			const fromProps = resolveSessionId(props);
			const fallbackBlank = options?.fallbackBlank ? snapshot?.live?.find((item) => item.blank)?.sessionId ?? null : null;
			const sessionId = fromProps ?? fallbackBlank;
			const live = snapshot?.live?.find((item) => item.sessionId === sessionId) ?? null;
			const currentId = snapshot?.sessions?.[sessionId] ?? snapshot?.lastUsedId ?? "none";
			const current = snapshot?.profiles?.find((item) => item.id === currentId) ?? null;
			const counts = (0, react.useMemo)(() => {
				if (!snapshot) return null;
				const presetId = live?.preset ?? snapshot.defaultPreset;
				const names = presetNames(snapshot, presetId);
				if (!names) return null;
				return {
					names,
					presetId
				};
			}, [snapshot, live]);
			return {
				snapshot,
				sessionId,
				current,
				currentId,
				chips: (0, react.useMemo)(() => {
					if (!snapshot || !counts) return [];
					const list = snapshot.profiles.map((item) => ({
						id: item.id,
						name: item.name,
						desc: item.description,
						stats: statsFor(item, snapshot.tools, counts.names)
					}));
					list.unshift({
						id: NONE,
						name: "不处理",
						desc: "按模式原样注入",
						stats: null
					});
					return list;
				}, [snapshot, counts]),
				open,
				setOpen,
				anchor,
				choose: (0, react.useCallback)(async (profileId) => {
					if (!sessionId) return;
					setOpen(false);
					try {
						setSnapshot((await request(API_SESSION$1, {
							method: "POST",
							body: JSON.stringify({
								sessionId,
								profileId
							})
						})).snapshot);
						emit();
					} catch (error) {
						console.warn("[session-context-config] 切换档位失败", error);
					}
				}, [sessionId])
			};
		}
		// ../src/client/chips/HeroChip.ts
		/** 新会话行(hero)的档位 chip:整尺寸 seat + 档位菜单。 */
		function HeroChip(props) {
			const picker = usePicker(props, { fallbackBlank: true });
			if (!picker.snapshot || !picker.sessionId) return null;
			const stats = picker.current ? statsFor(picker.current, picker.snapshot.tools, presetNames(picker.snapshot, picker.snapshot.live?.find((i) => i.sessionId === picker.sessionId)?.preset ?? picker.snapshot.defaultPreset)) : null;
			return (0, react.createElement)(react.Fragment, null, (0, react.createElement)(Seat, {
				anchorRef: picker.anchor,
				open: picker.open,
				onClick: () => picker.setOpen(!picker.open),
				title: "本会话的工具档位",
				label: picker.current?.name ?? "不处理",
				count: stats ? stats.on : null
			}), picker.open ? (0, react.createElement)(Popover, {
				anchor: picker.anchor,
				onClose: () => picker.setOpen(false),
				label: "本会话的工具档位"
			}, (0, react.createElement)("div", { className: menu_module_css_default.menuHead }, (0, react.createElement)("span", null, "本次会话的工具档位"), (0, react.createElement)("span", { className: menu_module_css_default.menuNote }, "只作用于本会话")), ...picker.chips.map((chip) => (0, react.createElement)(MenuRow, {
				key: chip.id,
				selected: chip.id === picker.currentId,
				name: chip.name,
				desc: chip.desc,
				count: chip.stats ? chip.stats.on + chip.stats.defer : null,
				onClick: () => picker.choose(chip.id)
			}))) : null);
		}
		// ../src/client/chips/SessionChip.ts
		/**
		* 会话头部的紧凑 chip:注入计数 + 全量工具状态清单 + 切换确认块。
		* 工具状态在挂载与每次打开时各取一次,保证清单最新。
		*/
		const API_SESSION = "/session-context-config/api/session";
		function SessionChip(props) {
			const picker = usePicker(props);
			const [status, setStatus] = (0, react.useState)(null);
			const [confirmId, setConfirmId] = (0, react.useState)(null);
			const anchor = picker.anchor;
			(0, react.useEffect)(() => {
				if (!picker.sessionId) return;
				let alive = true;
				request(`${API_SESSION}?id=${encodeURIComponent(picker.sessionId)}`).then((value) => {
					if (alive) setStatus(value);
				}).catch(() => {
					if (alive) setStatus(null);
				});
				return () => {
					alive = false;
				};
			}, [picker.open, picker.sessionId]);
			if (!picker.snapshot || !picker.sessionId) return null;
			return (0, react.createElement)(react.Fragment, null, (0, react.createElement)(Seat, {
				anchorRef: anchor,
				compact: true,
				open: picker.open,
				onClick: () => picker.setOpen(!picker.open),
				title: "本会话的工具档位",
				label: picker.current?.name ?? "不处理",
				count: status ? status.tools.filter((tool) => tool.state === "on").length : null
			}), picker.open ? (0, react.createElement)(Popover, {
				anchor,
				onClose: () => picker.setOpen(false),
				label: "本会话工具状态"
			}, (0, react.createElement)("div", { className: menu_module_css_default.menuHead }, (0, react.createElement)("span", null, "本会话工具状态"), (0, react.createElement)("span", { className: menu_module_css_default.menuNote }, status?.blank ? "尚未开始的会话可随时切换" : "切换会重建前缀缓存")), status ? (0, react.createElement)("div", { className: menu_module_css_default.status }, (0, react.createElement)("div", { className: menu_module_css_default.statusRow }, (0, react.createElement)("span", null, `注入 ${status.tools.filter((tool) => tool.state === "on").length}`), (0, react.createElement)("span", null, `延迟 ${status.tools.filter((tool) => tool.state === DEFER).length}`), (0, react.createElement)("span", null, `隐藏 ${status.tools.filter((tool) => tool.state === "off").length}`)), (0, react.createElement)("div", { className: menu_module_css_default.tools }, ...status.tools.map((tool) => (0, react.createElement)("div", {
				className: menu_module_css_default.statusRow,
				key: tool.name
			}, (0, react.createElement)("span", {
				className: menu_module_css_default.sw,
				"data-s": tool.state
			}), (0, react.createElement)("span", { className: menu_module_css_default.nm }, tool.name), (0, react.createElement)("span", { className: menu_module_css_default.st }, tool.state === "defer" && tool.loaded ? "延迟 · 已取定义" : STATE_LABEL[tool.state]))))) : (0, react.createElement)("div", { className: `${menu_module_css_default.status} ${menu_module_css_default.mini}` }, "正在读取状态…"), (0, react.createElement)("div", { className: menu_module_css_default.menuSep }), ...picker.chips.map((chip) => (0, react.createElement)(MenuRow, {
				key: chip.id,
				selected: chip.id === picker.currentId,
				name: chip.name,
				desc: chip.desc,
				count: chip.stats ? chip.stats.on + chip.stats.defer : null,
				onClick: () => setConfirmId(chip.id)
			})), confirmId ? (0, react.createElement)("div", { className: menu_module_css_default.status }, (0, react.createElement)("div", {
				className: menu_module_css_default.mini,
				style: { marginBottom: 8 }
			}, "确认切换？工具表整体替换，缓存从第一个变化的 schema 处重建。"), (0, react.createElement)("div", { style: {
				display: "flex",
				gap: 8,
				justifyContent: "flex-end"
			} }, (0, react.createElement)("button", {
				className: menu_module_css_default.btn,
				onClick: () => setConfirmId(null)
			}, "取消"), (0, react.createElement)("button", {
				className: menu_module_css_default.btn,
				"data-kind": "primary",
				onClick: () => {
					setConfirmId(null);
					picker.choose(confirmId);
				}
			}, "确认"))) : null) : null);
		}
		// ../src/client/apply.ts
		/**
		* 唯一跨域装配点:把 panel/chips 注册进槽位。
		*
		* ctx 纪律:ctx 只活在apply 世界;组件收 props——当前会话 id 由 hero/session 槽位
		* 注册的 inject face 以 `sessionId` 传入(替代旧版把 ctx 塞进组件的做法),
		* 面板的关闭动作由 main 槽位的 inject face 提供 closePanel。
		*
		* 样式不再走 ctx.effect 注入:CSS Modules 的注入器模块在 factory 执行时写入
		* 带 tag 的 <style>(幂等),视觉与旧版一致;详见 AGENTS.md 偏差清单。
		*/
		const LABEL = "上下文档位";
		/** 从宿主 sessions 服务解析当前会话 id(注册面 inject face 闭包里调用)。 */
		function serviceSessionId(ctx) {
			try {
				const service = ctx?.sessions;
				const current = typeof service?.current === "function" ? service.current() : service?.current;
				return current?.id ?? current?.sessionId ?? null;
			} catch {
				return null;
			}
		}
		const inject = ["slots"];
		function apply(ctx) {
			let layoutService = null;
			try {
				ctx.inject(["layout"], (scoped) => {
					layoutService = scoped.layout;
					return () => {
						layoutService = null;
					};
				});
			} catch {}
			const layout = () => {
				try {
					return layoutService ?? (typeof ctx.get === "function" ? ctx.get("layout") : void 0);
				} catch {
					return;
				}
			};
			function SidebarGlyph() {
				return (0, react.createElement)(Glyph, { size: 16 });
			}
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: "session-context-config",
				order: 30,
				label: () => LABEL
			}, SidebarGlyph));
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: "session-context-config",
				inject: () => ({
					presentation: "panel",
					closePanel: () => {
						try {
							layout()?.selectPanel?.(null);
						} catch {}
					}
				})
			}, (props) => (0, react.createElement)(ConfigPanel, { ...props })));
			ctx.slots.inject("conversation.hero.options", () => ctx.slots.register({
				name: "conversation.hero.options",
				id: "session-context-config",
				order: 20,
				inject: () => ({ sessionId: serviceSessionId(ctx) })
			}, (props) => (0, react.createElement)(HeroChip, { ...props })));
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "session-context-config",
				order: 10,
				inject: () => ({ sessionId: serviceSessionId(ctx) })
			}, (props) => (0, react.createElement)(SessionChip, { ...props })));
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map