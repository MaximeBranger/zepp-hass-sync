import '../shared/device-polyfill'
import { MessageBuilder } from '../shared/message'
import { getPackageInfo } from '@zos/app'
import { log as Logger } from '@zos/utils'
import * as ble from '@zos/ble'
import { exit } from '@zos/app-service'
import { localStorage as deviceStorage } from '@zos/storage'
import { readSensors } from './sensors'
import { scheduleNext } from '../shared/alarm'
import { recordSyncResult } from '../shared/sync-status'
import { DEFAULT_INTERVAL_MINUTES, LOCAL_STORAGE_KEY_INTERVAL_MINUTES, MESSAGE_METHOD_SYNC } from '../shared/constants'

const logger = Logger.getLogger('hass-sync-service')

// `@zos/storage` is not documented as available in App Service context. Reading it must not be
// able to throw out of onInit, because everything after that point — including arming the next
// alarm — would be skipped, stopping background sync permanently after a single cycle.
function readStoredIntervalSafely() {
  try {
    const stored = deviceStorage.getItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES)
    const parsed = typeof stored === 'number' ? stored : parseInt(stored, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MINUTES
  } catch (error) {
    logger.error('reading stored interval failed: ' + ((error && error.message) || error))
    return DEFAULT_INTERVAL_MINUTES
  }
}

// MessageBuilder.request()'s own `timeout` only starts counting after its BLE
// handshake resolves — if that handshake never resolves, the request hangs
// forever with no error. This wraps it with a hard deadline regardless of
// handshake state.
//
// Zepp OS documents timer interfaces as unavailable in App Service context. Where that holds,
// referencing `setTimeout` bare inside the executor throws a ReferenceError synchronously, which
// the Promise constructor converts into an immediate rejection — so the "20 second deadline" would
// actually fail every sync at 0ms, and the recorded error would name the timeout rather than the
// missing API. Feature-detect instead, and be explicit that an undeadlined request is the
// fallback: hanging until the OS reclaims the service is worse than a deadline, but far better
// than failing instantly for a reason the error message misattributes.
function withTimeout(promise, ms, message) {
  if (typeof setTimeout !== 'function') {
    logger.error('setTimeout unavailable in this context — BLE request runs without a deadline')
    return promise
  }
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms)
    }),
  ])
}

AppService({
  onInit() {
    logger.log('app-service onInit')

    // Arm the *next* wake before attempting anything risky (sensor reads, BLE),
    // using the last known interval, so a catastrophic failure below can't also
    // silently stop future cycles. runSync() re-arms only if the phone reports a
    // *different* interval — re-arming unconditionally meant two `set()` calls per
    // cycle, which is harmless only for as long as cancelling reliably works.
    this.intervalMinutes = readStoredIntervalSafely()
    const alarmId = scheduleNext(this.intervalMinutes)
    if (!alarmId) {
      // `set()` reports failure by returning 0 rather than throwing. Unchecked, a
      // failed arm is indistinguishable from a successful one and background sync
      // is simply over with nothing logged anywhere.
      logger.error('alarm set() returned 0 — next wake NOT armed')
    }

    this.runSync()
  },

  async runSync() {
    let messageBuilder = null

    try {
      const { appId } = getPackageInfo()
      messageBuilder = new MessageBuilder({ appId, appDevicePort: 20, appSidePort: 0, ble })
      messageBuilder.connect()

      // Deliberately not logging the payload or its length: measuring it costs a full
      // extra JSON.stringify() of the whole object, in the most memory-constrained
      // context in the app, on every single cycle. json2buf() serialises it again on
      // the way out, so that made three copies of a multi-KB payload to produce one
      // number in a log nobody reads in the field.
      const payload = readSensors()

      const result = await withTimeout(
        messageBuilder.request({ method: MESSAGE_METHOD_SYNC, payload }, { timeout: 15000 }),
        20000,
        'BLE request to app-side timed out after 20s (handshake may never have completed)',
      )
      logger.log('got response: ' + JSON.stringify(result))

      // Only when it actually *changed* — onInit already armed the next wake at the
      // stored interval, and re-arming for an unchanged value is a second `set()` per
      // cycle for no benefit.
      if (result && result.intervalMinutes && result.intervalMinutes !== this.intervalMinutes) {
        this.intervalMinutes = result.intervalMinutes
        scheduleNext(result.intervalMinutes)
      }
      recordSyncResult({ ok: result && result.ok, error: result && result.error, configured: result && result.configured })
    } catch (error) {
      logger.error('runSync failed: ' + ((error && error.message) || error))
      recordSyncResult({ ok: false, error: (error && error.message) || String(error) })
    } finally {
      try {
        messageBuilder && messageBuilder.disConnect()
      } catch (error) {
        logger.error('disConnect failed: ' + ((error && error.message) || error))
      }
      try {
        exit()
      } catch (error) {
        logger.error('exit failed: ' + ((error && error.message) || error))
      }
    }
  },

  onRun() {},
  onDestroy() {},
})
