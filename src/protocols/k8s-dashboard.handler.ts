/**
 * K8s Dashboard 协议处理器实现
 * @module protocols/k8s-dashboard.handler
 */

import { ProtocolHandler, WebSocketConnectOptions, SessionCreateResult, SessionCreateOptions } from './interface'
import { TerminalSize, DecodedMessage, K8S_DASHBOARD_OP, ProtocolType } from './types'

/**
 * K8s Dashboard URL 中的 pod 信息
 */
interface PodInfo {
    namespace: string
    pod: string
    container?: string
    shell?: string
}

/**
 * K8s Dashboard 协议处理器
 *
 * 用于处理 Kubernetes Dashboard WebSocket 终端协议。
 * 该协议基于 SockJS，具有以下特点：
 * - 连接打开消息：单字符 "o"
 * - 心跳消息：单字符 "h"，每 25 秒发送一次
 * - 数据消息：以 "a" 前缀开头，后跟 JSON 数组
 * - 需要发送 bind 消息进行会话绑定
 *
 * 使用方式：URL 中需要包含 pod 和 namespace 参数，例如：
 * wss://dashboard.example.com?pod=my-pod&namespace=default&container=main&shell=bash
 */
export class K8sDashboardHandler extends ProtocolHandler {
    readonly protocolType: ProtocolType = 'k8s-dashboard'

    /**
     * 会话 ID（通过 createSession 方法创建后设置）
     */
    private sessionId = ''

    /**
     * 当前终端尺寸，用于编码 stdin 消息
     */
    private terminalSize: TerminalSize

    constructor() {
        super()
        this.terminalSize = { columns: 80, rows: 24 }
    }

    /**
     * 创建 exec session
     * 调用 K8s Dashboard API 创建 exec session，获取 SessionID
     *
     * @param url 原始 URL（包含 pod 信息）
     * @param options 创建选项
     * @returns 包含 WebSocket URL 和 SessionID 的结果
     */
    async createSession(url: string, options?: SessionCreateOptions): Promise<SessionCreateResult> {
        // 从 URL 中提取 pod 信息
        const podInfo = this.extractPodInfo(url)
        if (!podInfo) {
            throw new Error('无法从 URL 中提取 pod 信息，请确保 URL 包含 pod 和 namespace 参数')
        }

        // 构建 Dashboard API URL
        const urlObj = new URL(url)
        // 将 WebSocket 协议转换为 HTTP 协议
        const httpProtocol = urlObj.protocol === 'wss:' ? 'https:' : 'http:'
        const baseUrl = `${httpProtocol}//${urlObj.host}`
        const containerPath = podInfo.container ? `/${podInfo.container}` : ''
        let apiUrl = `${baseUrl}/api/v1/pod/${podInfo.namespace}/${podInfo.pod}/shell${containerPath}`

        // 添加 shell 参数
        if (podInfo.shell) {
            apiUrl += `?shell=${encodeURIComponent(podInfo.shell)}`
        }

        console.log('[ws-term] createSession apiUrl:', apiUrl)
        console.log('[ws-term] createSession podInfo:', podInfo)

        // 调用 Dashboard API 创建 exec session
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }

        // 从 URL 中提取认证信息
        const jweToken = urlObj.searchParams.get('jweToken')
        const username = urlObj.searchParams.get('username')
        const authMode = urlObj.searchParams.get('authMode')

        // HTTP API 使用 Authorization 头认证
        if (jweToken) {
            headers['Authorization'] = `Bearer ${jweToken}`
        }

        // 同时设置 Cookie（某些版本可能需要）
        const cookieParts: string[] = []
        if (authMode) {
            cookieParts.push(`authMode=${authMode}`)
        }
        if (username) {
            cookieParts.push(`username=${username}`)
        }
        if (jweToken) {
            cookieParts.push(`jweToken=${encodeURIComponent(jweToken)}`)
        }
        if (cookieParts.length > 0) {
            headers.Cookie = cookieParts.join('; ')
        }

