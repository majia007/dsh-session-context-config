# 发布（npm）

发版操作手册。**仅在用户明确要求发布时走**；平时不改版本号、不 push、不 publish。构建/安装/热重载见根 [`AGENTS.md`](../AGENTS.md)「构建、安装与验证」。

## 1. 版本号

只在发布时改 `package.json` 的 `version`，并 `pnpm build` 让 `lib/` 与版本一致。修 bug 升 patch、加功能升 minor、按用户指定优先。

## 2. 发布前验证（全绿再谈发布）

```bash
pnpm build
pnpm exec tsc --noEmit
pnpm test
node scripts/smoke.mjs
node scripts/harness.mjs
```

敏感信息与发布面检查：

```pwsh
git status --short
git grep -n -I -E "(password|secret|token|api[_-]?key|npm_[A-Za-z0-9]{20,})"
npm pack --dry-run          # 只应有 package.json/README/LICENSE/cordis.patch.yml/lib/**/locale/**/icon
```

`lib/` 不入 git，由 `prepack` / `prepare` 在发布时重建；tarball 不含 `src/`、`tests/`、`.npmrc` 与任何 token。

## 3. 提交与推送

提交信息遵循仓库格式（`<type>(<scope>): 一句话`，空行，`- ` 清单）。**不自行 push**：改动提交到本地后先问用户是否推送、是否发版；用户确认后才 `git push`，再 `npm publish`。

## 4. 发布目标

由 `package.json` 的 `publishConfig.registry` 钉住：

```json
"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" }
```

它随包走，不依赖本机 `.npmrc`、nrm 当前源或执行目录（npm 会把 `publishConfig` 的键摊进发布配置，只有显式 CLI flag 如 `--registry=…` 优先）。项目级 `.npmrc` 的 `@jia-tools:registry=…` 只作本机 scope 解析的兜底；**token 只放用户级 `~/.npmrc`**（`//registry.npmjs.org/:_authToken=`），不要写进项目 `.npmrc`（会进 git）。

## 5. 在可见终端里发布

**2FA 卡点**：npm 的 `otplease` 先判 `process.stdin.isTTY`，助手命令通道非 TTY → 直接跑 `npm publish` 必报 `EOTP` 并退出（只打出 `auth/cli` 与 `done?authId` 两行 URL，不开浏览器、不轮询，`--auth-type=web` 无效）。

所以「发布」固定为一条必须在可见终端里跑的 4 步链：

1. **预检凭据**：`npm whoami --registry=https://registry.npmjs.org/`；不通过就 `npm login --registry=https://registry.npmjs.org/`，登录后再探一次，**仍不过就中止，绝不带着坏凭据去 publish**。
2. **查版本是否已存在**：读 registry 元数据（GET `https://registry.npmjs.org/@jia-tools%2Fdsh-session-context-config` 看 `versions`）。已在就跳过——同版本不可覆盖，重发只会 `E409`。
3. **发布**：在包目录 `npm publish`（`prepack` / `prepare` 会重建产物）。
4. **核对**：读同一份 registry 元数据的 `dist-tags` 与该版本的 `dist.fileCount`，再 `npm stage list` 看是否进了 stage。

工作区里有现成实现：`../../_docs/scripts/publish-npm.ps1 <包目录…>`（本目录被单独 clone 时按上面四步自写）；它检测到输出被重定向（非 TTY）会自己 `Start-Process pwsh -NoExit -File` 弹窗口。

- **不要向用户索要 6 位码，也不要用 `--otp` 代跑**。
- 失败先分诊再动手：`E404`（PUT 到 npmjs）多半是**未认证**（npmjs 对未登录方回 404 而非 401），先 `npm whoami`；`E409` 是同版本已发；`EOTP` 是没有 TTY。

## 6. 核对（先排除 stage 与缓存，再下结论）

1. **有没有进 stage（人工审核）**：staged publishing（npm ≥ 11.15、Node ≥ 22.14）会把版本先放进 stage，维护者用 2FA 批准后才上线，期间 registry 元数据里看不到新版本。

   ```pwsh
   npm stage list @jia-tools/dsh-session-context-config --registry=https://registry.npmjs.org/
   npm stage view <stage-id>
   npm stage approve <stage-id>     # 2FA 批准后才公开
   ```

   全新包被 stage 时会先发一个公开占位版本 `0.0.0-stage`。用 stage-only token 时 `npm publish` 报 `E_STAGE_REQUIRED`，要改 `npm stage publish`。**看到 stage 就等批准，不要重复 `npm publish`**。

2. **版本号**（两层缓存都可能给旧值：内网 Nexus 代理的包元数据缓存、npm 本地元数据缓存）：

   ```pwsh
   npm view @jia-tools/dsh-session-context-config version --registry https://registry.npmjs.org/ --prefer-online
   Invoke-WebRequest https://registry.npmjs.org/@jia-tools%2Fdsh-session-context-config   # 看 dist-tags
   ```

   实测：1.3.0 已上线，`npm view` 仍报 1.2.2、`npm view …@1.3.0` 报 404；直接用 registry 元数据为准。

3. **让 profile 重新解析**：`remove_bundle` → `install_bundle`（link: 安装指向同一份工作树，版本随之更新）。

## 7. 认证失败分诊

| 症状 | 判定 | 处理 |
|---|---|---|
| 显式指公开源时 `E401 Unauthorized` | `//registry.npmjs.org/:_authToken` 失效 | 用户侧 `npm login --registry=https://registry.npmjs.org/`，或写新 token 到同名键 |
| PUT 到 npmjs 返回 `E404 Not Found` | **多半是未认证的 PUT**（npmjs 对未登录方回 404 不回 401） | 先 `npm whoami --registry=https://registry.npmjs.org/` |
| 「登录成功但发 npmjs 仍失败」 | token 按 registry 主机分键存（`//host/:_authToken`）；`npm login` 不带 `--registry` 会写到当时默认源那把键上 | 登录一律带 `--registry`；nrm 只改 `registry=` 行，不碰 token 键 |

## 8. 回滚

优先发新 patch 修正；`npm deprecate @jia-tools/<包>@<版本> "<原因>"` 标记问题版本；`npm unpublish` 仅在发布 72 小时内且确认影响可控时使用。GitHub 侧 revert 提交即可，已发布的 tag 不建议重写。

更完整的仓库级发版流程（GitHub 建仓、dsh-market 登记）见工作区根 `_docs/release-process.md`。
