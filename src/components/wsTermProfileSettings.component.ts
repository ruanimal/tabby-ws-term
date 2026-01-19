import { Component } from '@angular/core'

import { ProfileSettingsComponent } from 'tabby-core'
import { WSTermProfile } from '../profiles'

/** @hidden */
@Component({
    templateUrl: './wsTermProfileSettings.component.pug',
})
export class WSTermProfileSettingsComponent implements ProfileSettingsComponent<WSTermProfile> {
    profile: WSTermProfile
}
