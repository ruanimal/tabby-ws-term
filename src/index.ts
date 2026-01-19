import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import TabbyCoreModule, { ConfigProvider, TabRecoveryProvider, ProfileProvider } from 'tabby-core'
import TabbyTerminalModule from 'tabby-terminal'

import { WSTermProfileSettingsComponent } from './components/wsTermProfileSettings.component'
import { WSTermTabComponent } from './components/wsTermTab.component'

import { WSTermConfigProvider } from './config'
import { RecoveryProvider } from './recoveryProvider'
import { WSTermProfilesService } from './profiles'

/** @hidden */
@NgModule({
    imports: [
        NgbModule,
        CommonModule,
        FormsModule,
        TabbyCoreModule,
        TabbyTerminalModule,
    ],
    providers: [
        { provide: ConfigProvider, useClass: WSTermConfigProvider, multi: true },
        { provide: TabRecoveryProvider, useClass: RecoveryProvider, multi: true },
        { provide: ProfileProvider, useExisting: WSTermProfilesService, multi: true },
    ],
    declarations: [
        WSTermProfileSettingsComponent,
        WSTermTabComponent,
    ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class WSTermModule { }
