import { Component } from '@angular/core'

import { ProfileSettingsComponent } from 'tabby-core'
import { WSTermProfile } from '../profiles'
import { isValidProtocolType } from '../protocols'

/** @hidden */
@Component({
    templateUrl: './wsTermProfileSettings.component.pug',
})
export class WSTermProfileSettingsComponent implements ProfileSettingsComponent<WSTermProfile> {
    profile: WSTermProfile

    /**
     * 验证并保存配置
     * @throws Error 如果 protocol 字段值无效
     */
    save (): void {
        const protocol = this.profile.options?.protocol

        // 验证 protocol 字段值
        if (protocol !== undefined && !isValidProtocolType(protocol)) {
            throw new Error(`Invalid protocol type: "${protocol}". Must be "kube-exec" or "ttyd".`)
        }
    }
}
