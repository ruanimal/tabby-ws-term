import { Injectable } from '@angular/core'
import { TabRecoveryProvider, NewTabParameters, RecoveryToken } from 'tabby-core'

import { WSTermTabComponent } from './components/wsTermTab.component'

/** @hidden */
@Injectable()
export class RecoveryProvider extends TabRecoveryProvider<WSTermTabComponent> {
    async applicableTo(recoveryToken: RecoveryToken): Promise<boolean> {
        return recoveryToken.type === 'app:ws-term-tab'
    }

    async recover(recoveryToken: RecoveryToken): Promise<NewTabParameters<WSTermTabComponent>> {
        return {
            type: WSTermTabComponent,
            inputs: {
                profile: recoveryToken['profile'],
                savedState: recoveryToken['savedState'],
            },
        }
    }
}
