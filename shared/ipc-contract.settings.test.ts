// shared/ipc-contract.settings.test.ts
import { describe, it, expectTypeOf } from 'vitest'
import type { IpcContract, IpcEventContract } from './ipc-contract'
import type {
  AiProviderProfile,
  ProfileCreateInput,
  ProfileUpdateInput,
  SettingsByNs,
  SettingsNamespace,
  SettingsChangedPayload
} from './settings-types'

describe('IpcContract.settings', () => {
  it('has get / set / aiProfilesList / aiProfilesCreate / aiProfilesUpdate / aiProfilesDelete / browserClearCookies', () => {
    expectTypeOf<IpcContract['settings']['get']>().toEqualTypeOf<
      <NS extends SettingsNamespace>(ns: NS) => SettingsByNs[NS]
    >()
    expectTypeOf<IpcContract['settings']['set']>().toEqualTypeOf<
      <NS extends SettingsNamespace>(ns: NS, patch: Partial<SettingsByNs[NS]>) => { ok: true }
    >()
    expectTypeOf<IpcContract['settings']['aiProfilesList']>().returns.toEqualTypeOf<
      AiProviderProfile[]
    >()
    expectTypeOf<IpcContract['settings']['aiProfilesCreate']>().parameters.toMatchTypeOf<
      [ProfileCreateInput]
    >()
    expectTypeOf<IpcContract['settings']['aiProfilesCreate']>().returns.toEqualTypeOf<{
      id: string
    }>()
    expectTypeOf<IpcContract['settings']['aiProfilesUpdate']>().parameters.toMatchTypeOf<
      [string, ProfileUpdateInput]
    >()
    expectTypeOf<IpcContract['settings']['aiProfilesDelete']>().parameters.toMatchTypeOf<[string]>()
    expectTypeOf<IpcContract['settings']['browserClearCookies']>().returns.toEqualTypeOf<{
      ok: true
    }>()
  })

  it('does NOT expose secret.* or getDecryptedKey on the contract', () => {
    type SettingsKeys = keyof IpcContract['settings']
    type ForbiddenKeys = SettingsKeys & ('secret' | 'getDecryptedKey' | 'aiProfilesGetDecryptedKey')
    expectTypeOf<ForbiddenKeys>().toEqualTypeOf<never>()
  })

  it("emits 'settings:changed' with SettingsChangedPayload", () => {
    expectTypeOf<IpcEventContract['settings:changed']>().toEqualTypeOf<SettingsChangedPayload>()
  })
})
