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
}
