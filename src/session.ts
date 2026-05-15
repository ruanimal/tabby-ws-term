import { Logger } from 'tabby-core'
import { BaseSession } from 'tabby-terminal'
import { Subject, Observable } from 'rxjs'
import WebSocket from 'ws'

import { WSTermProfile } from './profiles'
import { ProtocolHandler, createProtocolHandler, normalizeProtocolType, TerminalSize, DecodedMessage, WebSocketConnectOptions } from './protocols'


export class WSTermSession extends BaseSession {
    get serviceMessage$(): Observable<string> { return this.serviceMessage }

    private serviceMessage = new Subject<string>()
    private socket: WebSocket | null = null
    private lastWidth = 0
    private lastHeight = 0
    public lastCloseCode: number | null = null
    public lastError: Error | null = null
    private keepaliveTimer: NodeJS.Timeout | null = null
    private protocolHandler: ProtocolHandler
    private isDestroyed = false
    /**
     * 是否已收到连接打开消息（用于 K8s Dashboard 协议）
     * K8s Dashboard 协议需要等待 "o" 消息后才能发送 bind 和 resize
     */
    private receivedOpenMessage = false

    constructor(
        logger: Logger,
        public profile: WSTermProfile,
    ) {
        super(logger)

        const protocolType = normalizeProtocolType(profile.options.protocol)
        this.protocolHandler = createProtocolHandler(protocolType)
        logger.info(`Using protocol type: ${protocolType}`)
    }

