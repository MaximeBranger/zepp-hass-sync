import './shared/device-polyfill'
import { MessageBuilder } from './shared/message'
import { getPackageInfo } from '@zos/app'
import { log as Logger } from '@zos/utils'
import * as ble from '@zos/ble'
import * as alarmMgr from '@zos/alarm'
import { localStorage as deviceStorage } from '@zos/storage'
import {
  APP_SERVICE_FILE,
  DEFAULT_INTERVAL_MINUTES,
  LOCAL_STORAGE_KEY_ALARM_ID,
  LOCAL_STORAGE_KEY_INTERVAL_MINUTES,
} from './shared/constants'

const logger = Logger.getLogger('hass-sync-app')

// Re-arms the background sync alarm if it's missing or already consumed. A stored
// alarmId alone doesn't mean an alarm is still pending — REPEAT_ONCE alarms are
// consumed once fired, and if the very first alarm ever fails to fire, storage
// would otherwise keep pointing at a dead id forever, permanently stopping sync.
// Runs on every app open (not just first install) so it self-heals.
function ensureAlarmScheduled() {
  const alarmId = deviceStorage.getItem(LOCAL_STORAGE_KEY_ALARM_ID, 0)
  const stillActive = alarmId && alarmMgr.getAllAlarms().includes(alarmId)
  if (stillActive) return

  const intervalMinutes = deviceStorage.getItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES)
  const newAlarmId = alarmMgr.set({
    url: APP_SERVICE_FILE,
    delay: Math.max(1, intervalMinutes) * 60,
    repeat_type: alarmMgr.REPEAT_ONCE,
    store: true,
  })
  deviceStorage.setItem(LOCAL_STORAGE_KEY_ALARM_ID, newAlarmId)
}

App({
  globalData: {
    messageBuilder: null,
  },
  onCreate() {
    logger.log('app onCreate invoked')
    const { appId } = getPackageInfo()
    const messageBuilder = new MessageBuilder({ appId, appDevicePort: 20, appSidePort: 0, ble })
    this.globalData.messageBuilder = messageBuilder
    messageBuilder.connect()

    ensureAlarmScheduled()
  },

  onDestroy() {
    logger.log('app onDestroy invoked')
    this.globalData.messageBuilder && this.globalData.messageBuilder.disConnect()
  },
})
