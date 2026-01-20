import colors from 'ansi-colors'
import { Component, Injector, Input } from '@angular/core'
import { LogService } from 'tabby-core'
import { BaseTerminalTabComponent } from 'tabby-terminal'
import { WSTermProfile } from '../profiles'
import { WSTermSession } from '../session'

// Handle pug template loading
const tabTemplate = require('./wsTermTab.component.pug')

/** @hidden */
@Component({
    selector: 'ws-term-tab',
    template: (BaseTerminalTabComponent.template || '') + (typeof tabTemplate === 'function' ? tabTemplate() : tabTemplate),
    styles: BaseTerminalTabComponent.styles || [],
    animations: BaseTerminalTabComponent.animations || [],
})
export class WSTermTabComponent extends BaseTerminalTabComponent<WSTermProfile> {
    @Input() profile: WSTermProfile
    wsSession: WSTermSession | null = null

    constructor(
        injector: Injector,
    ) {
        super(injector)
        this.enableToolbar = true
    }

    ngOnInit(): void {
        this.subscribeUntilDestroyed(this.hotkeys.hotkey$, hotkey => {
            if (this.hasFocus && hotkey === 'restart-ws-term-session') {
                this.reconnect()
            }
        })

        super.ngOnInit()

        this.initializeSession()
    }

    protected onSessionDestroyed(): void {
        if (this.frontend) {
            this.write('\r\n' + colors.black.bgWhite(' WS-TERM ') + ` session closed\r\n`)
        }
    }

    async initializeSession(): Promise<void> {
        const logger = this.injector.get(LogService).create(`ws-term-${this.profile.options.wsUrl}`)
        const session = new WSTermSession(logger, this.profile)
        this.wsSession = session
        this.setSession(session)

        try {
            this.startSpinner(this.translate.instant('Connecting'))

            this.attachSessionHandler(session.serviceMessage$, msg => {
                this.write(`\r${colors.black.bgWhite(' WS-TERM ')} ${msg}\r\n`)
                session.resize(this.size.columns, this.size.rows)
                // Clear terminal after "Connected" to hide sensitive connection info (URL may contain tokens)
                if (msg === 'Connected') {
                    // Use ANSI escape sequences: clear screen and move cursor to home
                    this.write('\x1b[2J\x1b[H')
                }
            })

            try {
                await session.start()
                this.stopSpinner()
            } catch (e: any) {
                this.stopSpinner()
                this.write(colors.black.bgRed(' X ') + ' ' + colors.red(e.message) + '\r\n')
                return
            }
        } catch (e: any) {
            this.write(colors.black.bgRed(' X ') + ' ' + colors.red(e.message) + '\r\n')
        }
    }

    async reconnect(): Promise<void> {
        if (this.wsSession) {
            await this.wsSession.destroy()
        }
        await this.initializeSession()
    }

    async canClose(): Promise<boolean> {
        if (!this.wsSession?.open) {
            return true
        }
        return (await this.platform.showMessageBox(
            {
                type: 'warning',
                message: this.translate.instant('Disconnect from WebSocket terminal?'),
                buttons: [
                    this.translate.instant('Disconnect'),
                    this.translate.instant('Do not close'),
                ],
                defaultId: 0,
                cancelId: 1,
            },
        )).response === 0
    }

    getDescription(): string {
        try {
            const url = new URL(this.profile.options.wsUrl)
            const params = new URLSearchParams(url.search)
            const pod = params.get('pod') || ''
            const namespace = params.get('namespace') || params.get('ns') || ''
            if (pod) {
                return namespace ? `${namespace}/${pod}` : pod
            }
            return url.host
        } catch {
            return this.profile.options.wsUrl || 'WS Terminal'
        }
    }

    async getRecoveryToken(): Promise<any> {
        return {
            type: 'app:ws-term-tab',
            profile: this.profile,
            savedState: this.frontend?.saveState(),
        }
    }
}
