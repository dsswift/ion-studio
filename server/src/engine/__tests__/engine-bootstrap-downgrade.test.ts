/**
 * engine-bootstrap never downgrades the installed engine.
 *
 * An app packaged before the installed engine was built must not put its
 * older engine back on launch: doing so restarted the daemon onto a
 * downgraded build that no longer started agent sessions. A newer bundled
 * engine still replaces an older installed one.
 */

import path from 'path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const HOME = '/Users/testuser'
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..')
const plistTemplatePath = path.join(repoRoot, 'packaging', 'launchd', 'com.ion.engine.plist')
const bundledBinaryPath = path.join(repoRoot, 'engine', 'bin', 'ion')
const destBinaryPath = path.join(HOME, '.ion', 'bin', 'ion')
const plistDestPath = path.join(HOME, 'Library', 'LaunchAgents', 'com.ion.engine.plist')

const OLD = 'ion-engine engine-v2.1.1-1-g62ccb1713'
const NEW = 'ion-engine engine-v3.1.1-1-g778945267'

let fakeFs: Record<string, string> = {}
let versions: Record<string, string> = {}
const copiedFiles: Array<{ src: string; dst: string }> = []
const launchctlCalls: string[] = []
const binaryCalls: Array<{ file: string; args: string[] }> = []

vi.mock('net', () => ({
  createConnection: vi.fn(() => {
    const handlers: Record<string, () => void> = {}
    const conn = {
      once: (ev: string, cb: () => void) => {
        handlers[ev] = cb
        return conn
      },
      destroy: vi.fn(),
    }
    queueMicrotask(() => handlers.connect?.())
    return conn
  }),
}))

vi.mock('child_process', () => ({
  execFile: vi.fn((file: string, args: string[], opts: unknown, cb?: (err: Error | null, stdout?: string, stderr?: string) => void) => {
    launchctlCalls.push([file, ...args].join(' '))
    const done = typeof opts === 'function' ? (opts as typeof cb) : cb
    done?.(null, '', '')
  }),
  execFileSync: vi.fn((file: string, args: string[]) => {
    binaryCalls.push({ file, args })
    if (args[0] === 'version') return versions[file] ?? ''
    if (args[0] === 'install-assets') return '==> install-assets complete'
    return ''
  }),
}))

vi.mock('fs', () => ({
  existsSync: vi.fn((p: string) => p in fakeFs),
  readFileSync: vi.fn((p: string) => fakeFs[p] || ''),
  writeFileSync: vi.fn((p: string, content: string) => {
    fakeFs[p] = String(content)
  }),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn((src: string, dst: string) => {
    copiedFiles.push({ src, dst })
    fakeFs[dst] = fakeFs[src] || ''
  }),
  renameSync: vi.fn((src: string, dst: string) => {
    fakeFs[dst] = fakeFs[src] || ''
    delete fakeFs[src]
  }),
  chmodSync: vi.fn(),
}))

vi.mock('os', async (importOriginal) => ({ ...(await importOriginal<typeof import('os')>()), homedir: () => '/Users/testuser' }))

vi.mock('../../utils/atomicWrite', async (importOriginal) => ({ ...(await importOriginal()), ...{
  atomicWriteFileSync: vi.fn((p: string, content: string) => {
    fakeFs[p] = content
  }),
} }))

vi.mock('../../logger', () => ({ log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }))

import { ensureEngineDaemon } from '../engine-bootstrap'

const originalPlatform = process.platform

beforeEach(() => {
  copiedFiles.length = 0
  launchctlCalls.length = 0
  binaryCalls.length = 0
  versions = {}
  // The plist is already current, so only the binary decision can force a restart.
  fakeFs = {
    [plistTemplatePath]: '<string>$HOME/.ion/bin/ion</string>',
    [plistDestPath]: `<string>${HOME}/.ion/bin/ion</string>`,
    [bundledBinaryPath]: 'bundled-binary-bytes',
    [destBinaryPath]: 'installed-binary-bytes',
  }
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
})

function kickstart(): string | undefined {
  return launchctlCalls.find((c) => c.includes('launchctl kickstart'))
}

describe('engine-bootstrap with an installed engine of a different build', () => {
  it('keeps a newer installed engine: no copy, no install-assets, no forced restart', async () => {
    versions = { [bundledBinaryPath]: OLD, [destBinaryPath]: NEW }

    await ensureEngineDaemon()

    expect(copiedFiles).toEqual([])
    expect(fakeFs[destBinaryPath]).toBe('installed-binary-bytes')
    expect(binaryCalls.find((c) => c.args[0] === 'install-assets')).toBeUndefined()
    expect(kickstart()).toBeDefined()
    expect(kickstart()).not.toContain('-k')
  })

  it('replaces an older installed engine with the newer bundled one', async () => {
    versions = { [bundledBinaryPath]: NEW, [destBinaryPath]: OLD }

    await ensureEngineDaemon()

    expect(copiedFiles.map((c) => c.src)).toEqual([bundledBinaryPath])
    expect(fakeFs[destBinaryPath]).toBe('bundled-binary-bytes')
    expect(binaryCalls.find((c) => c.args[0] === 'install-assets')).toBeDefined()
    expect(kickstart()).toContain('-k')
  })

  it('replaces the installed engine when either build carries no version', async () => {
    versions = { [bundledBinaryPath]: OLD, [destBinaryPath]: 'ion-engine dev' }

    await ensureEngineDaemon()

    expect(copiedFiles.map((c) => c.src)).toEqual([bundledBinaryPath])
    expect(kickstart()).toContain('-k')
  })
})
