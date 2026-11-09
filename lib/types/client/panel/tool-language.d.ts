export type ToolLang = 'zh' | 'source';
/** 默认显示翻译;用户点「文A」切回原文后记住该工具的选择。 */
export declare function readToolLang(toolName: string): ToolLang;
export declare function writeToolLang(toolName: string, lang: ToolLang): void;
/**
 * 翻译一段描述:进程内先查内存,再串行走 Host(避免面板里几十个未知工具同时打模型)。
 * 文本是 key:同一段文本只翻一次,文本变了自然 miss。
 */
export declare function translateToolText(text: string): Promise<string>;
