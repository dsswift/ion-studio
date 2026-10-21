/**
 * The desktop starts the server before the engine is up, and replaces the
 * engine on a build whose bundled binary differs, so the first engine call
 * of a boot can land on no socket. Restoration must wait for the bridge's
 * reconnect instead of failing before the ready report.
 */
import { describe, expect, it, vi } from 'vitest'

const { bridge, reportStartup, createTab } = vi.hoisted(() => {
  // A hand-rolled emitter: vi.hoisted runs before any import, so
  // node:events is not available here.
  class FakeBridge {
    connected = false
    private listeners: Array<() => void> = []
    connect = vi.fn(async () => {
      throw new Error('Engine daemon not reachable')
    })
    once(_event: 'reconnected', fn: () => void): void {
      this.listeners.push(fn)
    }
    emit(_event: 'reconnected'): void {
      const fns = this.listeners
      this.listeners = []
      for (const fn of fns) fn()
    }
  }
  return { bridge: new FakeBridge(), reportStartup: vi.fn(), createTab: vi.fn(() => ({ tabId: 'boot-tab' })) }
})

vi.mock('../../logger', () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))
vi.mock('../../state', () => ({ engineBridge: bridge }))
vi.mock('../../config/current', () => ({ currentServerConfig: () => ({ homeProject: null }) }))
vi.mock('../../store/sessionStore', () => ({
  useSessionStore: {
    getState: () => ({ initStaticInfo: async () => undefined, staticInfo: { homePath: '/data/home/jdoe' }, tabs: [{ id: 'placeholder' }] }),
    setState: vi.fn(),
  },
}))
vi.mock('../../store/host-api-engine', () => ({ createTab: () => createTab() }))
vi.mock('../../store/host-api-misc', () => ({ loadTabs: async () => ({ tabs: [] }) }))
vi.mock('../../store/host-api', () => ({ reportStartup: (...a: unknown[]) => reportStartup(...a) }))
vi.mock('../../persistence/preferences', () => ({ usePreferencesStore: { getState: () => ({ defaultBaseDirectory: '/data/home/jdoe/orion' }) } }))
vi.mock('../../ipc-validation', () => ({ isValidProjectPath: () => true }))
vi.mock('../../integration/bench-attribution-support', () => ({ benchForPath: () => null }))
vi.mock('../boot-restore-tab', () => ({ restoreOneTab: vi.fn() }))
vi.mock('../tab-inbox-restore', () => ({ restoreSettledHistoryRecord: (r: unknown) => r }))
vi.mock('../useTabRestoration-helpers', () => ({}))
vi.mock('../useTabRestoration-progress', () => ({}))
vi.mock('../useTabRestoration-geometry', () => ({}))
vi.mock('../useTabRestoration-history', () => ({}))
vi.mock('../useTabRestoration-activity', () => ({}))

import { bootRestoreTabs } from '../boot-restore-tabs'

describe('boot restoration before the engine is reachable', () => {
  it('waits for the bridge to reconnect, tells the splash, then restores', async () => {
    let settled = false
    const run = bootRestoreTabs().then(() => {
      settled = true
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(bridge.connect).toHaveBeenCalledTimes(1)
    expect(reportStartup).toHaveBeenCalledWith('Waiting for the Ion engine…')
    expect(createTab).not.toHaveBeenCalled()
    expect(settled).toBe(false)

    bridge.connected = true
    bridge.emit('reconnected')
    await run

    expect(createTab).toHaveBeenCalledTimes(1)
    expect(reportStartup).toHaveBeenLastCalledWith('Workspace ready', true)
  })
})
