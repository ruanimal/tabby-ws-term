import { Injectable } from '@angular/core'
import { NewTabParameters, PartialProfile, QuickConnectProfileProvider } from 'tabby-core'
import { ConnectableTerminalProfile } from 'tabby-terminal'
import { WSTermProfileSettingsComponent } from './components/wsTermProfileSettings.component'
import { WSTermTabComponent } from './components/wsTermTab.component'
import { ProtocolType, normalizeProtocolType } from './protocols'

export interface WSTermProfileOptions {
    wsUrl: string
    shell?: string
    confirmDisconnect?: boolean
    keepaliveInterval?: number
    /** 协议类型，默认为 'kube-exec' */
    protocol?: ProtocolType
}

export interface WSTermProfile extends ConnectableTerminalProfile {
    options: WSTermProfileOptions
}

@Injectable({ providedIn: 'root' })
export class WSTermProfilesService extends QuickConnectProfileProvider<WSTermProfile> {
    id = 'ws-term'
    name = 'WS Terminal'
    settingsComponent = WSTermProfileSettingsComponent
    configDefaults = {
        options: {
            wsUrl: '',
            shell: '',
            confirmDisconnect: false,
            keepaliveInterval: 15000,
            protocol: 'kube-exec' as ProtocolType,
        },
        clearServiceMessagesOnConnect: false,
    }

    async getBuiltinProfiles(): Promise<PartialProfile<WSTermProfile>[]> {
        return [
            {
                id: `ws-term:template`,
                type: 'ws-term',
                name: 'WebSocket Terminal',
                icon: 'fas fa-cloud',
                options: {
                    wsUrl: '',
                    shell: '',
                },
                isBuiltin: true,
                isTemplate: true,
            } as PartialProfile<WSTermProfile>,
        ]
    }

    async getNewTabParameters(profile: PartialProfile<WSTermProfile>): Promise<NewTabParameters<WSTermTabComponent>> {
        return {
            type: WSTermTabComponent,
            inputs: { profile },
        }
    }

    getSuggestedName(profile: PartialProfile<WSTermProfile>): string | null {
        return this.getDescription(profile) || null
    }

    getDescription(profile: PartialProfile<WSTermProfile>): string {
        if (!profile.options?.wsUrl) {
            return ''
        }
        try {
            const url = new URL(profile.options.wsUrl)
            const params = new URLSearchParams(url.search)
            const pod = params.get('pod') || ''
            const namespace = params.get('namespace') || params.get('ns') || ''
            if (pod) {
                return namespace ? `${namespace}/${pod}` : pod
            }
            return url.host
        } catch {
            return profile.options.wsUrl
        }
    }

    /**
     * Parse a quick connect query (ws/wss URL) into a profile
     * Supports: ws://host:port/path, wss://host:port/path
     */
    quickConnect(query: string): PartialProfile<WSTermProfile> | null {
        // Normalize the query - add ws:// if no protocol specified
        let wsUrl = query.trim()
        if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
            wsUrl = `ws://${wsUrl}`
        }

        // Validate URL
        let url: URL
        try {
            url = new URL(wsUrl)
        } catch {
            return null
        }

        const options: WSTermProfileOptions = {
            wsUrl: url.toString(),
        }

        const params = new URLSearchParams(url.search)
        if (params.has('ws-term.option.shell')) {
            options.shell = params.get('ws-term.option.shell')!
            params.delete('ws-term.option.shell')
        }
        if (params.has('ws-term.option.confirmDisconnect')) {
            options.confirmDisconnect = params.get('ws-term.option.confirmDisconnect') === 'true'
            params.delete('ws-term.option.confirmDisconnect')
        }
        if (params.has('ws-term.option.protocol')) {
            const protocolParam = params.get('ws-term.option.protocol')
            options.protocol = normalizeProtocolType(protocolParam)
            params.delete('ws-term.option.protocol')
        }

        url.search = params.toString()
        options.wsUrl = url.toString()

        return {
            name: query,
            type: 'ws-term',
            options,
        }
    }

    /**
     * Convert a profile back into a quick connect string (the wsUrl)
     */
    intoQuickConnectString(profile: WSTermProfile): string | null {
        if (!profile.options?.wsUrl) {
            return null
        }

        // 对于 ttyd 协议，需要在 URL 中包含 protocol 参数
        if (profile.options.protocol === 'ttyd') {
            try {
                const url = new URL(profile.options.wsUrl)
                const params = new URLSearchParams(url.search)
                params.set('ws-term.option.protocol', 'ttyd')
                url.search = params.toString()
                return url.toString()
            } catch {
                return profile.options.wsUrl
            }
        }

        return profile.options.wsUrl
    }
}

