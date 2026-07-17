import '../shared/device-polyfill'
import { MessageBuilder } from '../shared/message'
import { getPackageInfo } from '@zos/app'
import { log as Logger } from '@zos/utils'
import * as ble from '@zos/ble'
import * as alarmMgr from '@zos/alarm'
import { exit } from '@zos/app-service'
import { localStorage as deviceStorage } from '@zos/storage'
import { readSensors } from './sensors'
import {
  APP_SERVICE_FILE,
  DEFAULT_INTERVAL_MINUTES,
  LOCAL_STORAGE_KEY_ALARM_ID,
  LOCAL_STORAGE_KEY_INTERVAL_MINUTES,
  MESSAGE_METHOD_SYNC,
} from '../shared/constants'

const logger = Logger.getLogger('hass-sync-service')

// MessageBuilder.request()'s own `timeout` only starts counting after its BLE
// handshake resolves — if that handshake never resolves, the request hangs
// forever with no error. This wraps it with a hard deadline regardless of
// handshake state.
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms)
    }),
  ])
}

// Cancels any previous alarm and arms the next one `intervalMinutes` from now,
// persisting both the new alarm id and the interval used (so the next wake, and
// app.js's self-heal check, both see the current value).
function scheduleNext(intervalMinutes) {
  const oldAlarmId = deviceStorage.getItem(LOCAL_STORAGE_KEY_ALARM_ID, 0)
  if (oldAlarmId) {
    alarmMgr.cancel(oldAlarmId)
  }
  const newAlarmId = alarmMgr.set({
    url: APP_SERVICE_FILE,
    delay: Math.max(1, intervalMinutes) * 60,
    repeat_type: alarmMgr.REPEAT_ONCE,
    store: true,
  })
  deviceStorage.setItem(LOCAL_STORAGE_KEY_ALARM_ID, newAlarmId)
  deviceStorage.setItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, intervalMinutes)
}

AppService({
  onInit() {
    logger.log('app-service onInit')

    // Arm the *next* wake before attempting anything risky (sensor reads, BLE),
    // using the last known interval, so a catastrophic failure below can't also
    // silently stop future cycles. runSync() re-arms again if the phone reports
    // a changed interval, using the fresher value.
    const intervalMinutes = deviceStorage.getItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES)
    scheduleNext(intervalMinutes)

    this.runSync()
  },

  async runSync() {
    let messageBuilder = null

    try {
      const { appId } = getPackageInfo()
      messageBuilder = new MessageBuilder({ appId, appDevicePort: 20, appSidePort: 0, ble })
      messageBuilder.connect()

      const payload = readSensors()
      logger.log('payload built, size=' + JSON.stringify(payload).length)

      const result = await withTimeout(
        messageBuilder.request({ method: MESSAGE_METHOD_SYNC, payload }, { timeout: 15000 }),
        20000,
        'BLE request to app-side timed out after 20s (handshake may never have completed)',
      )
      logger.log('got response: ' + JSON.stringify(result))

      if (result && result.intervalMinutes) {
        scheduleNext(result.intervalMinutes)
      }
    } catch (error) {
      logger.error('runSync failed: ' + ((error && error.message) || error))
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
