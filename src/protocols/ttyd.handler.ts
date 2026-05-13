/**
 * ttyd 协议处理器实现
 * @module protocols/ttyd.handler
 */

import { ProtocolHandler } from './interface'
import { TerminalSize, DecodedMessage, TTYD_PREFIX, ProtocolType, TtydConnectMessage } from './types'

/**
 * ttyd 协议处理器
 *
 * ttyd 协议使用简单的文本前缀来区分消息类型：
 * - 输入消息：'0' + 数据内容
 * - 调整大小：'1' + JSON{columns, rows}
 * - 输出消息：'0' + 数据内容
 * - 设置标题：'1' + 标题文本
 * - 设置偏好：'2' + JSON 偏好设置
 */
export class TtydHandler implements ProtocolHandler {
    readonly protocolType: ProtocolType = 'ttyd'

    /**
     * 获取 WebSocket 连接选项
     * ttyd 要求使用 'tty' 子协议
     */
    getWebSocketOptions(_url: string): import('./interface').WebSocketConnectOptions {
        return {
            subprotocols: ['tty'],
        }
    }

    /**
     * 编码连接初始消息
     * ttyd 要求在 WebSocket 连接建立后，客户端先发送一个二进制帧，
     * 内容为 JSON 格式的认证和终端尺寸信息。
     * @param size 终端尺寸
     * @param authToken 认证令牌（默认空字符串）
     * @returns 包含 JSON 的 Buffer
     */
    encodeConnect(size: TerminalSize, authToken: string = ''): Buffer {
        const msg: TtydConnectMessage = {
            AuthToken: authToken,
            columns: size.columns,
            rows: size.rows,
        }
        return Buffer.from(JSON.stringify(msg))
    }

    /**
     * 编码用户输入数据
     * @param data 用户输入的原始数据
     * @returns 编码后的消息，格式为 '0' + data
     */
    encodeInput(data: Buffer): string {
        return TTYD_PREFIX.INPUT + data.toString()
    }

    /**
     * 编码终端大小调整消息
     * @param size 终端尺寸
     * @returns 编码后的消息，格式为 '1' + JSON{columns, rows}
     */
    encodeResize(size: TerminalSize): string {
        return TTYD_PREFIX.RESIZE + JSON.stringify({
            columns: size.columns,
            rows: size.rows,
        })
    }

    /**
     * 编码保活消息
     * ttyd 协议使用 resize 消息作为保活
     * @param size 当前终端尺寸
     * @returns 编码后的保活消息
     */
    encodeKeepalive(size: TerminalSize): string {
        // ttyd 使用 resize 消息作为保活
        return this.encodeResize(size)
    }

    /**
     * 解码服务器消息
     * @param message 从 WebSocket 接收的原始消息
     * @returns 解码后的消息数组
     */
    decode(message: unknown): DecodedMessage[] {
        const text = this.dataToString(message)

        if (text.length === 0) {
            return []
        }

        const prefix = text[0]
        const payload = text.slice(1)

        switch (prefix) {
            case TTYD_PREFIX.OUTPUT:
                // '0' 前缀：终端输出
                return [{ type: 'output', data: Buffer.from(payload) }]

            case TTYD_PREFIX.SET_TITLE:
                // '1' 前缀：设置窗口标题
                return [{ type: 'title', data: payload }]

            case TTYD_PREFIX.SET_PREFERENCES:
                // '2' 前缀：设置偏好
                try {
                    const prefs = JSON.parse(payload)
                    return [{ type: 'preferences', data: prefs }]
                } catch {
                    // JSON 解析失败，忽略此消息
                    return []
                }

            default:
                // 未知前缀，忽略消息
                return []
        }
    }

    /**
     * 将 WebSocket 数据转换为字符串
     * @param data WebSocket 接收的数据
     * @returns 字符串形式的数据
     */
    private dataToString(data: unknown): string {
        if (typeof data === 'string') {
            return data
        }
        if (Buffer.isBuffer(data)) {
            return data.toString('utf8')
        }
        if (Array.isArray(data)) {
            // Buffer 数组，合并后转换
            return Buffer.concat(data).toString('utf8')
        }
        if (data instanceof ArrayBuffer) {
            return Buffer.from(data).toString('utf8')
        }
        // 其他情况（如 DataView、TypedArray），尝试转换
        if (data && typeof data === 'object' && 'buffer' in data) {
            // 可能是 TypedArray (Uint8Array 等)
            const typedArray = data as Uint8Array
            if (typedArray.buffer instanceof ArrayBuffer) {
                return Buffer.from(typedArray.buffer).toString('utf8')
            }
        }
        return ''
    }
}
