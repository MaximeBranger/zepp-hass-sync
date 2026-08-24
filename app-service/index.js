import '../shared/device-polyfill'
import { MessageBuilder } from '../shared/message'
import { getPackageInfo } from '@zos/app'
import { log as Logger } from '@zos/utils'
import * as ble from '@zos/ble'
import { readSensors } from './sensors'
import { readStoredInterval } from '../shared/interval-storage'
import { recordServiceStart, recordSyncResult, recordTimerAvailable } from '../shared/sync-status'
import { MESSAGE_METHOD_SYNC } from '../shared/constants'

const logger = Logger.getLogger('hass-sync-service')

// This is a *long* service (started once via `@zos/app-service`'s start(), from app.js — see its
// comment) rather than the short-lived, alarm-woken kind. That switch exists because Zepp OS caps a
// short service's single execution, and a full BLE round trip (connect, request, await the phone's
// response) routinely took longer than that cap: the request would still reach the phone — so
// zepp2hass kept receiving fresh data — but the watch-side JS got cut off before it could record
// the result or clean up, so "Last synced" never updated and, worse, each cut-short cycle appears
// to have leaked its BLE connection (MessageBuilder.connect() registers a native receive callback
// that only `disConnect()` releases), eventually exhausting the device and forcing a reboot.
//
// A long service has no such cap, so it paces itself: run once, then reschedule the next run via
// its own setTimeout once this one has fully finished (success or failure) — never two cycles
// overlapping, never relying on an external scheduler to hand back control.

// MessageBuilder.request()'s own `timeout` only starts counting after its BLE
// handshake resolves — if that handshake never resolves, the request hangs
// forever with no error. This wraps it with a hard deadline regardless of
// handshake state.
//
// Zepp OS documents timer interfaces as unavailable in App Service context on some firmwares.
// Where that holds, referencing `setTimeout` bare inside the executor throws a ReferenceError
// synchronously, which the Promise constructor converts into an immediate rejection — so the
// "20 second deadline" would actually fail every sync at 0ms, and the recorded error would name
// the timeout rather than the missing API. Feature-detect instead, and be explicit that an
// undeadlined request is the fallback: hanging until the phone responds or the connection drops is
// worse than a deadline, but far better than failing instantly for a reason the error message
// misattributes. `recordTimerAvailable()` makes this observable on-screen (`t:0`/`t:1` in the
// diagnostic line) instead of only in a log nobody can see once the app isn't in the foreground.
function withTimeout(promise, ms, message) {
  recordTimerAvailable(typeof setTimeout === 'function')
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
    logger.log('app-service onInit (long service)')

    // start() being called again while this is already running isn't documented as a no-op, so
    // guard against onInit somehow running twice and stacking a second tick loop on top of the
    // first.
    if (this.ticking) return
    this.ticking = true

    this.tick()
  },

  // Runs a sync, then schedules the next one — only once this one has fully finished (its own
  // `finally` below has run), so cycles can never overlap even if a request runs long. Re-reads the
  // stored interval on every reschedule rather than trusting an in-memory value, so a change made
  // from the watch's +/- buttons or the phone's Settings screen takes effect on the next tick
  // without needing a way to reach into an already-running service from another JS context.
  tick() {
    this.runSync().finally(() => {
      if (typeof setTimeout !== 'function') {
        logger.error('setTimeout unavailable — cannot schedule the next sync in this context')
        return
      }
      const intervalMinutes = readStoredInterval()
      this.timer = setTimeout(() => this.tick(), intervalMinutes * 60 * 1000)
    })
  },

  async runSync() {
    // Written on every tick, before any BLE work — proof the loop is still alive and ticking,
    // independent of whether this particular cycle's BLE round trip succeeds. If this keeps
    // advancing but "Last synced" on the watch never does, a cycle is starting but not completing;
    // if this stops advancing entirely, the loop itself has died.
    recordServiceStart()

    let messageBuilder = null

    try {
      const { appId } = getPackageInfo()
      messageBuilder = new MessageBuilder({ appId, appDevicePort: 20, appSidePort: 0, ble })
      // Tracked on `this` so onDestroy() can reach it as a safety net — see onDestroy below.
      this.messageBuilder = messageBuilder
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
      // Deliberately not logging the full response for the same reason as the payload above:
      // JSON.stringify() of an arbitrary phone-supplied object on every cycle, in the most
      // memory-constrained context in the app, for a log nobody reads in the field.
      logger.log('got response: ok=' + (result && result.ok) + ' configured=' + (result && result.configured))

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
      this.messageBuilder = null
      // Deliberately no exit() here — a long service must keep running for the next tick. Calling
      // it would end the service the way it did for the old short-service model.
    }
  },

  onRun() {},

  // Runs when this service is stopped (explicitly, or by a system-level restriction). Clears the
  // pending tick so a stopped service can't fire one more cycle, and — same reasoning as the
  // per-cycle disConnect() above — releases the BLE connection if one was open when the stop
  // happened, so it can't be left dangling.
  onDestroy() {
    logger.log('app-service onDestroy')
    this.ticking = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    try {
      this.messageBuilder && this.messageBuilder.disConnect()
    } catch (error) {
      logger.error('onDestroy disConnect failed: ' + ((error && error.message) || error))
    }
    this.messageBuilder = null
  },
})