    async start(): Promise<void> {
        let wsUrl: string
        let wsOptions: WebSocketConnectOptions

        try {
            const result = await this.protocolHandler.prepareConnection(
                this.profile.options.wsUrl,
                { allowInsecure: this.profile.options.allowInsecure },
            )
            wsUrl = result.wsUrl
            wsOptions = result.wsOptions
        } catch (e: any) {
            this.emitServiceMessage(`Failed to prepare connection: ${e.message}`)
            throw new Error(`Failed to prepare connection: ${e.message}`)
        }

        this.emitServiceMessage(`Connecting to ${wsUrl}`)

        return new Promise((resolve, reject) => {
            try {
                // Get WebSocket options from protocol handler (includes auth headers, subprotocols, etc.)
                const defaultHeaders: Record<string, string> = {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                }

                // If protocol handler didn't set Origin, set a default one
                if (!wsOptions.headers?.Origin) {
                    const parsedUrl = new URL(wsUrl)
                    // Convert ws:// to http:// and wss:// to https://
                    const protocol = parsedUrl.protocol === 'wss:' ? 'https' : 'http'
                    defaultHeaders.Origin = `${protocol}://${parsedUrl.host}`
                }

                // Create WebSocket with custom headers for better compatibility
                this.logger.info(`Connecting to WebSocket: ${wsUrl}`)
                this.socket = new WebSocket(wsUrl, wsOptions.subprotocols ?? [], {
                    headers: {
                        ...defaultHeaders,
                        ...wsOptions.headers,
                    },
                    rejectUnauthorized: !this.profile.options.allowInsecure,
                })

                this.socket.on('open', () => {
                    this.debugLog('!!', 'open')
                    this.emitServiceMessage('Connected')
                    this.open = true

                    // 对于 K8s Dashboard 协议（基于 SockJS），需要等待 "o" 消息后才能发送任何数据
                    // 其他协议在连接建立后立即发送初始化消息
                    if (this.protocolHandler.protocolType !== 'k8s-dashboard') {
                        this.receivedOpenMessage = true
                        this.sendInitialMessages()
                    }

                    // Start keepalive mechanism
                    this.startKeepalive()

                    resolve()
                })

                this.socket.on('message', (data: WebSocket.Data) => {
                    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data as string)
                    this.debugLog('<<', 'message', raw)
                    this.handleMessage(data)
                })

                this.socket.on('error', (err: Error) => {
                    this.debugLog('!!', 'error', err.message)
                    this.lastError = err
                    this.emitServiceMessage(`WebSocket error: ${err.message}`)
                    reject(new Error('WebSocket connection failed: ' + err.message))
                })

                this.socket.on('close', (code: number) => {
                    this.debugLog('!!', 'close', `code=${code}`)
                    this.lastCloseCode = code
                    if (!this.isDestroyed) {
                        this.emitServiceMessage(`Connection closed (code: ${code})`)
                        this.destroy()
                    }
                })
            } catch (e: any) {
                this.emitServiceMessage(`Failed to connect: ${e.message}`)
                reject(e)
            }
        })
    }

    /**
     * 处理接收到的 WebSocket 消息
     * 使用协议处理器解码消息
     */
    private handleMessage(data: WebSocket.Data): void {
        const decodedMessages = this.protocolHandler.decode(data)

        for (const msg of decodedMessages) {
            this.processDecodedMessage(msg)
        }
    }

    /**
     * 处理解码后的消息
     */
    private processDecodedMessage(msg: DecodedMessage): void {
        // NOTE: 如果 session 已销毁，忽略消息
        if (this.isDestroyed) {
            return
        }

        switch (msg.type) {
            case 'open':
                // K8s Dashboard 协议的连接打开消息
                // 收到 "o" 消息后，发送初始化消息（bind 和 resize）
                if (!this.receivedOpenMessage) {
                    this.receivedOpenMessage = true
                    this.debugLog('<<', 'open', 'sending initial messages')
                    this.sendInitialMessages()
                }
                break
            case 'output':
                this.emitOutput(msg.data)
                break
            case 'title':
                // 设置窗口标题（未来可实现）
                this.debugLog('<<', 'title', msg.data)
                break
            case 'toast':
                // Toast 消息作为服务消息显示
                this.emitServiceMessage(msg.data)
                break
            case 'preferences':
                // 处理偏好设置（未来可实现）
                this.debugLog('<<', 'preferences', msg.data)
                break
        }
    }

    /**
     * 发送初始化消息
     * 在连接建立后（或收到 "o" 消息后）发送 bind 和 resize 消息
     */
    private sendInitialMessages(): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.debugLog('!!', 'init', 'skipping - socket not open')
            return
        }

        // Send protocol-specific connect/init message (e.g. ttyd auth handshake, k8s-dashboard bind)
        const connectMsg = this.protocolHandler.encodeConnect(
            { columns: 80, rows: 24 },
        )
        if (connectMsg) {
            this.debugLog('>>', 'connect', connectMsg)
            this.socket.send(connectMsg)
        }

        // Send initial resize
        if (this.lastWidth && this.lastHeight) {
            this.resize(this.lastWidth, this.lastHeight)
        }

        // Clear terminal immediately to hide internal connection messages
        this.emitOutput(Buffer.from('\x1b[2J\x1b[H'))

        // Execute startup command if specified
        if (this.profile.options.shell) {
            this.emitServiceMessage(`Executing startup command: ${this.profile.options.shell}`)
            this.sendToWebSocket(Buffer.from(this.profile.options.shell + '\r'))
            // Use Ctrl+L to force a remote redraw after the shell has started
            // This ensures that any echoes from the startup command are wiped
            // and the shell redraws its prompt on a clean screen.
            setTimeout(() => {
                this.sendToWebSocket(Buffer.from('\x0c'))
            }, 200)
        }
    }

    private debugLog(direction: '<<' | '>>' | '!!', event: string, payload?: unknown): void {
        if (!process.env.WSTERM_DEBUG) {
            return
        }
        const prefix = `[WS-DEBUG] ${direction} ${event}`
        if (payload === undefined) {
            this.logger.debug(prefix)
        } else if (Buffer.isBuffer(payload)) {
            // 只有 ttyd 协议才转换为 hex 格式
            if (this.protocolHandler.protocolType === 'ttyd') {
                this.logger.debug(`${prefix} (${payload.length} bytes): ${payload.toString('hex').slice(0, 200)}`)
            } else {
                this.logger.debug(`${prefix} (${payload.length} bytes): ${payload.toString().slice(0, 200)}`)
            }
        } else if (typeof payload === 'string') {
            const display = payload.length > 200 ? payload.slice(0, 200) + '…' : payload
            this.logger.debug(`${prefix}: ${display}`)
        } else {
            this.logger.debug(`${prefix}:`, payload)
        }
    }

    emitServiceMessage(msg: string): void {
        this.serviceMessage.next(msg)
        this.logger.info(msg)
    }

    // write() is called by BaseSession's middleware subscription
    write(data: Buffer): void {
        this.sendToWebSocket(data)
    }

    /**
     * 发送数据到 WebSocket
     * 使用协议处理器编码输入数据
     * 注意：SockJS 协议要求收到 "o" 帧后才能发送数据
     */
    private sendToWebSocket(data: Buffer): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.receivedOpenMessage) {
            const encoded = this.protocolHandler.encodeInput(data)
            this.debugLog('>>', 'send', encoded)
            this.socket.send(encoded)
        }
    }

    /**
     * 调整终端大小
     * 使用协议处理器编码 resize 消息
     */
    resize(w: number, h: number): void {
        if (w && h) {
            this.lastWidth = w
            this.lastHeight = h
        }

        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.receivedOpenMessage && this.lastWidth && this.lastHeight) {
            const size: TerminalSize = {
                columns: this.lastWidth,
                rows: this.lastHeight,
            }
            const encoded = this.protocolHandler.encodeResize(size)
            this.debugLog('>>', 'resize', encoded)
            this.socket.send(encoded)
        }
    }

    kill(_signal?: string): void {
        if (this.socket) {
            this.socket.close()
            this.socket = null
        }
    }

    async destroy(): Promise<void> {
        if (this.isDestroyed) {
            return
        }
        this.isDestroyed = true
        this.stopKeepalive()
        this.serviceMessage.complete()
        await this.gracefullyKillProcess()
        await super.destroy()
    }

    async gracefullyKillProcess(): Promise<void> {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
                // 发送 exit 命令
                this.sendToWebSocket(Buffer.from('exit\r'))
                await new Promise<void>(resolve => {
                    setTimeout(resolve, 1000)
                })
            } catch { }
        }
        this.kill()
    }

    supportsWorkingDirectory(): boolean {
        return false
    }

    async getWorkingDirectory(): Promise<string | null> {
        return null
    }

    /**
     * 启动保活机制
     */
    private startKeepalive(): void {
        this.stopKeepalive()

        const interval = this.profile.options.keepaliveInterval ?? 30000
        if (interval <= 0) {
            this.logger.debug('Keepalive disabled')
            return
        }

        this.logger.debug(`Starting keepalive with interval ${interval}ms`)
        this.keepaliveTimer = setInterval(() => {
            this.sendKeepalive()
        }, interval)
    }

    /**
     * 停止保活机制
     */
    private stopKeepalive(): void {
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer)
            this.keepaliveTimer = null
            this.logger.debug('Stopped keepalive')
        }
    }

    /**
     * 发送保活消息
     * 使用协议处理器编码保活消息
     */
    private sendKeepalive(): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.debugLog('!!', 'keepalive', 'skipping - socket not open')
            return
        }

        // 如果有终端尺寸信息，发送保活消息
        if (this.lastWidth && this.lastHeight) {
            const size: TerminalSize = {
                columns: this.lastWidth,
                rows: this.lastHeight,
            }

            try {
                const encoded = this.protocolHandler.encodeKeepalive(size)
                this.debugLog('>>', 'keepalive', encoded)
                this.socket.send(encoded)
            } catch (e: any) {
                this.logger.error(`Failed to send keepalive: ${e.message}`)
                // 如果发送失败，socket 可能已断开
                // 让 socket 错误处理器处理后续逻辑
            }
        }
    }
}
