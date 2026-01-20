# [npm] Missing QuickConnectProfileProvider and ConnectableProfile exports in tabby-core package

## Description

The `tabby-core` npm package is missing several important type exports that are already present in the source code. This prevents third-party plugins from properly implementing the Quick Connect CLI functionality.

## Current npm Package Version

The latest version on npm is `1.0.197-nightly.1` (published April 2023).

**Current exports in npm package** (`typings/api/index.d.ts`):
```typescript
export { ProfileProvider, Profile, PartialProfile, ProfileSettingsComponent } from './profileProvider';
```

**Expected exports** (as in current source code):
```typescript
export { ProfileProvider, ConnectableProfileProvider, QuickConnectProfileProvider, Profile, ConnectableProfile, PartialProfile, ProfileSettingsComponent, ProfileGroup, PartialProfileGroup } from './profileProvider';
```

## Missing Exports

- `QuickConnectProfileProvider`
- `ConnectableProfileProvider`
- `ConnectableProfile`
- `ProfileGroup`
- `PartialProfileGroup`

## Impact

Third-party plugins cannot:
1. Extend `QuickConnectProfileProvider` to implement quick connect functionality
2. Use `ConnectableProfile` interface for connectable terminal profiles
3. Support the CLI `quickConnect` command introduced in commit `ac95f550` (January 2024)

## Reproduction Steps

1. Create a third-party plugin that depends on `tabby-core` from npm
2. Try to import `QuickConnectProfileProvider` or `ConnectableProfile`:
   ```typescript
   import { QuickConnectProfileProvider, ConnectableProfile } from 'tabby-core'
   ```
3. Build fails with: `Module '"tabby-core"' has no exported member 'QuickConnectProfileProvider'`

## Proposed Solution

Publish a new version of `tabby-core` to npm that includes the updated type exports.

## Additional Context

Related commits that added these features:
- `21e38c84` - Created `ConnectableProfile` & `ConnectableProfileProvider`
- `ac95f550` - Added Quick Connect CLI command support (January 12, 2024)

## Environment

- npm package version: `1.0.197-nightly.1`
- Source code already has the correct exports
