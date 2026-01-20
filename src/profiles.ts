import { Injectable } from '@angular/core'
import { NewTabParameters, PartialProfile, ProfileProvider } from 'tabby-core'
import { BaseTerminalProfile } from 'tabby-terminal'
import { WSTermProfileSettingsComponent } from './components/wsTermProfileSettings.component'
import { WSTermTabComponent } from './components/wsTermTab.component'

export interface WSTermProfileOptions {
    wsUrl: string
}

export interface WSTermProfile extends BaseTerminalProfile {
    options: WSTermProfileOptions
}

@Injectable({ providedIn: 'root' })
export class WSTermProfilesService extends ProfileProvider<WSTermProfile> {
    id = 'ws-term'
    name = 'WS Terminal'
    supportsQuickConnect = true
    settingsComponent = WSTermProfileSettingsComponent
    configDefaults = {
        options: {
            wsUrl: '',
        },
    }

    async getBuiltinProfiles(): Promise<PartialProfile<WSTermProfile>[]> {
        return [
            {
                id: `ws-term:template`,
                type: 'ws-term',
                name: 'K8s Web Terminal',
                icon: 'fas fa-cloud',
                options: {
                    wsUrl: '',
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
        try {
            new URL(wsUrl)
        } catch {
            return null
        }

        return {
            name: query,
            type: 'ws-term',
            options: {
                wsUrl,
            },
        }
    }

    /**
     * Convert a profile back into a quick connect string (the wsUrl)
     */
    intoQuickConnectString(profile: WSTermProfile): string | null {
        return profile.options?.wsUrl || null
    }
}

