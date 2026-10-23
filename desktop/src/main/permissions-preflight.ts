import { systemPreferences } from 'electron'
import { readdir } from 'fs/promises'
import { homedir } from 'os'
import { join, basename } from 'path'
import { log as _log } from './logger'

function log(msg: string, fields?: Record<string, unknown>): void {
  _log('main', msg, fields)
}

/**
 * Asks macOS for the permissions Ion uses, so each prompt appears at launch
 * rather than in the middle of a task. Listing a protected folder is what
 * raises its prompt, and the listing waits until the prompt is answered.
 * Every check is asynchronous, so a prompt nobody can answer yet (a locked
 * screen) never holds the main thread.
 */
export async function requestPermissions(): Promise<void> {
  if (process.platform !== 'darwin') {
    log('permissions_preflight: skipped', { platform: process.platform })
    return
  }

  try {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone')
    if (micStatus === 'not-determined') {
      await systemPreferences.askForMediaAccess('microphone')
    }
  } catch (err) {
    log('permissions_preflight: microphone check failed', { error: err instanceof Error ? err.message : String(err) })
  }

  const home = homedir()
  const tccProtectedDirs = [
    join(home, 'Desktop'),
    join(home, 'Documents'),
    join(home, 'Downloads'),
  ]
  for (const dir of tccProtectedDirs) {
    try {
      await readdir(dir)
      log('permissions_preflight: access ok', { dir: basename(dir) })
    } catch (err) {
      log('permissions_preflight: access failed', { dir: basename(dir), error: err instanceof Error ? err.message : String(err) })
    }
  }
}
