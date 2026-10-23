/**
 * app-lifecycle — the engine starts while a permission prompt is still open.
 *
 * A macOS permission prompt waits for an answer. Startup awaited the
 * permission checks before starting the engine, so a prompt nobody could
 * answer (a locked screen after an unattended reinstall) left the app with no
 * engine at all.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => { (globalThis as { __ION_DESKTOP_VERSION__?: string }).__ION_DESKTOP_VERSION__ = '1.0.0-test' })

let readyResolve: () => void
let readyPromise: Promise<void>

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '/fake/app',
    whenReady: vi.fn(() => readyPromise),
    on: vi.fn(),
    getPath: vi.fn(() => '/fake/userData'),
    dock: { hide: vi.fn() },
    quit: vi.fn(),
    exit: vi.fn(),
    name: 'Ion',
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  dialog: { showMessageBoxSync: vi.fn() },
  Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn(() => ({})) },
  powerMonitor: { on: vi.fn() },
  screen: { on: vi.fn() },
}))

vi.mock('../instance-guard', () => ({ detectRunningIon: vi.fn(() => null) }))
vi.mock('../deeplink-setup', () => ({
  claimSingleInstance: vi.fn(() => true),
  setupDeepLinks: vi.fn(),
  consumeLaunchUrl: vi.fn(() => null),
  bindDeepLinkRenderer: vi.fn(),
}))
vi.mock('../logger', () => ({
  log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
  flushLogs: vi.fn(), initLoggerMachineIdentity: vi.fn(), LOG_FILE: '/fake/desktop.jsonl',
}))
vi.mock('../crash-logging', () => ({ installMainCrashLogging: vi.fn() }))
vi.mock('../log-level', () => ({ applyConfiguredLogLevel: vi.fn() }))
vi.mock('@ion/server/machine-identity', () => ({ loadMachineIdentity: vi.fn(() => Promise.resolve({})) }))
vi.mock('@ion/server/utils/temp-dir', () => ({ pruneOperationDirs: vi.fn() }))
vi.mock('@ion/server/utils/secretStore', () => ({ migrateLegacySafeStorageSecrets: vi.fn() }))
vi.mock('../state', () => ({ state: { mainWindow: null, tray: null, forceQuit: false }, SPACES_DEBUG: false }))
vi.mock('../window-manager', () => ({ installContentSecurityPolicy: vi.fn(), snapshotWindowState: vi.fn() }))
vi.mock('../studio-window-manager', () => ({ focusStudioWindow: vi.fn(), isStudioWindowOpen: vi.fn(() => false), openStudioWindow: vi.fn() }))
vi.mock('../worktree-overlap-window', () => ({ focusWorktreeOverlapWindow: vi.fn() }))
vi.mock('../window-all-closed', () => ({ handleWindowAllClosed: vi.fn() }))
vi.mock('../permissions-preflight', () => ({ requestPermissions: vi.fn(() => new Promise<void>(() => {})) }))
vi.mock('@ion/server/git/focus-state', () => ({ focusState: { setFocused: vi.fn() } }))
vi.mock('@ion/server/persistence/settings-store', () => ({ ensureHybridBackendConfig: vi.fn(() => false) }))
vi.mock('@ion/server/engine/engine-bootstrap', () => ({ ensureEngineDaemon: vi.fn(() => Promise.resolve()) }))
vi.mock('@ion/server/engine/engine-supervisor', () => ({ supervisorFor: vi.fn(() => null) }))
vi.mock('../engine-egress-claim', () => ({ claimEngineEgressForDesktop: vi.fn(() => false) }))
vi.mock('../local-server-instance', () => ({ localServer: { start: vi.fn(() => Promise.resolve()), welcome: vi.fn(() => Promise.resolve(null)) } }))
vi.mock('@ion/server/oauth/entra-config', () => ({ ensureEntraAuthConfig: vi.fn(() => false) }))
vi.mock('../updater', () => ({ initAutoUpdater: vi.fn() }))
vi.mock('../host-install', () => ({ wireHostInstall: vi.fn() }))
vi.mock('../local-welcome', () => ({ disableAutoUpdateFrom: vi.fn(() => false), firstLocalWelcome: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@ion/server/watchdog', () => ({ startWatchdog: vi.fn(), setWatchdogSuspended: vi.fn() }))
vi.mock('../device-metrics', () => ({ startDeviceMetrics: vi.fn() }))
vi.mock('../login-item', () => ({ startLoginItem: vi.fn() }))
vi.mock('../connections/broker-instance', () => ({ broker: { latency: { start: vi.fn() }, sendAction: vi.fn(() => Promise.resolve({})) } }))
vi.mock('../connections/attention-reporter', () => ({ wireAttentionReporting: vi.fn() }))
vi.mock('../connections/environment-connect', () => ({ connectEnvironment: vi.fn(() => Promise.resolve()), renewRemoteEnvironmentsAfterWake: vi.fn() }))
vi.mock('../ipc/studio-bridge', () => ({ registerEnvironmentLabel: vi.fn() }))
vi.mock('../startup-window', () => ({ createStartupWindow: vi.fn() }))
vi.mock('../app-lifecycle-quit', () => ({ installQuitHandlers: vi.fn() }))
vi.mock('../app-lifecycle-egress', () => ({ initEgressFromEngineConfig: vi.fn(), initEgressFromSettingsConfig: vi.fn() }))
vi.mock('../startup-coordinator', () => ({
  failStartup: vi.fn(), isStartupRevealed: vi.fn(() => false), prepareStudioStartup: vi.fn(), reportStartup: vi.fn(),
  requireStartupAuthentication: vi.fn(),
}))
vi.mock('../spans', () => ({ launchTrace: () => ({ endAppLaunch: vi.fn() }) }))

import { setupAppLifecycle } from '../app-lifecycle'
import { requestPermissions } from '../permissions-preflight'
import { ensureEngineDaemon } from '@ion/server/engine/engine-bootstrap'

beforeEach(() => {
  vi.clearAllMocks()
  readyPromise = new Promise<void>((resolve) => { readyResolve = resolve })
})

describe('setupAppLifecycle — a permission prompt is waiting for an answer', () => {
  it('starts the engine without waiting for the prompt', async () => {
    setupAppLifecycle()
    readyResolve()
    await vi.waitFor(() => expect(ensureEngineDaemon).toHaveBeenCalled())

    expect(requestPermissions).toHaveBeenCalled()
  })
})
