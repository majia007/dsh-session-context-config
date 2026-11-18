/**
 * token 估算:面板上一切「约 N token」的唯一来源,工具目录(Host)与段/上下文标签(Client)共用。
 *
 * 为什么估算而不是精确值:宿主没有把分词器暴露给插件,为一次显示引入词表不划算;
 * 面板的用途是让用户比较各段体量,量级对得上就够用,所以文案一律写「约」。
 * 为什么按字符类型分档:CJK 与拉丁/代码的 token 密度差 2~3 倍,统一一个系数会把中文段
 * 低估一半以上——旧的 0.28 token/字符只对 JSON schema 这类拉丁文本成立。
 */

/** 拉丁字母/数字/代码的密度:沿用旧 JSON schema 标定值,工具侧的估算数字因此不变。 */
const LATIN_TOKENS_PER_CHAR = 0.28

/** 汉字/假名/谚文/全角标点的密度:约 1.5 字一个 token。 */
const CJK_CHARS_PER_TOKEN = 1.5

/** 按码点判定是否属于 CJK(含全角标点):这些字符的 token 密度与拉丁不同档。 */
function isCjk(code: number): boolean {
  return (code >= 0x3000 && code <= 0x303f)
    || (code >= 0x3040 && code <= 0x30ff)
    || (code >= 0x3400 && code <= 0x4dbf)
    || (code >= 0x4e00 && code <= 0x9fff)
    || (code >= 0xac00 && code <= 0xd7af)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xff00 && code <= 0xffef)
    || (code >= 0x20000 && code <= 0x2fa1f)
}

/** 文本的估算 token 数:空文本 0,有内容至少 1(与工具目录「至少 1」的旧口径一致)。 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0
  let cjk = 0
  let latin = 0
  // 按码点遍历:增补平面汉字在 UTF-16 里是两个单元,按单元数会漏掉分档。
  for (const char of text) {
    if (isCjk(char.codePointAt(0) ?? 0)) cjk += 1
    else latin += 1
  }
  return Math.max(1, Math.round(cjk / CJK_CHARS_PER_TOKEN + latin * LATIN_TOKENS_PER_CHAR))
}
