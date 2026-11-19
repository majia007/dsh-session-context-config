// generated from _shared/fence/connection-fence.ts@b411e465ea5e28275b97981a3e9c97c055c007d2529d5a490dbe1b509f9c8d17 — do not edit
/**
 * connection 信任栅栏(生成文件,勿手改)。
 *
 * 宿主的 `webServer` 对插件直接 `register` 的路由不做任何认证/Origin 检查,所以每个
 * handler 必须先过这一层:有 `connection` 服务时完全以它的 `admit` 为准(rc.1→master
 * 通用入口),只有 `requestRejection` 的老构建作兜底;两者都没有时才退到本模块的
 * 回环校验——宁可拒绝本机网页/curl,也不放行一个无人认证的写接口。
 *
 * 为什么不用 `ctx.connection` 属性取:`connection` 不在各插件的 inject 名单里,Cordis 对
 * 未声明服务的属性访问会直接抛 `cannot get property "connection" without inject`;
 * `ctx.get(name)` 在缺失时返回 undefined,才拿得到「没有这个服务」。
 */

/** 请求面:只需要 headers(Node 对重复头给数组,其余类型一律忽略)。 */
export interface FenceRequest {
  readonly headers: Record<string, unknown>
}

/** 响应面:写状态码 + 收尾即可(与各插件自己的 HttpResponse 最小结构兼容)。 */
export interface FenceResponse {
  writeHead(status: number, headers?: Record<string, string | number>): unknown
  end(body?: string): unknown
}

/** 宿主 `connection` 服务的两代入口(各自可选,见 ambient 类型面)。 */
export interface FenceConnection {
  admit?(request: FenceRequest): { readonly rejection?: number } | undefined
  requestRejection?(request: FenceRequest): number | undefined
}

/** `ctx.get` 的最小面;调用方按需收窄。 */
export interface FenceContext {
  get(name: string): unknown
}

/** 诊断回调:取服务失败时记录一次,不影响准入结果。 */
export type FenceNote = (service: string, error: unknown) => void

/**
 * 两代入口的统一准入判定:`admit` 优先(rc.1 起都有;master 删掉 `requestRejection` 后
 * 只剩它),老构建的 `requestRejection` 作兜底。
 * @param connection - 宿主 connection 服务(缺失时视为放行,由调用方决定是否回退)。
 * @param request - 待准入的请求。
 * @returns 拒绝状态码;放行返回 undefined。
 */
export function admissionStatus(connection: FenceConnection | undefined, request: FenceRequest): number | undefined {
  if (connection === undefined) return undefined
  const admission = connection.admit?.(request)
  if (admission !== undefined) return admission.rejection
  return connection.requestRejection?.(request)
}

/** 单个请求头;Node 对重复头给数组,这里只接受唯一字符串值。 */
function header(request: FenceRequest, name: string): string | undefined {
  const value = request.headers[name]
  return typeof value === 'string' ? value.trim() : undefined
}

/**
 * Host/Origin 的 authority 是否指向本机回环字面地址(端口不限)。
 * 只认 localhost、127.0.0.0/8 与 [::1]:回退分支拿不到宿主的 trustedHosts,认不出的
 * 一律拒绝(fail closed),也不做 DNS 解析。
 */
function isLoopbackAuthority(authority: string): boolean {
  if (authority.startsWith('[')) {
    const end = authority.indexOf(']')
    if (end < 0) return false
    const rest = authority.slice(end + 1)
    if (rest !== '' && !/^:\d{1,5}$/.test(rest)) return false
    return authority.slice(0, end + 1) === '[::1]'
  }
  const colon = authority.indexOf(':')
  if (colon !== -1 && !/^\d{1,5}$/.test(authority.slice(colon + 1))) return false
  const hostname = colon === -1 ? authority : authority.slice(0, colon)
  if (hostname === 'localhost') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/**
 * 宿主没有 connection 服务时的回退栅栏:Host 必须是回环地址,显式跨站标记与非同源
 * Origin 一律拒绝;Origin 缺失(命令行 curl)放行,因为 Host 已经钉住请求目标。
 */
function loopbackAllows(request: FenceRequest): boolean {
  const host = header(request, 'host')?.toLowerCase()
  if (host === undefined || !isLoopbackAuthority(host)) return false
  if (header(request, 'sec-fetch-site')?.toLowerCase() === 'cross-site') return false
  const origin = header(request, 'origin')
  if (origin === undefined || origin === '') return true
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return url.host.toLowerCase() === host
  } catch {
    return false
  }
}

/**
 * 完整栅栏:connection 服务 → 两代准入 → 回环回退。
 * @param ctx - Host 上下文(`connection` 用 `ctx.get` 取,缺失不抛)。
 * @param request - 待准入的请求。
 * @param note - 诊断回调(取服务抛错时记录,不改变准入结论)。
 * @param fallbackStatus - 回退分支的拒绝状态码,由各插件既有口径钉死(不统一,避免改线上探测结果)。
 * @returns 拒绝状态码;放行返回 undefined。
 */
export function connectionRejection(
  ctx: FenceContext,
  request: FenceRequest,
  note?: FenceNote,
  fallbackStatus = 403,
): number | undefined {
  let fence: FenceConnection | undefined
  try {
    fence = ctx.get('connection') as FenceConnection | undefined
  } catch (error) {
    note?.('connection', error)
    fence = undefined
  }
  // 服务在场就以它为准:它也放行受信的非回环 Host(如 dsh web --host 局域网场景),
  // 不能再拿本地的回环判断覆盖它的结论。
  if (fence !== undefined && (fence.admit !== undefined || typeof fence.requestRejection === 'function')) {
    return admissionStatus(fence, request)
  }
  return loopbackAllows(request) ? undefined : fallbackStatus
}

/**
 * 路由 handler 的「先过栅栏」形态:拒绝时自己写回响应并返回 true。
 * 响应体与各插件其余路由的错误体同形(`{ ok: false, error }`),状态码走栅栏判定。
 * @returns true = 已拒绝并应答,handler 直接 return。
 */
export function fenceRequest(
  ctx: FenceContext,
  request: FenceRequest,
  response: FenceResponse,
  note?: FenceNote,
  fallbackStatus = 403,
): boolean {
  const status = connectionRejection(ctx, request, note, fallbackStatus)
  if (status === undefined) return false
  const body = JSON.stringify({ ok: false, error: 'rejected' })
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
  return true
}
