/**
 * K8s Dashboard 协议处理器实现
 * @module protocols/k8s-dashboard.handler
 */

import { ProtocolHandler, WebSocketConnectOptions } from './interface'
import { TerminalSize, DecodedMessage, K8S_DASHBOARD_OP, ProtocolType } from './types'

/**
 * K8s Dashboard 协议处理器
 *
 * 用于处理 Kubernetes Dashboard WebSocket 终端协议。
 * 该协议基于 SockJS，具有以下特点：
 * - 连接打开消息：单字符 "o"
 * - 心跳消息：单字符 "h"，每 25 秒发送一次
 * - 数据消息：以 "a" 前缀开头，后跟 JSON 数组
 * - 需要发送 bind 消息进行会话绑定
 */
export class K8sDashboardHandler implements ProtocolHandler {
    readonly protocolType: ProtocolType = 'k8s-dashboard'

    /**
     * 从 URL 提取的会话 ID
     */
    private sessionId: string

    /**
     * 当前终端尺寸，用于编码 stdin 消息
     */
    private terminalSize: TerminalSize

    /**
     * 是否已收到连接打开消息（"o" 消息）
     * K8s Dashboard 协议需要等待 "o" 消息后才能发送 bind
     */
    private hasReceivedOpenMessage = false

    /**
     * 待发送的 bind 消息（在收到 "o" 消息后发送）
     */
    private pendingBindMessage: Buffer | null = null

    /**
     * 构造函数
     * @param wsUrl WebSocket URL，用于提取 SessionID
     */
    constructor(wsUrl?: string) {
        this.sessionId = wsUrl ? this.extractSessionId(wsUrl) : ''
        this.terminalSize = { columns: 80, rows: 24 }
    }

    /**
     * 判断是否能处理给定的 URL
     * K8s Dashboard URL 的特征：
     * 1. URL 路径包含 "/api/sockjs/" 或 "/sockjs/"
     * 2. URL 查询参数名称匹配 32 位十六进制格式
     *
     * @param url WebSocket URL
     * @returns 是否为 K8s Dashboard 协议的 URL
     */
    canHandle(url: string): boolean {
        try {
            const parsedUrl = new URL(url)

            // 规则 1: 检查路径是否包含 "/api/sockjs/" 或 "/sockjs/"
            const path = parsedUrl.pathname
            if (path.includes('/api/sockjs/') || path.includes('/sockjs/')) {
                return true
            }

            // 规则 2: 检查查询参数名称是否匹配 32 位十六进制格式
            // SessionID 作为查询参数名出现，如 ?<session_id>=xxx
            // 而不是作为查询参数值
            const searchParams = parsedUrl.searchParams
            const paramNames = Array.from(searchParams.keys())
            for (const paramName of paramNames) {
                if (/^[a-f0-9]{32}$/.test(paramName)) {
                    return true
                }
            }

            return false
        } catch {
            // URL 解析失败，返回 false
            return false
        }
    }

    /**
     * 获取 WebSocket 连接选项
     * 从 URL 查询参数提取认证信息（jweToken、username、authMode），
     * 组合成 Cookie 请求头。
     *
     * @param url WebSocket URL
     * @returns WebSocket 连接选项，包含 Cookie 和 Origin 头
     */
    getWebSocketOptions(url: string): WebSocketConnectOptions {
        const urlObj = new URL(url)
        const params = urlObj.searchParams

        // 提取认证参数
        const jweToken = params.get('jweToken')
        const username = params.get('username')
        const authMode = params.get('authMode')

        // 构建 Cookie 数组（按照固定顺序：authMode、username、jweToken）
        const cookieParts: string[] = []
        if (authMode) {
            cookieParts.push(`authMode=${authMode}`)
        }
        if (username) {
            cookieParts.push(`username=${username}`)
        }
        if (jweToken) {
            cookieParts.push(`jweToken=${jweToken}`)
        }

        // 构建 Origin 头（从 URL 提取协议和主机）
        const origin = urlObj.origin

        // 构建返回对象
        const headers: Record<string, string> = {
            Origin: origin,
        }

        // 只有当存在认证参数时才添加 Cookie 头
        if (cookieParts.length > 0) {
            headers.Cookie = cookieParts.join('; ')
        }

        return { headers }
    }

    /**
     * 编码连接初始消息
     * 返回 bind 消息，用于会话绑定。
     *
     * @param size 终端尺寸
     * @returns 包含 bind 消息的 Buffer
     */
    encodeConnect(_size: TerminalSize): Buffer | null {
        const msg = {
            Op: K8S_DASHBOARD_OP.BIND,
            SessionID: this.sessionId,
        }
        return Buffer.from(JSON.stringify([JSON.stringify(msg)]))
    }

