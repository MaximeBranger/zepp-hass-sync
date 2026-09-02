// Watch-side only. Owns the one job of getting the long-running app-service actually running:
// check the runtime permission, request it if it's missing, then call start().
//
// Why this is its own module, and why page/index.js calls it rather than app.js's onCreate():
// requestPermission() triggers a *user-facing dialog*. Raising one from App.onCreate(), before any
// page exists, has no UI to attach to — the official Zepp OS sample does this check from a page for
// that reason. The page is also the only context that can show the outcome, which matters here
// because every branch below is a state a real device has been observed in.
//
// The bug this replaces: the old flow called requestPermission() and did all its work in the
// callback. But requestPermission() returns a code saying whether a callback is even coming —
//   0: a dialog is up, the callback WILL fire with the user's answer
//   1: there is nothing that can be requested — no dialog, and NO callback
//   2: already authorized, call the API right now — no dialog, and NO callback
// Returns 1 and 2 therefore left the callback pending forever: start() was never called, nothing
// was ever recorded, and the watch showed `st:? svc:never` indefinitely with no way to tell that
// state apart from "the app never even ran". Every path below now both acts and records.
//
// The other thing device testing established, which shapes the callback path: **the permission
// codes this API reports cannot be trusted as the answer**. Accepting the dialog on a first launch
// still reports 0 ("not authorized") in the callback — the grant only becomes visible to the app on
// a later open. So nothing here branches on a reported code to decide success or failure; it calls
// start() and reads *its* return value, which is the only thing that reflects what the OS will
// actually let the app do.
import { queryPermission, requestPermission } from '@zos/app'
import { getAllAppServices, start, stop } from '@zos/app-service'
import { log as Logger } from '@zos/utils'
import { recordPermissionQuery, recordPermissionRequest, recordServiceStartResult } from './send-status'
import { APP_SERVICE_FILE, SERVICE_TRIGGER_PAGE, encodeServiceParam } from './constants'

const logger = Logger.getLogger('hass-sync-boot')

const BG_SERVICE_PERMISSION = 'device:os.bg_service'

// queryPermission: 0 = not authorized, 1 = unknown permission, 2 = authorized.
const PERMISSION_GRANTED = 2
// requestPermission's return value: see the module comment above.
const REQUEST_DIALOG_PENDING = 0

function describeError(error) {
  return (error && error.message) || String(error)
}

// `start()` is documented both as returning 0 on success (with an ERROR_CODE table) and, in the
// bundled typings, as returning a boolean. Accept either rather than mislabelling a successful
// start as a failure on whichever firmware picked the other convention.
function isStartSuccess(result) {
  return result === 0 || result === true
}

// The authoritative answer to "is it running", straight from the OS, rather than inferring it from
// a start() return value recorded during some earlier app open. Never throws: this API is itself
// gated on the bg_service permission, so it can fail exactly when the interesting case is happening.
export function isServiceRunning() {
  try {
    const services = getAllAppServices()
    return Array.isArray(services) && services.indexOf(APP_SERVICE_FILE) !== -1
  } catch (error) {
    logger.error('getAllAppServices failed: ' + describeError(error))
    return false
  }
}

// Stops the resident service, then starts it again once the stop has completed — `stop()` is
// asynchronous and reports through `complete_func`, and starting before it has finished would just
// hit the still-resident instance again.
//
// Every app open does this to a resident service — see ensureServiceRunning for why residency is
// now always a fault rather than a state to preserve.
//
// This runs in the page's VM, where callbacks do work; the fallbacks below exist because the whole
// investigation has been a lesson in not assuming a callback will arrive.
export function restartService(intervalMinutes, onSettled = () => {}) {
  const settle = safely(onSettled)
  const startAndSettle = () => {
    startService(intervalMinutes)
    settle()
  }

  let stopResult
  try {
    stopResult = stop({
      file: APP_SERVICE_FILE,
      complete_func: (result) => {
        logger.log('app-service stop complete_func: ' + JSON.stringify(result))
        startAndSettle()
      },
    })
  } catch (error) {
    logger.error('app-service stop() failed: ' + describeError(error))
    recordServiceStartResult('stop-threw:' + describeError(error))
    startAndSettle()
    return
  }

  // A non-zero return means the stop never got under way, so no callback is coming — the same trap
  // requestPermission's return value set earlier in this file. Start anyway: a start() that hits a
  // still-resident service is a no-op, which is no worse than doing nothing at all.
  if (stopResult !== 0 && stopResult !== true) {
    logger.error('app-service stop() returned ' + stopResult)
    recordServiceStartResult('stop:' + stopResult)
    startAndSettle()
  }
}

// `param` is the service's only inbound channel: it cannot read watch-side storage, so the pace it
// must keep has to travel with the call that creates it, alongside the trigger that says the app
// opening is what started this run. See constants' encodeServiceParam.
function startService(intervalMinutes) {
  try {
    const startResult = start({
      file: APP_SERVICE_FILE,
      param: encodeServiceParam(SERVICE_TRIGGER_PAGE, intervalMinutes),
      complete_func: (result) => {
        logger.log('app-service start complete_func: ' + JSON.stringify(result))
      },
    })
    recordServiceStartResult(startResult)
    if (!isStartSuccess(startResult)) logger.error('app-service start() returned ' + startResult)
    return startResult
  } catch (error) {
    logger.error('app-service start() failed: ' + describeError(error))
    recordServiceStartResult('threw:' + describeError(error))
    return null
  }
}

