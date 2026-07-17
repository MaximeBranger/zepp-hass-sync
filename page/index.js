import { createWidget, widget, prop } from '@zos/ui'
import { getText } from '@zos/i18n'
import { LocalStorage } from '@zos/storage'
import { start } from '@zos/app-service'
import * as Styles from 'zosLoader:./index.[pf].layout.js'
import {
  APP_SERVICE_FILE,
  LOCAL_STORAGE_KEY_LAST_SYNC_ERROR,
  LOCAL_STORAGE_KEY_LAST_SYNC_STATUS,
  LOCAL_STORAGE_KEY_LAST_SYNC_TIME,
  MESSAGE_METHOD_GET_SETTINGS,
  SETTINGS_KEY_INTERVAL_MINUTES,
} from '../shared/constants'

const localStorage = new LocalStorage()

function formatStatusText() {
  const lastSyncTime = localStorage.getItem(LOCAL_STORAGE_KEY_LAST_SYNC_TIME, 0)
  const status = localStorage.getItem(LOCAL_STORAGE_KEY_LAST_SYNC_STATUS, '')
  const error = localStorage.getItem(LOCAL_STORAGE_KEY_LAST_SYNC_ERROR, '')

  if (!lastSyncTime) {
    return getText('noSyncYet')
  }

  const date = new Date(lastSyncTime * 1000)
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
  const line = `${getText('lastSync')}: ${time} (${status || '?'})`
  return error ? `${line}\n${error}` : line
}

Page({
  state: {
    statusText: null,
  },

  build() {
    this.state.statusText = createWidget(widget.TEXT, {
      ...Styles.STATUS_TEXT_STYLE,
      text: formatStatusText(),
    })

    createWidget(widget.BUTTON, {
      ...Styles.SYNC_BUTTON_STYLE,
      click_func: () => {
        start({
          file: APP_SERVICE_FILE,
          complete_func: () => {
            this.state.statusText.setProperty(prop.MORE, {
              text: formatStatusText(),
            })
          },
        })
      },
    })

    // Best-effort: refresh the watch's cached interval from the phone the moment
    // the app is opened, in case a setting changed since the last background sync.
    const messageBuilder = getApp()._options.globalData.messageBuilder
    if (messageBuilder) {
      messageBuilder
        .request({ method: MESSAGE_METHOD_GET_SETTINGS }, { timeout: 5000 })
        .then((result) => {
          if (result && result.intervalMinutes) {
            localStorage.setItem(SETTINGS_KEY_INTERVAL_MINUTES, result.intervalMinutes)
          }
        })
        .catch(() => {})
    }
  },
})
