/**
 * 配置面板:档位草稿(增删改名/组/server/工具状态/摘要)、系统提示词与基线开关、
 * 保存与预览。草稿干净时跟随快照镜像,脏时冻结;写成功后置干净等镜像重derive。
 */
import { type ReactElement } from 'react';
export declare function ConfigPanel(props: {
    closePanel?: () => void;
}): ReactElement;
