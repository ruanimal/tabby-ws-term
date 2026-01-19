## 实现自定义 QuickConnect Provider

NOTE: 似乎目前版本的 tabby 还没有开放插件的 cli QuickConnect 的功能

### 1. 创建 Provider 类

继承 `QuickConnectProfileProvider` 抽象类并实现必需方法 [1](#2-0) ：

```typescript
@Injectable({ providedIn: 'root' })
export class MyProtocolProfilesService extends QuickConnectProfileProvider<MyProfile> {
    id = 'my-protocol'
    name = 'My Protocol'
    settingsComponent = MyProfileSettingsComponent
    configDefaults = { /* 默认配置 */ }

    async getBuiltinProfiles(): Promise<PartialProfile<MyProfile>[]> {
        return []
    }

    async getNewTabParameters(profile: MyProfile): Promise<NewTabParameters<MyTabComponent>> {
        return {
            type: MyTabComponent,
            inputs: { profile }
        }
    }

    getDescription(profile: PartialProfile<MyProfile>): string {
        return profile.options?.host ?? ''
    }

    quickConnect(query: string): PartialProfile<MyProfile>|null {
        // 解析连接字符串
        return {
            name: query,
            type: 'my-protocol',
            options: { /* 解析后的选项 */ }
        }
    }

    intoQuickConnectString(profile: MyProfile): string|null {
        // 将 profile 转换回连接字符串
        return profile.options.host
    }
}
```

### 2. 在插件中注册

在插件的 NgModule 中注册 provider [2](#2-1) ：

```typescript
@NgModule({
    providers: [
        { provide: ProfileProvider, useClass: MyProtocolProfilesService, multi: true },
    ],
})
export default class MyModule { }
```

### 3. 自动发现机制

注册后，provider 会自动被以下系统发现和使用：

- **Profile 选择器**：显示在快速连接选项中 [3](#2-2)
- **CLI 命令**：支持 `tabby quickConnect my-protocol <query>` [4](#2-3)
"/>
- **设置界面**：出现在默认快速连接类型下拉框中 [5](#2-4)

## Notes

- 插件需要包含 `tabby-plugin` 关键字在 `package.json` 中 [6](#2-5)
- Provider 必须继承 `QuickConnectProfileProvider` 才能支持快速连接功能
- 设置组件是可选的，但建议提供以便用户配置详细选项
- 参考 SSH 和 Telnet provider 的实现作为示例 [7](#2-6) [8](#2-7)

Wiki pages you might want to explore:
- [Profile Management (eugeny/tabby)](/wiki/eugeny/tabby#4.3)

### Citations

**File:** tabby-core/src/api/profileProvider.ts (L79-85)
```typescript
export abstract class QuickConnectProfileProvider<P extends ConnectableProfile> extends ConnectableProfileProvider<P> {

    abstract quickConnect (query: string): PartialProfile<P>|null

    abstract intoQuickConnectString (profile: P): string|null

}
```

**File:** HACKING.md (L96-96)
```markdown
Only modules whose `package.json` file contains a `tabby-plugin` keyword will be loaded.
```

**File:** HACKING.md (L134-140)
```markdown
@NgModule({
    providers: [
        { provide: ToolbarButtonProvider, useClass: MyButtonProvider, multi: true },
    ],
})
export default class MyModule { }
```
```

**File:** tabby-core/src/services/profiles.service.ts (L292-306)
```typescript
                this.getProviders().forEach(provider => {
                    if (provider instanceof QuickConnectProfileProvider) {
                        options.push({
                            name: this.translate.instant('Quick connect'),
                            freeInputPattern: this.translate.instant('Connect to "%s"...'),
                            description: `(${provider.name.toUpperCase()})`,
                            icon: 'fas fa-arrow-right',
                            weight: provider.id !== this.config.store.defaultQuickConnectProvider ? 1 : 0,
                            callback: query => {
                                const profile = provider.quickConnect(query)
                                resolve(profile)
                            },
                        })
                    }
                })
```

**File:** tabby-core/src/cli.ts (L57-70)
```typescript
    private async handleOpenQuickConnect (providerId: string, query: string) {
        const provider = this.profiles.getProviders().find(x => x.id === providerId)
        if(!provider || !(provider instanceof QuickConnectProfileProvider)) {
            console.error(`Requested provider "${providerId}" not found`)
            return
        }
        const profile = provider.quickConnect(query)
        if(!profile) {
            console.error(`Could not parse quick connect query "${query}"`)
            return
        }
        this.profiles.openNewTabForProfile(profile)
        this.hostWindow.bringToFront()
    }
```

**File:** tabby-settings/src/components/profilesSettingsTab.component.ts (L351-353)
```typescript
    getQuickConnectProviders (): ProfileProvider<Profile>[] {
        return this.profileProviders.filter(x => x instanceof QuickConnectProfileProvider)
    }
```

**File:** tabby-ssh/src/profiles.ts (L10-152)
```typescript
@Injectable({ providedIn: 'root' })
export class SSHProfilesService extends QuickConnectProfileProvider<SSHProfile> {
    id = 'ssh'
    name = 'SSH'
    settingsComponent = SSHProfileSettingsComponent
    configDefaults = {
        options: {
            host: null,
            port: 22,
            user: 'root',
            auth: null,
            password: null,
            privateKeys: [],
            keepaliveInterval: 5000,
            keepaliveCountMax: 10,
            readyTimeout: null,
            x11: false,
            skipBanner: false,
            jumpHost: null,
            agentForward: false,
            warnOnClose: null,
            algorithms: {
                hmac: [] as string[],
                kex: [] as string[],
                cipher: [] as string[],
                serverHostKey: [] as string[],
                compression: [] as string[],
            },
            proxyCommand: null,
            forwardedPorts: [],
            scripts: [],
            socksProxyHost: null,
            socksProxyPort: null,
            httpProxyHost: null,
            httpProxyPort: null,
            reuseSession: true,
            input: { backspace: 'backspace' },
        },
        clearServiceMessagesOnConnect: true,
    }

    constructor (
        private passwordStorage: PasswordStorageService,
        private translate: TranslateService,
        private injector: Injector,
    ) {
        super()
        for (const k of Object.values(SSHAlgorithmType)) {
            this.configDefaults.options.algorithms[k] = [...defaultAlgorithms[k]]
            if (k !== SSHAlgorithmType.COMPRESSION) { this.configDefaults.options.algorithms[k].sort() }
        }
    }

    async getBuiltinProfiles (): Promise<PartialProfile<SSHProfile>[]> {
        const importers = this.injector.get<SSHProfileImporter[]>(SSHProfileImporter as any, [], InjectFlags.Optional)
        let imported: PartialProfile<SSHProfile>[] = []
        for (const importer of importers) {
            try {
                imported = imported.concat(await importer.getProfiles())
            } catch (e) {
                console.warn('Could not import SSH profiles:', e)
            }
        }
        return [
            {
                id: `ssh:template`,
                type: 'ssh',
                name: this.translate.instant('SSH connection'),
                icon: 'fas fa-desktop',
                options: {
                    host: '',
                    port: 22,
                    user: 'root',
                },
                isBuiltin: true,
                isTemplate: true,
                weight: -1,
            },
            ...imported.map(p => ({
                ...p,
                isBuiltin: true,
            })),
        ]
    }

    async getNewTabParameters (profile: SSHProfile): Promise<NewTabParameters<SSHTabComponent>> {
        return {
            type: SSHTabComponent,
            inputs: { profile },
        }
    }

    getSuggestedName (profile: SSHProfile): string {
        return `${profile.options.user}@${profile.options.host}:${profile.options.port}`
    }

    getDescription (profile: PartialProfile<SSHProfile>): string {
        return profile.options?.host ?? ''
    }

    deleteProfile (profile: SSHProfile): void {
        this.passwordStorage.deletePassword(profile)
    }

    quickConnect (query: string): PartialProfile<SSHProfile> {
        let user: string|undefined = undefined
        let host = query
        let port = 22
        if (host.includes('@')) {
            const parts = host.split(/@/g)
            host = parts[parts.length - 1]
            user = parts.slice(0, parts.length - 1).join('@')
        }
        if (host.includes('[')) {
            port = parseInt(host.split(']')[1].substring(1))
            host = host.split(']')[0].substring(1)
        } else if (host.includes(':')) {
            port = parseInt(host.split(/:/g)[1])
            host = host.split(':')[0]
        }

        return {
            name: query,
            type: 'ssh',
            options: {
                host,
                user,
                port,
            },
        }
    }

    intoQuickConnectString (profile: SSHProfile): string|null {
        let s = profile.options.host
        if (profile.options.user !== 'root') {
            s = `${profile.options.user}@${s}`
        }
        if (profile.options.port !== 22) {
            s = `${s}:${profile.options.port}`
        }
        return s
    }
}
```

**File:** tabby-telnet/src/profiles.ts (L7-107)
```typescript
@Injectable({ providedIn: 'root' })
export class TelnetProfilesService extends QuickConnectProfileProvider<TelnetProfile> {
    id = 'telnet'
    name = 'Telnet'
    supportsQuickConnect = true
    settingsComponent = TelnetProfileSettingsComponent
    configDefaults = {
        options: {
            host: null,
            port: 23,
            inputMode: 'local-echo',
            outputMode: null,
            inputNewlines: null,
            outputNewlines: 'crlf',
            scripts: [],
            input: { backspace: 'backspace' },
        },
        clearServiceMessagesOnConnect: false,
    }

    constructor (private translate: TranslateService) { super() }

    async getBuiltinProfiles (): Promise<PartialProfile<TelnetProfile>[]> {
        return [
            {
                id: `telnet:template`,
                type: 'telnet',
                name: this.translate.instant('Telnet session'),
                icon: 'fas fa-network-wired',
                options: {
                    host: '',
                    port: 23,
                    inputMode: 'readline',
                    outputMode: null,
                    inputNewlines: null,
                    outputNewlines: 'crlf',
                },
                isBuiltin: true,
                isTemplate: true,
            },
            {
                id: `socket:template`,
                type: 'telnet',
                name: this.translate.instant('Raw socket connection'),
                icon: 'fas fa-network-wired',
                options: {
                    host: '',
                    port: 1234,
                },
                isBuiltin: true,
                isTemplate: true,
            },
        ]
    }

    async getNewTabParameters (profile: TelnetProfile): Promise<NewTabParameters<TelnetTabComponent>> {
        return {
            type: TelnetTabComponent,
            inputs: { profile },
        }
    }

    getSuggestedName (profile: TelnetProfile): string|null {
        return this.getDescription(profile) || null
    }

    getDescription (profile: TelnetProfile): string {
        return profile.options.host ? `${profile.options.host}:${profile.options.port}` : ''
    }

    quickConnect (query: string): PartialProfile<TelnetProfile> {
        let host = query
        let port = 23
        if (host.includes('[')) {
            port = parseInt(host.split(']')[1].substring(1))
            host = host.split(']')[0].substring(1)
        } else if (host.includes(':')) {
            port = parseInt(host.split(/:/g)[1])
            host = host.split(':')[0]
        }

        return {
            name: query,
            type: 'telnet',
            options: {
                host,
                port,
                inputMode: 'readline',
                outputNewlines: 'crlf',
            },
        }
    }

    intoQuickConnectString (profile: TelnetProfile): string | null {
        let s = profile.options.host
        if (profile.options.port !== 23) {
            s = `${s}:${profile.options.port}`
        }
        return s
    }
}
```

see also: https://github.com/Eugeny/tabby/discussions/8679
