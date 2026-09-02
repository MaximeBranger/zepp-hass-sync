// Watch-side persistent state, backed by JSON files in the mini program's `/data` directory
// (`@zos/fs`) rather than `@zos/storage`'s localStorage.
//
// Why not localStorage: on device it loses writes. Values written by the page at 08:23 (the
// permission diagnostics, the manual send's timestamp) read back missing at 08:27, and the send
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

// The in-memory copy of each store this VM has touched, and the reason it exists.
//
// updateStore() is a read-modify-write of the whole file, and handling a single reply from the
// phone runs a chain of them: the send outcome, then the phone's summary, then the config, then the
// service-start diagnostics — five or more, back to back. That chain is only correct if a write is
// visible to the very next read, and on device it is not: the send record was written first and
// came back missing, while the config and start diagnostics written at the end of the same chain
// survived. Every later write in the chain had re-read the file's pre-chain contents and written
// them back over the earlier fields.
//
// So reads no longer go through the filesystem after the first one. The file is loaded once, and
// from then on this object is the truth: reads serve it, writes update it and then persist it. The
// filesystem becomes somewhere the state is *kept*, not somewhere it is read back from mid-chain.
//
// Safe for exactly the reason the header gives: one store, one writer. If a second context ever
// writes one of these files, its changes will not be seen by a VM that has already cached it.
// `SERVICE_TRACE_STORE` is the one file written elsewhere (by the App Service) — this VM only ever
// reads it, and only near the start of an app open, so its first read is the fresh one.
const cache = {}

function load(path) {
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

// Returns `{}` for a file that doesn't exist yet, is empty, is unparseable, or can't be read at
// all. Never throws: every caller is a diagnostic or a status read, and none of them is worth
// taking down the context it runs in — least of all the App Service, where an escaping error ends
// the background send entirely.
//
// The returned object is this module's own; callers read from it and must not mutate it.
export function readStore(path) {
  if (!cache[path]) cache[path] = load(path)
  return cache[path]
}

// Merges `patch` into the store and persists the whole thing. The merge is against the cached copy
// above, never against a fresh read, which is what makes a chain of these calls accumulate rather
// than overwrite each other.
//
// The in-memory state is updated even when the write fails, so a filesystem that refuses one write
// costs persistence across app opens rather than correctness within one.
export function updateStore(path, patch) {
  const next = readStore(path)
  for (const key in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key]
  }

  try {
    writeFileSync({ path, data: JSON.stringify(next), options: { encoding: 'utf8' } })
    return true
  } catch (error) {
    logger.error('updateStore(' + path + ') failed: ' + ((error && error.message) || error))
    return false
  }
}

// Drops the cached copies, so the next read goes back to the filesystem. Tests only — nothing in
// the app needs it, because a VM's cache lives exactly as long as the VM does.
export function resetStoreCache() {
  for (const path in cache) delete cache[path]
}

// Reads one field, collapsing both "file unreadable" and "field absent" to `fallback`. Callers rely
// on this to tell "never recorded" apart from a recorded falsy value, so `undefined` must never
// leak out: a missing value rendered as `false` rather than "unknown" is what once made the watch
// report a failure for a cycle that had never run.
export function readField(path, key, fallback) {
  const value = readStore(path)[key]
  return value === undefined ? fallback : value
}
