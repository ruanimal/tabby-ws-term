/**
 * 协议相关类型定义
 * @module protocols/types
 */

/**
 * 支持的协议类型
 */
export type ProtocolType = 'kube-exec' | 'ttyd'

/**
 * 终端尺寸
 */
export interface TerminalSize {
    /** 列数 */
    columns: number
    /** 行数 */
    rows: number
}

/**
 * 解码后的消息类型 - 终端输出
 */
export interface OutputMessage {
    type: 'output'
    data: Buffer
}

/**
 * 解码后的消息类型 - 窗口标题
 */
export interface TitleMessage {
    type: 'title'
    data: string
}

/**
 * 解码后的消息类型 - 服务消息
 */
export interface ToastMessage {
    type: 'toast'
    data: string
}

/**
 * 解码后的消息类型 - 终端偏好设置
 */
export interface PreferencesMessage {
    type: 'preferences'
    data: Record<string, unknown>
}

/**
 * 解码后的消息联合类型
 */
export type DecodedMessage = OutputMessage | TitleMessage | ToastMessage | PreferencesMessage

/**
 * ttyd 连接初始消息接口
 * 建立 WebSocket 连接后，客户端须先发送此二进制 JSON 消息进行握手。
 */
export interface TtydConnectMessage {
    AuthToken: string
    columns: number
    rows: number
}

/**
 * ttyd 协议的消息类型前缀
 */
export const TTYD_PREFIX = {
    /** 输入消息前缀 */
    INPUT: '0',
    /** 调整大小消息前缀 */
    RESIZE: '1',
    /** 暂停消息前缀 */
    PAUSE: '2',
    /** 恢复消息前缀 */
    RESUME: '3',
    /** 输出消息前缀 */
    OUTPUT: '0',
    /** 设置标题消息前缀 */
    SET_TITLE: '1',
    /** 设置偏好消息前缀 */
    SET_PREFERENCES: '2',
} as const

/**
 * kube-exec 协议的操作类型
 */
export const KUBE_EXEC_OP = {
    /** 标准输入操作 */
    STDIN: 'stdin',
    /** 标准输出操作 */
    STDOUT: 'stdout',
    /** 调整大小操作 */
    RESIZE: 'resize',
    /** 服务消息操作 */
    TOAST: 'toast',
} as const
