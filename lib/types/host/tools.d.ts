/**
 * 档位解析与「延迟」占位:给定一个档位和一个工具名,算它该注入、延迟还是隐藏,
 * 以及延迟时留在 tools 数组里的那份占位定义。
 *
 * 为什么延迟不是删除:占位让 tools 数组整场不变,加载动作不打断前缀缓存。
 * 完整 schema 由 tool_search 以工具结果的形式追加进历史。
 */
import { type ContextProfile } from './constants.ts';
/** 工具定义的最小面(占位与骨架只需要这三个字段)。 */
export interface ToolDefinitionLike {
    name: string;
    description?: string;
    parameters?: unknown;
}
export declare function groupOf(toolName: string): string;
export declare function serverOf(toolName: string): string | null;
/**
 * 父级只提供默认值;隐藏与强制开启是终态,会压过子项。
 * 自上而下判定:组终态 → server 终态 → 工具终态 → 任一层的“延迟” → 注入。
 */
export declare function effectiveState(profile: ContextProfile, toolName: string): string;
/** 只留必需参数的结构,可选参数交给 tool_search。 */
export declare function skeleton(schema: unknown): unknown;
export declare function firstSentence(text: unknown): string;
/** 摘要优先级:server 手写 > 组手写 > 原描述首句 > 工具名。 */
export declare function summaryFor(profile: ContextProfile, toolName: string, description: string | undefined): string;
export declare function placehold(schema: ToolDefinitionLike, summary: string): {
    name: string;
    description: string;
    parameters: unknown;
};
