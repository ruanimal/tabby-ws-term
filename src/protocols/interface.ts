/**
 * 协议处理器接口定义
 * @module protocols/interface
 */

import { TerminalSize, DecodedMessage, ProtocolType } from './types'

/**
 * WebSocket 连接选项
 */
export interface WebSocketConnectOptions {
    /** 子协议列表 */
    subprotocols?: string[]
    /** 自定义请求头 */
    headers?: Record<string, string>
    /** 其他 WebSocket 客户端选项 */
    [key: string]: unknown
}

/**
 * 会话创建结果
 */
export interface SessionCreateResult {
    /** WebSocket 连接 URL */
    wsUrl: string
    /** 会话 ID */
    sessionId: string
    /** WebSocket 连接选项（包含认证 headers） */
    wsOptions?: WebSocketConnectOptions
}

/**
 * 会话创建选项
 */
export interface SessionCreateOptions {
    /** 是否允许自签名证书（跳过证书验证） */
    allowInsecure?: boolean
}

/**
 * 协议处理器接口
 * 所有协议处理器必须实现此接口
 */
export interface ProtocolHandler {
    /**
     * 协议类型标识
     */
    readonly protocolType: ProtocolType

    /**
     * 判断该处理器是否能处理给定的 URL
     * 每个 Handler 最清楚自己能处理什么样的 URL
     * @param url WebSocket URL
     * @returns 是否能处理该 URL
     */
    canHandle(url: string): boolean

    /**
     * 创建会话
     * 某些协议（如 K8s Dashboard）需要先调用 API 创建会话，然后才能连接 WebSocket。
     * 默认实现直接返回原始 URL。
     * @param url 原始 URL
     * @param options 创建选项
     * @returns 包含 WebSocket URL 和 SessionID 的结果
     */
    createSession?(url: string, options?: SessionCreateOptions): Promise<SessionCreateResult>

    /**
     * 获取 WebSocket 连接选项
     * 包括子协议、请求头等连接参数
     * @param url WebSocket URL
     * @returns WebSocket 连接选项
     */
    getWebSocketOptions?(url: string): WebSocketConnectOptions

    /**
     * 编码用户输入数据
     * @param data 用户输入的原始数据
     * @returns 编码后可发送的消息
     */
    encodeInput(data: Buffer): string | Buffer

    /**
     * 编码终端大小调整消息
     * @param size 终端尺寸
     * @returns 编码后的 resize 消息
     */
    encodeResize(size: TerminalSize): string | Buffer

    /**
     * 编码保活消息
     * @param size 当前终端尺寸（某些协议需要）
     * @returns 编码后的保活消息
     */
    encodeKeepalive(size: TerminalSize): string | Buffer

    /**
     * 编码连接初始消息
     * 在 WebSocket 连接建立后，需要先发送此消息进行握手/认证。
     * @param size 终端尺寸
     * @returns 编码后的连接消息，或 null（如果协议不需要初始握手）
     */
    encodeConnect(size: TerminalSize): Buffer | null

    /**
     * 解码服务器消息
     * @param message 从 WebSocket 接收的原始消息
     * @returns 解码后的消息数组（一条原始消息可能产生多个输出）
     */
    decode(message: unknown): DecodedMessage[]
}
