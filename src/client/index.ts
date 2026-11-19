/**
 * @jia-tools/dsh-session-context-config · 浏览器半边入口。
 *
 * /client 只导出 cordis 加载所需(inject/apply)——组件、纯函数、常量一律内部
 * (官方导出纪律);smoke 门禁按 loader 方式加载 lib/client.js 验证,不为测试放宽导出面。
 * 装配在 apply.ts(唯一跨域装配点);域目录:state(数据与解析)/ menu(浮层与席位
 * 原语)/ panel(配置面板)/ chips(hero 与会话头部 chip)/ contract(域间类型)。
 */
// 共享字号变量块(生成文件,勿手改):两张样式表的 --cp-fs-* 由它提供。
import './tokens.module.css'

export { apply, inject } from './apply.ts'
