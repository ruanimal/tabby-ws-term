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
     * 解码服务器消息
     * @param message 从 WebSocket 接收的原始消息
     * @returns 解码后的消息数组（一条原始消息可能产生多个输出）
     */
    decode(message: unknown): DecodedMessage[]
}
