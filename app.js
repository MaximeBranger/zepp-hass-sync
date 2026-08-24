import './shared/device-polyfill'
import { MessageBuilder } from './shared/message'
import { getPackageInfo } from '@zos/app'
import { log as Logger } from '@zos/utils'
import * as ble from '@zos/ble'
import { ensureAlarmScheduled } from './shared/alarm'

const logger = Logger.getLogger('hass-sync-app')

App({
  globalData: {
    messageBuilder: null,
  },
  // Nothing here may throw. An uncaught error out of onCreate is not contained to the failing
  // step — the OS retries launching the app, which on a device where the failure is deterministic
  // becomes a relaunch loop.
  onCreate() {
    logger.log('app onCreate invoked')

    try {
      const { appId } = getPackageInfo()
      const messageBuilder = new MessageBuilder({ appId, appDevicePort: 20, appSidePort: 0, ble })
      this.globalData.messageBuilder = messageBuilder
      messageBuilder.connect()
    } catch (error) {
      logger.error('messageBuilder setup failed: ' + ((error && error.message) || error))
    }

    try {
      ensureAlarmScheduled()
    } catch (error) {
      logger.error('ensureAlarmScheduled failed: ' + ((error && error.message) || error))
    }
  },

  onDestroy() {
    logger.log('app onDestroy invoked')
    this.globalData.messageBuilder && this.globalData.messageBuilder.disConnect()
  },
})
