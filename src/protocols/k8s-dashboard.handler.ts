/**
 * K8s Dashboard 协议处理器实现
 * @module protocols/k8s-dashboard.handler
 */

import { ProtocolHandler, WebSocketConnectOptions, PrepareConnectionOptions, PrepareConnectionResult } from './interface'
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
     * 准备连接
     * 调用 K8s Dashboard HTTP API 创建 exec session，
     * 并基于原始 URL 的认证参数构建 WebSocket 连接选项。
     */
    override async prepareConnection(url: string, options?: PrepareConnectionOptions): Promise<PrepareConnectionResult> {
        // 从 URL 中提取 pod 信息
        const podInfo = this.extractPodInfo(url)
        if (!podInfo) {
            throw new Error('无法从 URL 中提取 pod 信息，请确保 URL 包含 pod 和 namespace 参数')
        }

        // 构建 Dashboard API URL
        const urlObj = new URL(url)
        const httpProtocol = urlObj.protocol === 'wss:' ? 'https:' : 'http:'
        const baseUrl = `${httpProtocol}//${urlObj.host}`
        const containerPath = podInfo.container ? `/${podInfo.container}` : ''
        let apiUrl = `${baseUrl}/api/v1/pod/${podInfo.namespace}/${podInfo.pod}/shell${containerPath}`
        if (podInfo.shell) {
            apiUrl += `?shell=${encodeURIComponent(podInfo.shell)}`
        }

        // 构建 HTTP 请求头（含认证信息）
        // 认证通过 Cookie 传递，Dashboard 网关会从 Cookie 中解密 jweToken 并设置 Authorization 头
        const httpHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
        const authCookie = this.buildAuthCookie(url)
        if (authCookie) {
            httpHeaders.Cookie = authCookie
        }

        // Dashboard 前端的 HTTP 拦截器会从 cookie 读取 jweToken 并设置 jwetoken 请求头
        // API 模块通过 jwetoken 头（而非 Cookie）进行认证
        const jweTokenRaw = this.extractJweToken(url)
        if (jweTokenRaw) {
            httpHeaders.jwetoken = jweTokenRaw
        }

        console.log('[ws-term] prepareConnection apiUrl:', apiUrl)
        console.log('[ws-term] prepareConnection httpHeaders:', httpHeaders)

        // 调用 API 创建 exec session
        const response = await this.httpGet(apiUrl, httpHeaders, options?.allowInsecure)
        if (!response.ok) {
            throw new Error(`创建 exec session 失败: ${response.status} ${response.statusText}`)
        }
        const data = await response.json() as { id: string }
        if (!data.id) {
            throw new Error('创建 exec session 失败: 响应中没有 session ID')
        }

        this.sessionId = data.id
        console.log('[ws-term] prepareConnection session created:', data.id)

        // 构建 SockJS WebSocket URL
        const serverId = Math.floor(Math.random() * 1000).toString()
        const sessionIdShort = Math.random().toString(36).substring(2, 11)
        const wsUrl = `${urlObj.protocol}//${urlObj.host}/api/sockjs/${serverId}/${sessionIdShort}/websocket?${data.id}`

        console.log('[ws-term] prepareConnection wsUrl:', wsUrl)

        // WebSocket 连接不需要认证信息，session ID（在 query string 中）就是凭据
        // Dashboard 的 handleTerminalSession 仅通过 bind 消息的 SessionID 匹配
        // 如果 WebSocket 带了 Cookie，网关可能尝试验证反而干扰连接
        const wsOptions = this.getWebSocketOptions(url)

        return { wsUrl, wsOptions }
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
     * 从 URL 查询参数提取原始 jweToken（未编码）
     * 用于设置 jwetoken 请求头，Dashboard API 模块通过此头认证。
     *
     * @param url URL 字符串
     * @returns 原始 jweToken 字符串，无则返回 null
     */
    private extractJweToken(url: string): string | null {
        const urlObj = new URL(url)
        return urlObj.searchParams.get('jweToken')
    }

    /**
     * 构建认证 Cookie
     * 从 URL 查询参数提取认证信息，组合成 Cookie 字符串。
     * 仅用于 HTTP API 请求（创建 exec session），不用于 WebSocket 连接。
     *
     * @param url URL 字符串
     * @returns Cookie 字符串，无认证参数时返回 null
     */
    private buildAuthCookie(url: string): string | null {
        const urlObj = new URL(url)
        const params = urlObj.searchParams

        const jweToken = params.get('jweToken')
        const username = params.get('username')
        const authMode = params.get('authMode')

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

        return cookieParts.length > 0 ? cookieParts.join('; ') : null
    }

    /**
     * 获取 WebSocket 连接选项
     * WebSocket 连接不需要认证信息，session ID 就是凭据。
     * 仅设置 Origin 头。
     *
     * @param url WebSocket URL
     * @returns WebSocket 连接选项
     */
    getWebSocketOptions(url: string): WebSocketConnectOptions {
        const urlObj = new URL(url)

        const headers: Record<string, string> = {
            Origin: urlObj.origin,
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

            // 处理 SockJS close 帧: c[code,"reason"]
            if (text.startsWith('c')) {
                try {
                    const payload = JSON.parse(text.slice(1)) as [number, string]
                    if (Array.isArray(payload) && payload.length >= 2) {
                        return [{ type: 'toast', data: `Server closed: [${payload[0]}] ${payload[1]}` }]
                    }
                } catch {
                    // 解析失败，降级处理
                }
                return [{ type: 'toast', data: `Server closed: ${text}` }]
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

                // 遍历数组中所有消息（SockJS 允许批量发送）
                const results: DecodedMessage[] = []
                for (const innerJson of outerArray) {
                    if (typeof innerJson !== 'string') {
                        continue
                    }

                    // 解析内部 JSON
                    let innerObj: { Op?: string; Data?: string }
                    try {
                        innerObj = JSON.parse(innerJson)
                    } catch {
                        // 内部 JSON 解析失败，降级处理：将原始内容作为终端输出
                        results.push({ type: 'output', data: Buffer.from(innerJson) })
                        continue
                    }

                    // 检查 Op 字段
                    if (!innerObj.Op) {
                        continue
                    }

                    // 根据 Op 类型处理
                    switch (innerObj.Op) {
                        case K8S_DASHBOARD_OP.STDOUT:
                            if (innerObj.Data !== undefined && innerObj.Data !== null) {
                                results.push({ type: 'output', data: Buffer.from(innerObj.Data) })
                            }
                            break

                        case K8S_DASHBOARD_OP.TOAST:
                            if (innerObj.Data !== undefined && innerObj.Data !== null) {
                                results.push({ type: 'toast', data: innerObj.Data })
                            }
                            break

                        default:
                            // 未知 Op 类型，忽略
                            break
                    }
                }

                return results
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
