import { createWidget, widget, prop } from '@zos/ui'
import { log as Logger } from '@zos/utils'
import { localStorage as deviceStorage } from '@zos/storage'
import * as Styles from 'zosLoader:./index.[pf].layout.js'
import { readSensors } from '../app-service/sensors'
import { scheduleNext } from '../shared/alarm'
import { getSyncStatus, recordSyncResult } from '../shared/sync-status'
import { formatDateTime } from '../shared/format-time'
import {
  DEFAULT_INTERVAL_MINUTES,
  INTERVAL_STEP_MINUTES,
  LOCAL_STORAGE_KEY_INTERVAL_MINUTES,
  MESSAGE_METHOD_SET_INTERVAL,
  MESSAGE_METHOD_SYNC,
  clampIntervalMinutes,
} from '../shared/constants'

const logger = Logger.getLogger('hass-sync-page')

const COLOR_OK = 0x2ecc71
const COLOR_FAIL = 0xe74c3c
const COLOR_WARN = 0xf39c12
const COLOR_NEUTRAL = 0x999999

const MAX_ERROR_CHARS = 46

function truncate(text) {
  if (!text) return ''
  return text.length > MAX_ERROR_CHARS ? text.slice(0, MAX_ERROR_CHARS - 1) + '…' : text
}

function describeStatus(status) {
  if (status.ok === null) return { text: 'Never synced', color: COLOR_NEUTRAL }
  if (status.configured === false) return { text: 'Webhook not configured', color: COLOR_WARN }
  if (status.ok) return { text: 'OK', color: COLOR_OK }
  return { text: `Failed: ${truncate(status.error)}`, color: COLOR_FAIL }
}

Page({
  state: {
    statusText: null,
    lastSyncText: null,
    intervalText: null,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    intervalRequestInFlight: false,
  },

  renderStatus(status) {
    const { text, color } = describeStatus(status)
    this.state.statusText.setProperty(prop.MORE, { text, color })
    this.state.lastSyncText.setProperty(prop.MORE, {
      text: status.time ? `Last: ${formatDateTime(status.time)}` : 'Last: never',
    })
  },

  renderInterval(minutes) {
    this.state.intervalText.setProperty(prop.MORE, { text: `Every ${minutes} min` })
  },

  runSync() {
    this.state.statusText.setProperty(prop.MORE, { text: 'reading sensors...', color: COLOR_NEUTRAL })

    let payload
    try {
      payload = readSensors()
    } catch (error) {
      logger.error('readSensors() failed: ' + ((error && error.message) || error))
      recordSyncResult({ ok: false, error: (error && error.message) || String(error) })
      this.renderStatus(getSyncStatus())
      return
    }

    logger.log('sending payload: ' + JSON.stringify(payload))
    this.state.statusText.setProperty(prop.MORE, { text: 'sending...', color: COLOR_NEUTRAL })

    const messageBuilder = getApp()._options.globalData.messageBuilder
    messageBuilder
      .request({ method: MESSAGE_METHOD_SYNC, payload }, { timeout: 15000 })
      .then((result) => {
        logger.log('got response: ' + JSON.stringify(result))
        recordSyncResult({ ok: result && result.ok, error: result && result.error, configured: result && result.configured })
        this.renderStatus(getSyncStatus())
      })
      .catch((error) => {
        logger.error('request failed: ' + ((error && error.message) || error))
        const message = `BLE request failed: ${(error && error.message) || error}`
        recordSyncResult({ ok: false, error: message })
        this.renderStatus(getSyncStatus())
      })
  },

  requestIntervalChange(delta) {
    if (this.state.intervalRequestInFlight) return

    const candidate = clampIntervalMinutes(this.state.intervalMinutes + delta)
    if (candidate === this.state.intervalMinutes) return

    this.state.intervalRequestInFlight = true
    this.state.intervalText.setProperty(prop.MORE, { text: 'updating...' })

    const messageBuilder = getApp()._options.globalData.messageBuilder
    messageBuilder
      .request({ method: MESSAGE_METHOD_SET_INTERVAL, payload: { intervalMinutes: candidate } }, { timeout: 15000 })
      .then((result) => {
        this.state.intervalRequestInFlight = false
        if (result && result.ok) {
          const applied = result.intervalMinutes
          deviceStorage.setItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, applied)
          scheduleNext(applied)
          this.state.intervalMinutes = applied
          this.renderInterval(applied)
        } else {
          logger.error('SET_INTERVAL rejected: ' + JSON.stringify(result))
          this.renderInterval(this.state.intervalMinutes)
        }
      })
      .catch((error) => {
        this.state.intervalRequestInFlight = false
        logger.error('SET_INTERVAL request failed: ' + ((error && error.message) || error))
        this.renderInterval(this.state.intervalMinutes)
      })
  },

  build() {
    createWidget(widget.TEXT, Styles.TITLE_TEXT_STYLE)

    const status = getSyncStatus()
    const { text: statusInitialText, color: statusInitialColor } = describeStatus(status)
    this.state.statusText = createWidget(widget.TEXT, {
      ...Styles.STATUS_TEXT_STYLE,
      text: statusInitialText,
      color: statusInitialColor,
    })
    this.state.lastSyncText = createWidget(widget.TEXT, {
      ...Styles.LAST_SYNC_TEXT_STYLE,
      text: status.time ? `Last: ${formatDateTime(status.time)}` : 'Last: never',
    })

    this.state.intervalMinutes = clampIntervalMinutes(deviceStorage.getItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES))

    createWidget(widget.BUTTON, {
      ...Styles.INTERVAL_MINUS_BUTTON_STYLE,
      click_func: () => this.requestIntervalChange(-INTERVAL_STEP_MINUTES),
    })
    this.state.intervalText = createWidget(widget.TEXT, {
      ...Styles.INTERVAL_TEXT_STYLE,
      text: `Every ${this.state.intervalMinutes} min`,
    })
    createWidget(widget.BUTTON, {
      ...Styles.INTERVAL_PLUS_BUTTON_STYLE,
      click_func: () => this.requestIntervalChange(INTERVAL_STEP_MINUTES),
    })

    createWidget(widget.BUTTON, {
      ...Styles.SYNC_BUTTON_STYLE,
      click_func: () => this.runSync(),
    })
  },
})
