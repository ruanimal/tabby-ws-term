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
 * prepareConnection 选项
 */
export interface PrepareConnectionOptions {
    /** 是否允许自签名证书（跳过证书验证） */
    allowInsecure?: boolean
}

/**
 * prepareConnection 结果
 */
export interface PrepareConnectionResult {
    /** 最终 WebSocket 连接 URL */
    wsUrl: string
    /** WebSocket 连接选项（子协议、请求头等） */
    wsOptions: WebSocketConnectOptions
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
     * 准备连接
     * 负责在建立 WebSocket 前的所有准备工作：
     * 某些协议（如 K8s Dashboard）需要先调用 HTTP API 创建会话；
     * 某些协议（如 ttyd）需要指定子协议；
     * 默认实现直接返回原始 URL 和空选项。
     */
    async prepareConnection(url: string, _options?: PrepareConnectionOptions): Promise<PrepareConnectionResult> {
        return { wsUrl: url, wsOptions: {} }
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
