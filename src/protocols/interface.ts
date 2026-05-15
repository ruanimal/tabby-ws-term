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
 * 协议处理器抽象基类
 * 提供通用默认实现，子类只需实现各自独有的逻辑
 */
export abstract class ProtocolHandler {
    /**
     * 协议类型标识
     */
    abstract readonly protocolType: ProtocolType

    /**
     * 创建会话（可选）
     * 某些协议（如 K8s Dashboard）需要先调用 API 创建会话，然后才能连接 WebSocket。
     */
    createSession?(url: string, options?: SessionCreateOptions): Promise<SessionCreateResult>

    /**
     * 获取 WebSocket 连接选项
     * 默认返回空对象，子类可覆盖以提供子协议、请求头等参数
     */
    getWebSocketOptions(_url: string): WebSocketConnectOptions {
        return {}
    }

    /**
     * 编码连接初始消息
     * 默认返回 null（不需要初始握手），子类可覆盖
     */
    encodeConnect(_size: TerminalSize): Buffer | null {
        return null
    }

    /**
     * 编码保活消息
     * 默认使用 resize 消息作为保活
     */
    encodeKeepalive(size: TerminalSize): string | Buffer {
        return this.encodeResize(size)
    }

    /**
     * 编码用户输入数据
     */
    abstract encodeInput(data: Buffer): string | Buffer

    /**
     * 编码终端大小调整消息
     */
    abstract encodeResize(size: TerminalSize): string | Buffer

    /**
     * 解码服务器消息
     */
    abstract decode(message: unknown): DecodedMessage[]

    /**
     * 将各种格式的 WebSocket 数据转换为字符串
     */
    protected dataToString(data: unknown): string {
        if (typeof data === 'string') {
            return data
        }
        if (Buffer.isBuffer(data)) {
            return data.toString()
        }
        if (ArrayBuffer.isView(data) && !(data instanceof DataView)) {
            return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString()
        }
        if (data instanceof ArrayBuffer) {
            return Buffer.from(data).toString()
        }
        if (Array.isArray(data)) {
            return Buffer.concat(data).toString()
        }
        return String(data)
    }
}
