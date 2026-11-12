/**
 * 工具引导段（`tool:*`）与档位组的映射：section 名不一定等于工具名。
 *
 * 宿主把 `jobs` / `goal` / `schedule` 这类「一族工具」的引导注册成一个段，段名不是
 * 单个工具名，不能直接拿 `effectiveState(profile, sectionName)` 判断。Host 与
 * Client 各有一份解析（Host `host/tools.ts` 的 effectiveState、Client
 * `client/state/resolve.ts` 的 effective），但**组归属表必须共用同一份**，否则
 * 面板显示的行与真实装配会不一致。
 *
 * 表里只放别名；其余 `tool:<name>` 直接用工具名，组归属由 `groupOf` / 工具目录给出。
 */
export const TOOL_GUIDE_GROUPS: Record<string, string> = {
  jobs: 'terminal',
  goal: 'goal',
  schedule: 'schedule',
  'session-query': 'search',
  session_query: 'search',
}

/**
 * 复合工具引导段对应的真实工具名。所有成员都被隐藏时整段隐藏；只要还有一个
 * 成员开启/延迟，引导就保留（它描述的是这一族工具的共同用法）。
 */
export const TOOL_GUIDE_MEMBERS: Record<string, string[]> = {
  jobs: ['job_output', 'job_list', 'job_kill'],
  goal: ['create_goal', 'get_goal', 'update_goal'],
  schedule: ['schedule_create', 'schedule_list', 'schedule_view', 'schedule_edit'],
  'session-query': ['session_search', 'session_event_search', 'session_trace', 'session_event_trace', 'session_event_read'],
  session_query: ['session_search', 'session_event_search', 'session_trace', 'session_event_trace', 'session_event_read'],
}
