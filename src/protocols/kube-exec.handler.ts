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
 */
export class KubeExecHandler extends ProtocolHandler {
    readonly protocolType: ProtocolType = 'kube-exec'

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

}
