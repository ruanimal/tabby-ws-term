/**
 * kube-exec 协议处理器实现
 * @module protocols/kube-exec.handler
 */

import { ProtocolHandler } from './interface'
import { TerminalSize, DecodedMessage, KUBE_EXEC_OP, ProtocolType } from './types'

/**
 * kube-exec 协议消息格式
 */
interface KubeExecMessage {
    Op: string
    Data?: string
    Rows?: number
    Cols?: number
}

/**
 * kube-exec 协议处理器
 *
 * 用于处理 Kubernetes exec 协议的 WebSocket 消息格式。
 * 消息格式为 JSON，包含 Op 字段标识操作类型。
 * 
 * kube-exec 是默认协议，当其他协议都不能识别时使用此协议。
 */
export class KubeExecHandler implements ProtocolHandler {
    readonly protocolType: ProtocolType = 'kube-exec'

    /**
     * 判断是否能处理给定的 URL
     * kube-exec 是默认协议，总是返回 true
     * 
     * @param _url WebSocket URL（未使用）
     * @returns 总是返回 true
     */
    canHandle(_url: string): boolean {
        // kube-exec 是默认协议，可以处理任何 URL
        return true
    }

    /**
     * 编码连接初始消息
     * kube-exec 协议不需要初始握手
     * @returns null
     */
    encodeConnect(_size: TerminalSize): Buffer | null {
        return null
    }

    /**
     * 编码用户输入数据
     * 生成 `{"Op":"stdin","Data":"..."}` 格式的 JSON 消息
     *
     * @param data 用户输入的原始数据
     * @returns 编码后的 JSON 字符串
     */
    encodeInput(data: Buffer): string {
        const msg: KubeExecMessage = {
            Op: KUBE_EXEC_OP.STDIN,
            Data: data.toString(),
        }
        return JSON.stringify(msg)
    }

    /**
     * 编码终端大小调整消息
     * 生成 `{"Op":"resize","Cols":N,"Rows":N}` 格式的 JSON 消息
     *
     * @param size 终端尺寸
     * @returns 编码后的 JSON 字符串
     */
    encodeResize(size: TerminalSize): string {
        const msg: KubeExecMessage = {
            Op: KUBE_EXEC_OP.RESIZE,
            Cols: size.columns,
            Rows: size.rows,
        }
        return JSON.stringify(msg)
    }

    /**
     * 编码保活消息
     * kube-exec 协议使用 resize 消息作为保活
     *
     * @param size 当前终端尺寸
     * @returns 编码后的保活消息
     */
    encodeKeepalive(size: TerminalSize): string {
        return this.encodeResize(size)
    }

    /**
     * 解码服务器消息
     * 解析 stdout 和 toast 消息，处理非 JSON 消息降级
     *
     * @param message 从 WebSocket 接收的原始消息
     * @returns 解码后的消息数组
     */
    decode(message: unknown): DecodedMessage[] {
        const text = this.dataToString(message)
        const results: DecodedMessage[] = []

        try {
            const msg: KubeExecMessage = JSON.parse(text)

            switch (msg.Op) {
                case KUBE_EXEC_OP.STDOUT:
                    if (msg.Data !== undefined) {
                        results.push({ type: 'output', data: Buffer.from(msg.Data) })
                    }
                    break
                case KUBE_EXEC_OP.TOAST:
                    if (msg.Data !== undefined) {
                        results.push({ type: 'toast', data: msg.Data })
                    }
                    break
                default:
                    // 忽略其他操作类型
                    break
            }
        } catch {
            // 非 JSON 消息，作为原始输出处理（降级处理）
            results.push({ type: 'output', data: Buffer.from(text) })
        }

        return results
    }

    /**
     * 将各种格式的 WebSocket 数据转换为字符串
     *
     * @param data WebSocket 数据
     * @returns 字符串形式的数据
     */
    private dataToString(data: unknown): string {
        if (typeof data === 'string') {
            return data
        }
        if (Buffer.isBuffer(data)) {
            return data.toString()
        }
        if (ArrayBuffer.isView(data) && !(data instanceof DataView)) {
            // 处理 Uint8Array 等 ArrayBufferView 类型
            return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString()
        }
        if (data instanceof ArrayBuffer) {
            return Buffer.from(data).toString()
        }
        if (Array.isArray(data)) {
            // 处理 Buffer 数组
            return Buffer.concat(data).toString()
        }
        // 其他情况，尝试转换为字符串
        return String(data)
    }
}
