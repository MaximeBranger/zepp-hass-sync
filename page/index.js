import { createWidget, widget, prop } from '@zos/ui'
import { log as Logger } from '@zos/utils'
import { getPackageInfo } from '@zos/app'
import * as ble from '@zos/ble'
import * as Styles from 'zosLoader:./index.[pf].layout.js'
import { MessageBuilder } from '../shared/message'
import { readSensors } from '../app-service/sensors'
import { readStoredInterval, writeStoredInterval } from '../shared/interval-storage'
import {
  getLastServiceStart,
  getLastServiceStartResult,
  getLastTimerAvailable,
  getSyncStatus,
  recordSyncResult,
} from '../shared/sync-status'
import { formatDateTime } from '../shared/format-time'
import {
  DEFAULT_INTERVAL_MINUTES,
  INTERVAL_STEP_MINUTES,
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

// Opens a short-lived BLE connection for exactly one request, then closes it — the same transient
// pattern app-service/index.js's runSync() uses. `@zos/ble` represents the one physical connection
// to the phone the whole app shares; holding a MessageBuilder connected for the page's entire open
// duration (the old design, via app.js's globalData) fought the long-running service's own
// connect/disconnect cycle for that shared connection, turning "Sync now" into an indefinite hang
// on "sending..." whenever the two overlapped. Making both sides transient shrinks that overlap
// window down to the few seconds either one is actually mid-request.
function withBle(sendRequest) {
  let messageBuilder
  try {
    const { appId } = getPackageInfo()
    messageBuilder = new MessageBuilder({ appId, appDevicePort: 20, appSidePort: 0, ble })
    messageBuilder.connect()
  } catch (error) {
    return Promise.reject(error)
  }

  return sendRequest(messageBuilder).finally(() => {
    try {
      messageBuilder.disConnect()
    } catch (error) {
      logger.error('disConnect failed: ' + ((error && error.message) || error))
    }
  })
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

    withBle((messageBuilder) => messageBuilder.request({ method: MESSAGE_METHOD_SYNC, payload }, { timeout: 15000 }))
      .then((result) => {
        logger.log('got response: ' + JSON.stringify(result))
        recordSyncResult({ ok: result && result.ok, error: result && result.error, configured: result && result.configured })
        this.renderStatus(getSyncStatus())

        if (result && result.intervalMinutes && result.intervalMinutes !== this.state.intervalMinutes) {
          const applied = result.intervalMinutes
          // The long service re-reads this on its own next tick — see app-service/index.js's
          // tick(). No direct way to reach into an already-running service from this context.
          writeStoredInterval(applied)
          this.state.intervalMinutes = applied
          this.renderInterval(applied)
        }
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

    withBle((messageBuilder) =>
      messageBuilder.request({ method: MESSAGE_METHOD_SET_INTERVAL, payload: { intervalMinutes: candidate } }, { timeout: 15000 }),
    )
      .then((result) => {
        this.state.intervalRequestInFlight = false
        if (result && result.ok) {
          const applied = result.intervalMinutes
          writeStoredInterval(applied)
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

    this.state.intervalMinutes = clampIntervalMinutes(readStoredInterval())

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

    this.renderDiagnostics()
  },

  // Renders `st:<code> svc:<HH:MM> t:<0|1>`, on screen rather than logged because the Zepp log
  // viewer only streams while the mini-program is in the foreground, which is not when background
  // behaviour is interesting.
  //
  // `st:` is what app.js's start() call for the long service returned this app open — 0 means
  // success per the API docs; anything else (or `threw:...`) means the service was never even told
  // to start, which reads as "svc: never" below forever, indistinguishable on its own from a
  // service that started fine and then stalled.
  //
  // `svc:` is when the long-running app-service last *ticked* — written at the top of every
  // runSync(), before any BLE work, so it advances every cycle regardless of what happens after. If
  // this keeps advancing but "Last:" above never does, cycles are starting but not completing; if
  // it stops advancing entirely (with `st:0` confirming the service *was* told to start), the tick
  // loop itself has died.
  //
  // `t:` is whether `setTimeout` was actually callable in the App Service context during the last
  // cycle. `t:0` means that cycle's BLE request ran with no deadline at all — a stuck handshake
  // would then hang until the connection drops on its own, since nothing else in a long service
  // was going to reclaim the context for us.
  renderDiagnostics() {
    let text
    try {
      const startResult = getLastServiceStartResult()
      const svcStart = getLastServiceStart()
      const timerAvailable = getLastTimerAvailable()
      const svcTime = svcStart ? formatDateTime(svcStart).slice(-5) : 'never'
      const timerText = timerAvailable === null ? '?' : timerAvailable ? '1' : '0'
      text = `st:${startResult === null || startResult === undefined ? '?' : startResult} svc:${svcTime} t:${timerText}`
    } catch (error) {
      text = 'diag unavailable'
      logger.error('renderDiagnostics failed: ' + ((error && error.message) || error))
    }

    createWidget(widget.TEXT, { ...Styles.DIAGNOSTIC_TEXT_STYLE, text })
  },
})
