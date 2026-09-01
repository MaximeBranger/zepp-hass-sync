// Watch-side persistent state, backed by JSON files in the mini program's `/data` directory
// (`@zos/fs`) rather than `@zos/storage`'s localStorage.
//
// Why not localStorage: on device it loses writes. Values written by the page at 08:23 (the
// permission diagnostics, the manual sync's timestamp) read back missing at 08:27, and the sync
// interval and diagnostics had already been observed "reverting to defaults after a few minutes".
// It also never carried a single byte from the App Service VM to the page VM — the service's
// per-tick heartbeat was written on every cycle and the page never once saw it.
//
// There is exactly one store, and exactly one context that touches it: the app/page VM. The App
// Service has none — it never loaded a storage module successfully in any build, and it now imports
// none at all (see app-service/index.js's header), reporting through the phone instead. So a
// read-modify-write is safe here: there is no second writer to race.
import { readFileSync, writeFileSync } from '@zos/fs'
import { log as Logger } from '@zos/utils'

const logger = Logger.getLogger('hass-sync-store')

export const PAGE_STORE = 'page-state.json'

// Returns `{}` for a file that doesn't exist yet, is empty, is unparseable, or can't be read at
// all. Never throws: every caller is a diagnostic or a status read, and none of them is worth
// taking down the context it runs in — least of all the App Service, where an escaping error ends
// the background sync entirely.
export function readStore(path) {
  try {
    const raw = readFileSync({ path, options: { encoding: 'utf8' } })
    // Documented to return `undefined` when the read fails, which includes "not created yet".
    if (typeof raw !== 'string' || raw === '') return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    logger.error('readStore(' + path + ') failed: ' + ((error && error.message) || error))
    return {}
  }
}

// Merges `patch` into `path`'s contents and writes the whole file back. Safe as a read-modify-write
// only because the app/page VM is the sole writer — see the header before adding a second one.
export function updateStore(path, patch) {
  try {
    const next = readStore(path)
    for (const key in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key]
    }
    writeFileSync({ path, data: JSON.stringify(next), options: { encoding: 'utf8' } })
    return true
  } catch (error) {
    logger.error('updateStore(' + path + ') failed: ' + ((error && error.message) || error))
    return false
  }
}

// Reads one field, collapsing both "file unreadable" and "field absent" to `fallback`. Callers rely
// on this to tell "never recorded" apart from a recorded falsy value, so `undefined` must never
// leak out: a missing value rendered as `false` rather than "unknown" is what once made the watch
// report a failure for a cycle that had never run.
export function readField(path, key, fallback) {
  const value = readStore(path)[key]
  return value === undefined ? fallback : value
}
