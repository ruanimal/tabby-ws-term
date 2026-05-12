/**
 * 协议处理器接口定义
 * @module protocols/interface
 */

import { TerminalSize, DecodedMessage, ProtocolType } from './types'

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
     * 获取 WebSocket 子协议列表
     * 某些协议（如 ttyd）要求在 WebSocket 握手时指定子协议
     * @returns 子协议数组，如果不指定则返回空数组
     */
    getSubprotocols?(): string[]

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