        console.log('[ws-term] createSession headers:', headers)

        // 发送请求创建 exec session
        const response = await this.httpGet(apiUrl, headers, options?.allowInsecure)

        console.log('[ws-term] createSession response status:', response.status)

        if (!response.ok) {
            throw new Error(`创建 exec session 失败: ${response.status} ${response.statusText}`)
        }

        const data = await response.json() as { id: string }
        if (!data.id) {
            throw new Error('创建 exec session 失败: 响应中没有 session ID')
        }

        // 更新 sessionId
        this.sessionId = data.id

        // 构建包含 SessionID 的 WebSocket URL
        // 根据 HAR 文件分析，WebSocket URL 格式为：
        // wss://host/api/sockjs/{server_id}/{session_id}/websocket?{session_id}
        // 认证信息通过 Cookie 头传递，不在 URL 中

        // 生成随机的 SockJS server_id 和 session_id
        const serverId = Math.floor(Math.random() * 1000).toString()
        const sessionIdShort = Math.random().toString(36).substring(2, 11)

        // 构建完整的 WebSocket URL（只包含 SessionID）
        const protocol = urlObj.protocol
        const host = urlObj.host
        const wsUrl = `${protocol}//${host}/api/sockjs/${serverId}/${sessionIdShort}/websocket?${data.id}`

        // 构建 WebSocket 连接选项（包含认证 headers）
        const origin = `${protocol === 'wss:' ? 'https' : 'http'}://${host}`
        const wsOptions: WebSocketConnectOptions = {
            headers: {
                Origin: origin,
                ...(headers.Cookie ? { Cookie: headers.Cookie } : {}),
            },
        }

        console.log('[ws-term] createSession result wsUrl:', wsUrl)

        return {
            wsUrl,
            sessionId: data.id,
            wsOptions,
        }
    }

    /**
     * 发送 HTTP GET 请求
     * 当 allowInsecure 为 true 时，跳过证书验证
     *
     * @param url 请求 URL
     * @param headers 请求头
     * @param allowInsecure 是否允许自签名证书
     * @returns Response 对象
     */
    private async httpGet(url: string, headers: Record<string, string>, allowInsecure?: boolean): Promise<Response> {
        if (!allowInsecure) {
            return fetch(url, { method: 'GET', headers })
        }

        // 使用 Node.js https 模块，跳过证书验证
        const https = await import('node:https')
        const { URL: URLParser } = await import('node:url')

        return new Promise((resolve, reject) => {
            const parsedUrl = new URLParser(url)
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers,
                rejectUnauthorized: false,
            }

            const req = https.request(options, (res) => {
                const chunks: Buffer[] = []
                res.on('data', (chunk: Buffer) => chunks.push(chunk))
                res.on('end', () => {
                    const body = Buffer.concat(chunks).toString()
                    const response = new Response(body, {
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        headers: Object.fromEntries(
                            Object.entries(res.headers).filter(([, v]) => v !== undefined).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v!])
                        ),
                    })
                    resolve(response)
                })
            })

            req.on('error', reject)
            req.end()
        })
    }

    /**
     * 从 URL 中提取 pod 信息
     *
     * @param url URL 字符串
     * @returns pod 信息，如果提取失败则返回 null
     */
    private extractPodInfo(url: string): PodInfo | null {
        try {
            const urlObj = new URL(url)
            const params = urlObj.searchParams

            const pod = params.get('pod')
            const namespace = params.get('namespace') || params.get('ns')

            if (!pod || !namespace) {
                return null
            }

            return {
                pod,
                namespace,
                container: params.get('container') || undefined,
                shell: params.get('shell') || undefined,
            }
        } catch {
            return null
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
            cookieParts.push(`jweToken=${encodeURIComponent(jweToken)}`)
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

        console.log('[ws-term] getWebSocketOptions headers:', headers)

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

}
