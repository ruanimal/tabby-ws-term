import { Logger } from 'tabby-core'
import { BaseSession } from 'tabby-terminal'
import { Subject, Observable } from 'rxjs'
import WebSocket from 'ws'

import { WSTermProfile } from './profiles'
import { ProtocolHandler, createProtocolHandler, normalizeProtocolType, TerminalSize, DecodedMessage } from './protocols'

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

    constructor(
        logger: Logger,
        public profile: WSTermProfile,
    ) {
        super(logger)

        // 规范化协议类型，确保无效值回退到默认值 'kube-exec'
        // 这处理 undefined、null、空字符串以及非有效协议类型的情况
        const normalizedProtocol = normalizeProtocolType(profile.options.protocol)
        this.protocolHandler = createProtocolHandler(normalizedProtocol)

        // 记录规范化信息（如果原始值无效）
        if (profile.options.protocol !== normalizedProtocol) {
            logger.info(`Protocol type normalized from '${profile.options.protocol}' to '${normalizedProtocol}'`)
        }
    }

    async start(): Promise<void> {
        const wsUrl = this.profile.options.wsUrl
        this.emitServiceMessage(`Connecting to ${wsUrl}`)

        return new Promise((resolve, reject) => {
            try {
                // Parse the URL to get the origin
                const parsedUrl = new URL(wsUrl)
                const origin = `https://${parsedUrl.host}`

                // Get WebSocket options from protocol handler
                const wsOptions = this.protocolHandler.getWebSocketOptions?.(wsUrl) ?? {}

                // Create WebSocket with custom headers for better compatibility
                this.socket = new WebSocket(wsUrl, wsOptions.subprotocols ?? [], {
                    headers: {
                        'Origin': origin,
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        ...wsOptions.headers,
                    },
                })

                this.socket.on('open', () => {
                    this.emitServiceMessage('Connected')
                    this.open = true

                    // Send protocol-specific connect/init message (e.g. ttyd auth handshake)
                    const connectMsg = this.protocolHandler.encodeConnect(
                        { columns: 80, rows: 24 },
                    )
                    if (connectMsg) {
                        this.socket.send(connectMsg)
                        this.logger.debug(`Sent connect message (${this.protocolHandler.protocolType})`)
                    }

                    // Send initial resize
                    if (this.lastWidth && this.lastHeight) {
                        this.resize(this.lastWidth, this.lastHeight)
                    }
                    // Clear terminal immediately to hide internal connection messages
                    this.emitOutput(Buffer.from('\x1b[2J\x1b[H'))

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

                    // Start keepalive mechanism
                    this.startKeepalive()

                    resolve()
                })

                this.socket.on('message', (data: WebSocket.Data) => {
                    this.handleMessage(data)
                })

                this.socket.on('error', (err: Error) => {
                    this.lastError = err
                    this.emitServiceMessage(`WebSocket error: ${err.message}`)
                    reject(new Error('WebSocket connection failed: ' + err.message))
                })

                this.socket.on('close', (code: number) => {
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
            case 'output':
                this.emitOutput(msg.data)
                break
            case 'title':
                // 设置窗口标题（未来可实现）
                this.logger.debug(`Received title: ${msg.data}`)
                break
            case 'toast':
                // Toast 消息作为服务消息显示
                this.emitServiceMessage(msg.data)
                break
            case 'preferences':
                // 处理偏好设置（未来可实现）
                this.logger.debug('Received preferences:', msg.data)
                break
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
     */
    private sendToWebSocket(data: Buffer): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            const encoded = this.protocolHandler.encodeInput(data)
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

        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.lastWidth && this.lastHeight) {
            const size: TerminalSize = {
                columns: this.lastWidth,
                rows: this.lastHeight,
            }
            const encoded = this.protocolHandler.encodeResize(size)
            this.socket.send(encoded)
            this.logger.debug(`Sent resize: ${this.lastWidth}x${this.lastHeight}`)
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
            this.logger.debug('Skipping keepalive - socket not open')
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
                this.socket.send(encoded)
                this.logger.debug(`Sent keepalive (${this.protocolHandler.protocolType}: ${this.lastWidth}x${this.lastHeight})`)
            } catch (e: any) {
                this.logger.error(`Failed to send keepalive: ${e.message}`)
                // 如果发送失败，socket 可能已断开
                // 让 socket 错误处理器处理后续逻辑
            }
        }
    }
}
