import './shared/device-polyfill'
import { queryPermission, requestPermission } from '@zos/app'
import { log as Logger } from '@zos/utils'
import { start } from '@zos/app-service'
import { recordServiceStartResult } from './shared/sync-status'
import { APP_SERVICE_FILE } from './shared/constants'

const logger = Logger.getLogger('hass-sync-app')

// A *continuously running* App Service needs more than the `device:os.bg_service` entry in
// app.json's permissions field — that only makes the permission requestable. start() itself fails
// with error code 3 ("No Permission") until the user has explicitly granted it at runtime, which
// is what left the service never starting at all (`st:3`, `svc:never`, forever) despite the
// declaration being in place.
const BG_SERVICE_PERMISSION = 'device:os.bg_service'

// Starts the long-running background service if it isn't already running. Safe to call on every
// app open: if it's already running this errors harmlessly, which is exactly the state we want.
function startAppService() {
  try {
    const startResult = start({
      file: APP_SERVICE_FILE,
      complete_func: (result) => {
        logger.log('app-service start complete_func: ' + JSON.stringify(result))
      },
    })
    recordServiceStartResult(startResult)
    if (startResult !== 0) {
      logger.error('app-service start() returned ' + startResult)
    }
  } catch (error) {
    logger.error('app-service start() failed: ' + ((error && error.message) || error))
    recordServiceStartResult('threw:' + ((error && error.message) || error))
  }
}

// Checks for the bg_service permission first (queryPermission never prompts) so an already-granted
// device doesn't get re-prompted on every app open; only calls requestPermission (which can
// trigger a user-facing dialog) when it's actually missing.
function ensureBgServicePermissionThenStart() {
  try {
    const [status] = queryPermission({ permissions: [BG_SERVICE_PERMISSION] })
    if (status === 2) {
      startAppService()
      return
    }
  } catch (error) {
    logger.error('queryPermission failed: ' + ((error && error.message) || error))
  }

  try {
    requestPermission({
      permissions: [BG_SERVICE_PERMISSION],
      callback: (result) => {
        if (result && result[0] === 2) {
          startAppService()
        } else {
          logger.error('device:os.bg_service permission not granted: ' + JSON.stringify(result))
          recordServiceStartResult('permission-denied:' + JSON.stringify(result))
        }
      },
    })
  } catch (error) {
    logger.error('requestPermission failed: ' + ((error && error.message) || error))
    recordServiceStartResult('threw:' + ((error && error.message) || error))
  }
}

App({
  // Nothing here may throw. An uncaught error out of onCreate is not contained to the failing
  // step — the OS retries launching the app, which on a device where the failure is deterministic
  // becomes a relaunch loop.
  //
  // There is deliberately no BLE connection held here. `@zos/ble` represents a single physical
  // connection to the phone shared by the whole app, not one that can be split between multiple
  // independent MessageBuilder instances — a persistent one here, held for the app's entire open
  // duration, and the transient one app-service/index.js's long-running service opens and closes
  // every tick, then fight over that one connection's handshake state. That's what turned "Sync
  // now" into an indefinite hang on "sending...": the service could tear down or re-handshake the
  // shared connection out from under a request this page had already started. page/index.js now
  // opens its own short-lived MessageBuilder per tap instead, the same transient pattern the
  // service already uses — see its runSync() and requestIntervalChange().
  onCreate() {
    logger.log('app onCreate invoked')

    // Long service: starts once and keeps running (its own setTimeout loop paces the periodic
    // sync), rather than being woken by a repeating alarm.
    try {
      ensureBgServicePermissionThenStart()
    } catch (error) {
      logger.error('ensureBgServicePermissionThenStart failed: ' + ((error && error.message) || error))
    }
  },

  onDestroy() {
    logger.log('app onDestroy invoked')
  },
})
