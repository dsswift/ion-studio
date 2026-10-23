/**
 * permissions-preflight — the launch-time permission checks never block the
 * main thread. Listing a protected folder waits until its macOS prompt is
 * answered; a synchronous listing froze the whole app, engine start included,
 * whenever the prompt went unanswered behind a locked screen.
 */

import { join } from 'path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const readdirMock = vi.fn((_dir: string) => Promise.resolve([] as string[]))
const readdirSyncMock = vi.fn()

vi.mock('electron', () => ({
  systemPreferences: { getMediaAccessStatus: vi.fn(() => 'granted'), askForMediaAccess: vi.fn() },
}))
vi.mock('fs/promises', () => ({ readdir: (dir: string) => readdirMock(dir) }))
vi.mock('fs', () => ({ readdirSync: (...args: unknown[]) => readdirSyncMock(...args) }))
vi.mock('os', async (importOriginal) => ({ ...(await importOriginal<typeof import('os')>()), homedir: () => '/Users/testuser' }))
vi.mock('../logger', () => ({ log: vi.fn() }))

import { requestPermissions } from '../permissions-preflight'

const originalPlatform = process.platform

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
})

describe('requestPermissions', () => {
  it('lists each protected folder asynchronously, never with a blocking read', async () => {
    await requestPermissions()

    expect(readdirSyncMock).not.toHaveBeenCalled()
    // Built with the host's own separators, as the code under test builds them.
    expect(readdirMock.mock.calls.map(([dir]) => dir)).toEqual(
      ['Desktop', 'Documents', 'Downloads'].map((name) => join('/Users/testuser', name)),
    )
  })

  it('keeps going past a folder it was refused', async () => {
    readdirMock.mockRejectedValueOnce(new Error('EPERM: operation not permitted'))

    await requestPermissions()

    expect(readdirMock).toHaveBeenCalledTimes(3)
  })
})
