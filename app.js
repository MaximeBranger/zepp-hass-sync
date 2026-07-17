import './shared/device-polyfill'
import { MessageBuilder } from './shared/message'
import { getPackageInfo } from '@zos/app'
import { log as Logger } from '@zos/utils'
import * as ble from '@zos/ble'
import * as alarmMgr from '@zos/alarm'
import { LocalStorage } from '@zos/storage'
import {
  APP_SERVICE_FILE,
  DEFAULT_INTERVAL_MINUTES,
  LOCAL_STORAGE_KEY_ALARM_ID,
  LOCAL_STORAGE_KEY_INTERVAL_MINUTES,
} from './shared/constants'

const logger = Logger.getLogger('hass-sync-app')
const localStorage = new LocalStorage()

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

    // Seed the very first background sync alarm on install/first run. Every
    // subsequent alarm is (re)scheduled by app-service itself after each sync.
    if (!localStorage.getItem(LOCAL_STORAGE_KEY_ALARM_ID, 0)) {
      const intervalMinutes = localStorage.getItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES)
      const alarmId = alarmMgr.set({
        url: APP_SERVICE_FILE,
        delay: Math.max(1, intervalMinutes) * 60,
        repeat_type: alarmMgr.REPEAT_ONCE,
        store: true,
      })
      localStorage.setItem(LOCAL_STORAGE_KEY_ALARM_ID, alarmId)
    }
  },

  onDestroy() {
    logger.log('app onDestroy invoked')
    this.globalData.messageBuilder && this.globalData.messageBuilder.disConnect()
  },
})