// Returns queryPermission's status for the bg_service permission, or `fallback` when the call
// itself fails (a number keeps the diagnostic on the documented 0/1/2 scale; 'threw' when there is
// nothing better to report).
function queryBgServicePermission(fallback) {
  try {
    const [status] = queryPermission({ permissions: [BG_SERVICE_PERMISSION] })
    return status
  } catch (error) {
    logger.error('queryPermission failed: ' + describeError(error))
    return typeof fallback === 'number' ? fallback : 'threw'
  }
}

function requestThenStart(onAnswered) {
  let requestResult
  try {
    requestResult = requestPermission({
      permissions: [BG_SERVICE_PERMISSION],
      callback: (result) => {
        logger.log('bg_service dialog answered: ' + JSON.stringify(result))

        // The code this callback reports is deliberately NOT trusted. On device, accepting the
        // dialog still reports 0 ("not authorized") here — the grant only reads back as granted on
        // a later app open, so the answer simply isn't in effect yet at this moment. Believing it
        // is what produced `st:denied:0` on a first launch the user had actually accepted, and made
        // the app declare failure for a permission it had just been given.
        //
        // So: re-query for a fresher answer, and hand back to the caller, which decides whether
        // starting is even wanted and lets start()'s own return code be the ground truth — 0 if the
        // grant is already live, 3 (No Permission) if it isn't yet.
        recordPermissionQuery(queryBgServicePermission(result && result[0]))
        onAnswered()
      },
    })
  } catch (error) {
    logger.error('requestPermission failed: ' + describeError(error))
    recordPermissionRequest('threw')
    onAnswered()
    return
  }

  recordPermissionRequest(requestResult)

  // Only return 0 means a callback is coming. For 1 ("nothing to request") and 2 ("already
  // authorized") no dialog is shown and the callback never fires, so this is the last chance to
  // act — and it is the path the old code fell through silently, leaving the app waiting forever on
  // a callback that was never going to arrive.
  if (requestResult !== REQUEST_DIALOG_PENDING) onAnswered()
}

function safely(onSettled) {
  return () => {
    try {
      onSettled()
    } catch (error) {
      logger.error('onSettled failed: ' + describeError(error))
    }
  }
}

// The silent path, safe to run on every page build: it never raises a dialog. Returns `true` when
// the background service is up (or has just been started), `false` when it can't be without the
// user granting the permission first — which is the caller's cue to offer requestBgServicePermission
// below on an explicit tap.
//
// Deliberately no auto-prompt here. Raising the permission dialog from inside build() runs it
// against the page's own construction, and on device that came back denied with nothing left on
// screen to say what had happened or how to retry. A dialog the user asked for by tapping a labelled
// button is unambiguous, retryable, and can't race a render.
export function ensureServiceRunning(intervalMinutes, onSettled = () => {}) {
  const settle = safely(onSettled)

  // A resident service is always replaced, never left alone. Residency is no longer a healthy state
  // at all: the service ends itself the moment its send completes, precisely so the next alarm finds
  // the slot free. One still listed is therefore either mid-send — a few seconds, and no loss in
  // replacing it — or stuck, and a stuck one is fatal rather than untidy, because `start()` against
  // a live service is a no-op, so no alarm can ever get past it. Every firing from then on does
  // nothing, silently, forever.
  //
  // Which makes opening the app the one reliable way to clear it, so it always does. This also heals
  // a watch carrying a resident service left behind by an older build of this app, which is exactly
  // the state that produced `run:1 a:0` on device.
  if (isServiceRunning()) {
    logger.log('app-service still resident — replacing it to free the slot')
    restartService(intervalMinutes, settle)
    return true
  }

  const queryResult = queryBgServicePermission()
  recordPermissionQuery(queryResult)

  if (queryResult === PERMISSION_GRANTED) {
    startService(intervalMinutes)
    settle()
    return true
  }

  // Recorded so the diagnostic line distinguishes "waiting for the user to tap Enable" from the
  // paths where start() was reached and failed on its own terms (`3` = the grant isn't in effect
  // yet, `threw:...` = the call itself broke).
  recordServiceStartResult('needs-permission')
  settle()
  return false
}

// Raises the permission dialog. `onAnswered` fires once the attempt has resolved — after the user
// answers, hence a callback rather than a return value — and on every path, including the two where
// no dialog appears and no callback ever comes.
//
// It deliberately does NOT start the service. Asking for the permission and deciding the worker
// should run are separate questions, and conflating them was a real bug: the dialog is raised on
// first launch, before the phone has been reached, so a grant would have started a worker on the
// *default* interval — the exact thing the caller's config gate exists to prevent. The caller
// decides, in its `onAnswered`, and start()'s return code is still the ground truth for whether the
// grant is actually in effect.
export function requestBgServicePermission(onAnswered = () => {}) {
  requestThenStart(safely(onAnswered))
}
