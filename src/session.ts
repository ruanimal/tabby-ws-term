import { Logger } from 'tabby-core'
import { BaseSession } from 'tabby-terminal'
import { Subject, Observable } from 'rxjs'

import { WSTermProfile } from './profiles'

// K8s WebSocket message types
interface K8sTerminalMessage {
    Op: 'stdout' | 'stdin' | 'resize' | 'toast'
    Data?: string
    Rows?: number
    Cols?: number
}

export class WSTermSession extends BaseSession {
    get serviceMessage$(): Observable<string> { return this.serviceMessage }

    private serviceMessage = new Subject<string>()
    private socket: WebSocket | null = null
    private lastWidth = 0
    private lastHeight = 0

    constructor(
        logger: Logger,
        public profile: WSTermProfile,
    ) {
        super(logger)
    }

    async start(): Promise<void> {
        const wsUrl = this.profile.options.wsUrl
        this.emitServiceMessage(`Connecting to ${wsUrl}`)

        return new Promise((resolve, reject) => {
            try {
                this.socket = new WebSocket(wsUrl)

                this.socket.onopen = () => {
                    this.emitServiceMessage('Connected')
                    this.open = true
                    // Send initial resize if we have size info
                    if (this.lastWidth && this.lastHeight) {
                        this.resize(this.lastWidth, this.lastHeight)
                    }
                    resolve()
                }

                this.socket.onmessage = (event) => {
                    this.handleMessage(event.data)
                }

                this.socket.onerror = (err) => {
                    this.emitServiceMessage(`WebSocket error: ${err}`)
                    reject(new Error('WebSocket connection failed'))
                }

                this.socket.onclose = () => {
                    this.emitServiceMessage('Connection closed')
                    this.destroy()
                }
            } catch (e) {
                this.emitServiceMessage(`Failed to connect: ${e}`)
                reject(e)
            }
        })
    }

    private handleMessage(data: string | ArrayBuffer | Blob): void {
        if (typeof data === 'string') {
            this.parseK8sMessage(data)
        } else if (data instanceof ArrayBuffer) {
            this.parseK8sMessage(new TextDecoder().decode(data))
        } else if (data instanceof Blob) {
            data.text().then((text) => {
                this.parseK8sMessage(text)
            })
        }
    }

    private parseK8sMessage(text: string): void {
        try {
            const msg: K8sTerminalMessage = JSON.parse(text)

            switch (msg.Op) {
                case 'stdout':
                    if (msg.Data) {
                        this.emitOutput(Buffer.from(msg.Data))
                    }
                    break
                case 'toast':
                    // Toast messages are notifications from the server
                    if (msg.Data) {
                        this.emitServiceMessage(msg.Data)
                    }
                    break
                default:
                    this.logger.debug('Unhandled message type:', msg.Op)
            }
        } catch (e) {
            // If not JSON, treat as raw output (fallback)
            this.logger.debug('Non-JSON message received, treating as raw output')
            this.emitOutput(Buffer.from(text))
        }
    }

    emitServiceMessage(msg: string): void {
        this.serviceMessage.next(msg)
        this.logger.info(msg)
    }

    // Override feedFromTerminal to bypass middleware and send directly to WebSocket
    // This prevents any potential duplication from middleware processing
    feedFromTerminal(data: Buffer): void {
        this.sendToWebSocket(data)
    }

    private sendToWebSocket(data: Buffer): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            // Send input in K8s format
            const inputMsg: K8sTerminalMessage = {
                Op: 'stdin',
                Data: data.toString(),
            }
            this.socket.send(JSON.stringify(inputMsg))
        }
    }

    resize(w: number, h: number): void {
        if (w && h) {
            this.lastWidth = w
            this.lastHeight = h
        }

        // Send resize message in K8s format
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.lastWidth && this.lastHeight) {
            const resizeMsg: K8sTerminalMessage = {
                Op: 'resize',
                Cols: this.lastWidth,
                Rows: this.lastHeight,
            }
            this.socket.send(JSON.stringify(resizeMsg))
            this.logger.debug(`Sent resize: ${this.lastWidth}x${this.lastHeight}`)
        }
    }

    // write() is called by BaseSession's middleware subscription
    // We make it a no-op since we handle input directly in feedFromTerminal
    write(data: Buffer): void {
        // No-op: input is handled directly in feedFromTerminal
        // This prevents double sending when BaseSession's middleware calls write()
    }

    kill(_signal?: string): void {
        if (this.socket) {
            this.socket.close()
            this.socket = null
        }
    }

    async destroy(): Promise<void> {
        this.serviceMessage.complete()
        this.kill()
        await super.destroy()
    }

    async gracefullyKillProcess(): Promise<void> {
        this.kill()
    }

    supportsWorkingDirectory(): boolean {
        return false
    }

    async getWorkingDirectory(): Promise<string | null> {
        return null
    }
}