    /**
     * 编码用户输入数据
     * 生成 `["{\"Op\":\"stdin\",\"Data\":\"...\",\"Cols\":N,\"Rows\":N}"]` 格式的消息
     *
     * @param data 用户输入的原始数据
     * @returns 编码后的消息
     */
    encodeInput(data: Buffer): string {
        return this.encodeMessage(K8S_DASHBOARD_OP.STDIN, data.toString(), this.terminalSize)
    }

    /**
     * 编码终端大小调整消息
     * 生成 `["{\"Op\":\"resize\",\"Cols\":N,\"Rows\":N}"]` 格式的消息
     *
     * @param size 终端尺寸
     * @returns 编码后的消息
     */
    encodeResize(size: TerminalSize): string {
        // 更新内部终端尺寸状态
        this.terminalSize = size
        return this.encodeMessage(K8S_DASHBOARD_OP.RESIZE, undefined, size)
    }

    /**
     * 编码保活消息
     * K8s Dashboard 协议使用 resize 消息作为保活
     *
     * @param size 当前终端尺寸
     * @returns 编码后的保活消息
     */
    encodeKeepalive(size: TerminalSize): string | Buffer {
        return this.encodeResize(size)
    }

    /**
     * 解码服务器消息
     *
     * @param message 从 WebSocket 接收的原始消息
     * @returns 解码后的消息数组
     */
    decode(message: unknown): DecodedMessage[] {
        const text = this.dataToString(message)

        try {
            // 处理连接打开消息
            if (text === 'o') {
                return [{ type: 'open' }]
            }

            // 处理心跳消息
            if (text === 'h') {
                return []
            }

            // 处理数据消息（以 "a" 开头）
            if (text.startsWith('a')) {
                const jsonPart = text.slice(1)

                // 解析外层 JSON 数组
                let outerArray: unknown
                try {
                    outerArray = JSON.parse(jsonPart)
                } catch {
                    // JSON 解析失败，返回空数组
                    return []
                }

                // 验证是否为数组且非空
                if (!Array.isArray(outerArray) || outerArray.length === 0) {
                    return []
                }

                // 提取数组第一个元素
                const innerJson = outerArray[0]
                if (typeof innerJson !== 'string') {
                    return []
                }

                // 解析内部 JSON
                let innerObj: { Op?: string; Data?: string }
                try {
                    innerObj = JSON.parse(innerJson)
                } catch {
                    // 内部 JSON 解析失败，降级处理：将原始内容作为终端输出
                    return [{ type: 'output', data: Buffer.from(innerJson) }]
                }

                // 检查 Op 字段
                if (!innerObj.Op) {
                    return []
                }

                // 根据 Op 类型处理
                switch (innerObj.Op) {
                    case K8S_DASHBOARD_OP.STDOUT:
                        if (innerObj.Data !== undefined && innerObj.Data !== null) {
                            return [{ type: 'output', data: Buffer.from(innerObj.Data) }]
                        }
                        return []

                    case K8S_DASHBOARD_OP.TOAST:
                        if (innerObj.Data !== undefined && innerObj.Data !== null) {
                            return [{ type: 'toast', data: innerObj.Data }]
                        }
                        return []

                    default:
                        // 未知 Op 类型，忽略
                        return []
                }
            }

            // 其他消息格式，返回空数组
            return []
        } catch {
            // 异常情况返回空数组
            return []
        }
    }

    /**
     * 从 URL 查询参数名称中提取 SessionID
     * SessionID 是一个 32 位十六进制字符串。
     *
     * @param url WebSocket URL
     * @returns 32 位十六进制 SessionID，如果不存在则返回空字符串
     */
    private extractSessionId(url: string): string {
        try {
            const urlObj = new URL(url)
            // 遍历查询参数名称，查找 32 位十六进制格式的参数名
            const paramNames = Array.from(urlObj.searchParams.keys())
            for (const paramName of paramNames) {
                if (/^[a-f0-9]{32}$/.test(paramName)) {
                    return paramName
                }
            }
        } catch {
            // URL 解析失败，返回空字符串
        }
        return ''
    }

    /**
     * 通用消息编码方法
     * 生成 JSON 数组包装的 JSON 字符串
     *
     * @param op 操作类型
     * @param data 可选的数据内容
     * @param size 可选的终端尺寸
     * @returns JSON 数组包装的 JSON 字符串
     */
    private encodeMessage(op: string, data?: string, size?: TerminalSize): string {
        const msg: Record<string, unknown> = { Op: op }

        if (data !== undefined) {
            msg.Data = data
        }

        if (size !== undefined) {
            msg.Cols = size.columns
            msg.Rows = size.rows
        }

        return JSON.stringify([JSON.stringify(msg)])
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
