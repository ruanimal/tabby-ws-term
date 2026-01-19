import { ConfigProvider } from 'tabby-core'

/** @hidden */
export class WSTermConfigProvider extends ConfigProvider {
    defaults = {
        hotkeys: {
            'restart-ws-term-session': [],
        },
    }

    platformDefaults = {}
}
