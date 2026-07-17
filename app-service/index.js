import '../shared/device-polyfill'
import { MessageBuilder } from '../shared/message'
import { getPackageInfo } from '@zos/app'
import { log as Logger } from '@zos/utils'
import * as ble from '@zos/ble'
import * as alarmMgr from '@zos/alarm'
import { exit } from '@zos/app-service'
import { LocalStorage } from '@zos/storage'
import { buildPayload } from './sensors'
import {
  APP_SERVICE_FILE,
  DEFAULT_INTERVAL_MINUTES,
  LOCAL_STORAGE_KEY_ALARM_ID,
  LOCAL_STORAGE_KEY_INTERVAL_MINUTES,
  LOCAL_STORAGE_KEY_LAST_SYNC_ERROR,
  LOCAL_STORAGE_KEY_LAST_SYNC_STATUS,
  LOCAL_STORAGE_KEY_LAST_SYNC_TIME,
  MESSAGE_METHOD_SYNC,
} from '../shared/constants'

const logger = Logger.getLogger('hass-sync-service')
const localStorage = new LocalStorage()

AppService({
  onInit() {
    this.runSync()
  },

  async runSync() {
    const { appId } = getPackageInfo()
    const messageBuilder = new MessageBuilder({ appId, appDevicePort: 20, appSidePort: 0, ble })
    messageBuilder.connect()

    let payload = null
    try {
      payload = buildPayload()
    } catch (error) {
      logger.error('buildPayload failed: %s', (error && error.message) || error)
    }

    let nextIntervalMinutes = localStorage.getItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES)

    if (payload) {
      try {
        // app-side performs the actual fetch() POST (only available phone-side, see
        // SPECIFICATIONS.md §3/§5) and echoes back the current interval so a setting
        // change made on the phone takes effect on the watch's next wake.
        const result = await messageBuilder.request({ method: MESSAGE_METHOD_SYNC, payload }, { timeout: 15000 })
        localStorage.setItem(LOCAL_STORAGE_KEY_LAST_SYNC_TIME, Math.floor(Date.now() / 1000))
        localStorage.setItem(LOCAL_STORAGE_KEY_LAST_SYNC_STATUS, result && result.ok ? 'ok' : 'error')
        localStorage.setItem(LOCAL_STORAGE_KEY_LAST_SYNC_ERROR, (result && result.error) || '')
        if (result && result.intervalMinutes) {
          nextIntervalMinutes = result.intervalMinutes
          localStorage.setItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, nextIntervalMinutes)
        }
      } catch (error) {
        localStorage.setItem(LOCAL_STORAGE_KEY_LAST_SYNC_TIME, Math.floor(Date.now() / 1000))
        localStorage.setItem(LOCAL_STORAGE_KEY_LAST_SYNC_STATUS, 'error')
        localStorage.setItem(LOCAL_STORAGE_KEY_LAST_SYNC_ERROR, String((error && error.message) || error))
      }
    }

    messageBuilder.disConnect()
    this.scheduleNext(nextIntervalMinutes)
    exit()
  },

  scheduleNext(intervalMinutes) {
    const oldAlarmId = localStorage.getItem(LOCAL_STORAGE_KEY_ALARM_ID, 0)
    if (oldAlarmId) {
      alarmMgr.cancel(oldAlarmId)
    }
    const newAlarmId = alarmMgr.set({
      url: APP_SERVICE_FILE,
      delay: Math.max(1, intervalMinutes) * 60,
      repeat_type: alarmMgr.REPEAT_ONCE,
      store: true,
    })
    localStorage.setItem(LOCAL_STORAGE_KEY_ALARM_ID, newAlarmId)
  },

  onRun() {},
  onDestroy() {},
})
