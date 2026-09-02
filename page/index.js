import { createWidget, widget, prop, getTextLayout } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { getText } from '@zos/i18n'
import { exit } from '@zos/router'
import { log as Logger } from '@zos/utils'
import { getPackageInfo } from '@zos/app'
import * as ble from '@zos/ble'
import * as Styles from 'zosLoader:./index.[pf].layout.js'
import { MessageBuilder } from '../shared/message'
import { readSensors } from '../app-service/sensors'
import { readConfig, writeConfig } from '../shared/config-storage'
import { scheduleSendAlarm } from '../shared/alarm'
import {
  getLastServiceStartResult,
  getSendStatus,
  hasPromptedForPermission,
  recordAlarm,
  recordBackgroundSummary,
  recordPermissionPrompted,
  recordServiceStartResult,
  recordSendResult,
} from '../shared/send-status'
import { ensureServiceRunning, isServiceRunning, requestBgServicePermission } from '../shared/service-boot'
import { formatDateTime } from '../shared/format-time'
import { DEFAULT_INTERVAL_MINUTES, MESSAGE_METHOD_GET_CONFIG, MESSAGE_METHOD_SEND } from '../shared/constants'

const logger = Logger.getLogger('hass-sync-page')

const COLOR_OK = 0x2ecc71
const COLOR_FAIL = 0xe74c3c
const COLOR_WARN = 0xf39c12
const COLOR_NEUTRAL = 0x999999

// The detail line wraps over up to three lines, so an error can be long enough to be diagnostic.
// The phone's Settings screen still holds the untruncated text.
const MAX_ERROR_CHARS = 90

// How long to keep re-attempting start() after the user grants the permission, and how far apart.
//
// This exists to test a hypothesis that has never been checked: on this firmware, accepting the
// dialog does not put the grant into effect for the already-running app — start() comes straight
// back with 3 (No Permission) — and the app has always concluded from that a restart is required.
// But nobody ever tried simply *waiting a moment and asking again*. If the grant lands
// asynchronously a second or two later, these retries pick it up and the restart step disappears
// entirely; if it genuinely needs a restart, they cost four seconds and the button says so.
//
// Timers work here. This is the page's VM, not the App Service's.
const GRANT_RETRY_ATTEMPTS = 3
const GRANT_RETRY_DELAY_MS = 1500

function truncate(text) {
  if (!text) return ''
  return text.length > MAX_ERROR_CHARS ? text.slice(0, MAX_ERROR_CHARS - 1) + '…' : text
}

// The display's own width, so the send row is centred on the device rather than on the design width
// its layout file was written against. The 390 bucket in particular covers screens that are not 390
// wide (Bip 5 is 320), and a hard-coded centre is visibly off on those.
function screenWidth(fallback) {
  try {
    const info = getDeviceInfo()
    if (info && info.width > 0) return info.width
  } catch (error) {
    logger.error('getDeviceInfo failed: ' + ((error && error.message) || error))
  }
  return fallback
}

// How wide `text` will actually render. Two earlier attempts at this row placed it from a guess at
// that width, and both were visibly off-centre — so it is measured.
//
// `getTextLayout` is not among `@zos/ui`'s typed exports in this SDK, only on the legacy `hmUI`
// object, so it may not be there at runtime. The guard is not defensive padding: if it is missing
// the row still has to be drawn, and the estimate below keeps it close. Digits and separators are
// the common case and they are near-uniform in width, which is what makes an estimate viable at
// all here.
function measureText(text, textSize, maxWidth) {
  if (typeof getTextLayout === 'function') {
    try {
      const layout = getTextLayout(text, { text_size: textSize, text_width: maxWidth })
      if (layout && layout.width > 0) return Math.min(maxWidth, Math.ceil(layout.width))
    } catch (error) {
      logger.error('getTextLayout failed: ' + ((error && error.message) || error))
    }
  }
  return Math.min(maxWidth, Math.ceil(text.length * textSize * 0.55))
}

// The verdict, as the colour of the dot beside the timestamp. No word: "Sent" next to a time it
// obviously refers to said nothing the colour doesn't, and it cost the row that now carries the
// time itself.
function sendStatusColor(status) {
  if (status.configured === false) return COLOR_WARN
  if (status.ok === null) return COLOR_NEUTRAL
  return status.ok ? COLOR_OK : COLOR_FAIL
}

// The line beside the dot: when the last send happened, or — in the two states where there is no
// time to show — why there isn't one. Kept short, because this row is a single unwrapped line.
function describeSendTime(status) {
  if (status.configured === false) return getText('statusWebhookMissing')
  if (!status.time) return getText('detailNothingSent')
  return formatDateTime(status.time)
}

// The wrapped line under it, which exists only when there is something to explain: the error from a
// failed send, or what to go and do about a missing webhook. Empty on a good day, so a healthy
// screen is the dot, the time, and nothing else.
function describeSendNote(status) {
  if (status.configured === false) return getText('detailSetWebhook')
  if (!status.time || status.ok) return ''
  return truncate(status.error)
}

// Runs `fn` once the current call stack has unwound, or immediately if this context has no timers.
//
// Used for the first-launch permission dialog, and the reason it isn't called directly from build():
// raising the dialog *during* the page's own construction is what produced the dead end this app
// spent so long in — it came back denied with nothing left on screen to say what had happened or how
// to retry, a state only reinstalling could escape. Deferring it by one turn means the page is fully
// built and rendered behind the dialog, so whatever the user answers, there is a working screen and
// a labelled button waiting underneath.
function defer(fn) {
  if (typeof setTimeout !== 'function') return fn()
  return setTimeout(fn, 0)
}

// Opens a short-lived BLE connection for exactly one request, then closes it — the same transient
// pattern app-service/index.js's exchange() uses. `@zos/ble` represents the one physical connection
// to the phone the whole app shares; holding a MessageBuilder connected for the page's entire open
// duration (the old design, via app.js's globalData) fought the background service's own
// connect/disconnect cycle for that shared connection, turning "Send now" into an indefinite hang
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
    sendDot: null,
    screenWidth: 0,
    sendTimeText: null,
    sendNoteText: null,
    configText: null,
    bgButton: null,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    configKnown: false,
    configured: null,
    configRequestInFlight: false,
    pullAgain: false,
    sendInFlight: false,
    // Set once start() has come back with 3 after the retries above have been exhausted, which is
    // the only state where restarting the app is genuinely the user's next step.
    needsRestart: false,
    retryInFlight: false,
  },

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  // Places the dot and the text as one centred pair, for whatever string the row is about to hold.
  // Both widgets are repositioned every time, because the string's width changes with it — a date
  // is short, "Aucune donnée envoyée" is not, and a row centred for one is off-centre for the other.
  layoutSendRow(text, color) {
    const dot = Styles.SEND_DOT_STYLE
    const label = Styles.SEND_TIME_TEXT_STYLE
    const gap = Styles.SEND_ROW_GAP

    const room = Styles.SEND_ROW_MAX_WIDTH - dot.w - gap
    const textWidth = measureText(text, label.text_size, room)
    const startX = Math.max(0, Math.round((this.state.screenWidth - (dot.w + gap + textWidth)) / 2))

    this.state.sendDot.setProperty(prop.MORE, { ...dot, x: startX, color })
    this.state.sendTimeText.setProperty(prop.MORE, {
      ...label,
      x: startX + dot.w + gap,
      w: textWidth,
      text,
    })
  },

  renderSendStatus(status) {
    this.layoutSendRow(describeSendTime(status), sendStatusColor(status))
    this.state.sendNoteText.setProperty(prop.MORE, { text: describeSendNote(status) })
  },

  // Transient states while a send is in flight ('Reading sensors…', 'Sending…'). They take the time
  // row, with the dot back to neutral and the note blanked — so the previous send's timestamp and
  // error cannot sit there reading as though they were this attempt's result.
  renderSendProgress(text) {
    this.layoutSendRow(text, COLOR_NEUTRAL)
    this.state.sendNoteText.setProperty(prop.MORE, { text: '' })
  },

  // What the watch last pulled from the phone. Reports only — the interval is edited on the phone's
  // Settings screen and nowhere else.
  renderConfig() {
    const text = this.state.configKnown
      ? getText('configEvery').replace('{n}', String(this.state.intervalMinutes))
      : getText('configUnknown')
    this.state.configText.setProperty(prop.MORE, { text })
  },

  // The background-send button, which is also the status line for whatever is blocking the worker.
  // Every branch here is a state a real device has been observed in, and each names the user's next
  // action rather than the internal failure — "Set webhook on phone" rather than `configured:false`.
  //
  // It disappears entirely once the worker is running: there is nothing left to do, and a permanent
  // amber "Background send: on" is a button that asks for attention it doesn't need. Hidden rather
  // than never created, because it has to be able to come back — an OS eviction, a webhook cleared
  // on the phone, or a permission revoked in system settings all put the app back into a state with
  // an action to offer, and the next render brings it straight back.
  renderBgButton() {
    if (isServiceRunning()) {
      this.state.bgButton.setProperty(prop.VISIBLE, false)
      return
    }

    let text
    if (this.state.needsRestart) text = getText('bgTapToRestart')
    else if (!this.state.configKnown) text = getText('bgWaitingForPhone')
    else if (this.state.configured === false) text = getText('bgSetWebhook')
    else text = getText('bgEnable')

    this.setBgButtonText(text)
  },

  // Transient labels ('Asking...', 'Starting…') go through here rather than straight to the widget:
  // the button is hidden whenever the worker is running, and a label set on a hidden button is a
  // message the user never sees.
  setBgButtonText(text) {
    this.state.bgButton.setProperty(prop.MORE, { text })
    this.state.bgButton.setProperty(prop.VISIBLE, true)
  },

  // ---------------------------------------------------------------------------
  // Config: pull only
  // ---------------------------------------------------------------------------

  // Asks the phone for the interval and whether a webhook is set. Cheap — no sensors are read and no
  // health data leaves the watch — so it runs automatically on every app open as well as from the
  // Refresh button. Automatic, because with the worker gated on a known config a button-only pull
  // would mean a fresh install never starts anything until the user happens to find the button.
  pullConfig(interactive) {
    // A tap that lands while the automatic pull from build() is still in flight is remembered rather
    // than dropped. Dropping it was a real defect: the app fires a pull on every open, so the moment
    // a user is most likely to tap Refresh is exactly the moment the guard was swallowing it — with
    // no feedback at all, which is indistinguishable from a refresh that ran and changed nothing.
    if (this.state.configRequestInFlight) {
      if (interactive) this.state.pullAgain = true
      return
    }

    this.state.configRequestInFlight = true
    if (interactive) this.state.configText.setProperty(prop.MORE, { text: getText('configRefreshing') })

    const settle = (failure) => {
      this.state.configRequestInFlight = false
      // A pull that failed means applyConfig() never ran, so nothing has started the worker this
      // time round. Fall back to the cached config — which is exactly the case this gate exists to
      // serve: a phone briefly out of range must not stop a watch that already knows its interval.
      //
      // Only on failure. The success path starts the worker from applyConfig(), with the config the
      // phone just gave it rather than the one from last time.
      if (failure) {
        this.maybeStartWorker()
        this.settleWorker()
      }
      // Only an interactive pull says anything about failing. The automatic one runs on every open
      // and would otherwise put an error on screen every time the phone is simply out of range.
      if (failure && interactive) {
        this.state.configText.setProperty(prop.MORE, { text: failure })
      } else {
        this.renderConfig()
      }
      if (this.state.pullAgain) {
        this.state.pullAgain = false
        this.pullConfig(true)
      }
    }

    withBle((messageBuilder) => messageBuilder.request({ method: MESSAGE_METHOD_GET_CONFIG }, { timeout: 15000 }))
      .then((result) => {
        logger.log('GET_CONFIG reply: ' + JSON.stringify(result))
        // A reply that arrives malformed is not the same as no reply, and used to be swallowed in
        // silence by an early return — the screen simply kept its old value, which reads exactly
        // like a phone that had nothing new to say.
        if (!result || !result.ok || !result.intervalMinutes) return settle(getText('configNoReply'))
        recordBackgroundSummary(result.background)
        // applyConfig() first, because it is what stores `configured` — and the status line's first
        // branch is "is a webhook set at all". Rendering ahead of it meant the very first pull after
        // an install drew the status from a store that did not know yet.
        this.applyConfig(result)
        // The reply carries the phone's record of the last send, which is how a background send
        // becomes visible here at all — so the status line is re-rendered even though this pull sent
        // no health data of its own. Without this, the automatic pull on every open cached a fresh
        // background send and left "Never sent" on screen beside it until the next manual tap.
        this.renderSendStatus(getSendStatus())
        settle()
      })
      .catch((error) => {
        logger.error('GET_CONFIG failed: ' + ((error && error.message) || error))
        // Settled first, and unconditionally: it is what clears the in-flight guard, and a render
        // that throws on the way there would leave the button dead for the rest of the page's life.
        // The cached config stands, and settle() is what starts the worker from it — an unreachable
        // phone must never un-know a config that was pulled successfully before, or background send
        // would stop the first time the watch went out of Bluetooth range.
        settle(getText('configRefreshFailed'))
      })
  },

  // Adopts a config the phone reported, from either a GET_CONFIG pull or a SEND reply — both carry
  // the same two fields, and there is no reason for the free one to be ignored.
  //
  // Nothing here restarts the service directly. maybeStartWorker() hands the interval to
  // ensureServiceRunning(), which leaves a service already keeping that pace alone and replaces one
  // that isn't. Deciding here instead is what made every "Send now" tap with a mismatched interval
  // restart the service and reset its tick counter.
  applyConfig(result) {
    if (!result || !result.intervalMinutes) return

    const previousInterval = this.state.intervalMinutes
    writeConfig({ intervalMinutes: result.intervalMinutes, configured: result.configured })

    const config = readConfig()
    this.state.intervalMinutes = config.intervalMinutes
    this.state.configured = config.configured
    this.state.configKnown = config.known

    this.renderConfig()
    // Only on an actual pace change. The alarm's period *is* the send interval, so it has to follow
    // — but re-setting it on every reply would cancel and recreate both alarms on every send, for
    // nothing. build() already re-sets them once per app open, which is what heals a lost one.
    if (config.intervalMinutes !== previousInterval) this.scheduleAlarm()
    this.maybeStartWorker()
    this.settleWorker()
  },

  // ---------------------------------------------------------------------------
  // Manual send
  // ---------------------------------------------------------------------------

  runSend() {
    if (this.state.sendInFlight) return
    this.state.sendInFlight = true
    this.renderSendProgress(getText('readingSensors'))

    let payload
    try {
      payload = readSensors()
    } catch (error) {
      this.state.sendInFlight = false
      logger.error('readSensors() failed: ' + ((error && error.message) || error))
      recordSendResult({ ok: false, error: (error && error.message) || String(error) })
      this.renderSendStatus(getSendStatus())
      return
    }

    logger.log('sending payload: ' + JSON.stringify(payload))
    this.renderSendProgress(getText('sending'))

    withBle((messageBuilder) => messageBuilder.request({ method: MESSAGE_METHOD_SEND, payload }, { timeout: 15000 }))
      .then((result) => {
        this.state.sendInFlight = false
        logger.log('got response: ' + JSON.stringify(result))
        recordSendResult({ ok: result && result.ok, error: result && result.error, configured: result && result.configured })
        // The phone is where the background service's history lives, so this reply is the watch's
        // only way to learn it. Cached before rendering so the next app open can show it without
        // another round trip.
        recordBackgroundSummary(result && result.background)
        this.applyConfig(result)
        this.renderSendStatus(getSendStatus())
      })
      .catch((error) => {
        this.state.sendInFlight = false
        logger.error('request failed: ' + ((error && error.message) || error))
        recordSendResult({ ok: false, error: `BLE request failed: ${(error && error.message) || error}` })
        this.renderSendStatus(getSendStatus())
      })
  },

  // ---------------------------------------------------------------------------
  // Background worker
  // ---------------------------------------------------------------------------

  // Starts the background service, but only once there is something real to start it with. Returns
  // true when the worker is up or has just been started.
  //
  // The two gates are the point. Before them, the app started a worker on the *default* interval
  // the moment it opened — so a watch whose user had configured 60 minutes sent every 5 until the
  // first reply arrived, and a watch with no webhook URL at all ran a service that woke up, read
  // every sensor, failed, and did it again forever. Neither is recoverable from inside the service:
  // it gets its interval once, as a start() param, and has no way to ask whether the effort is
  // wanted.
  maybeStartWorker() {
    if (!this.state.configKnown) {
      recordServiceStartResult('no-config')
      return false
    }
    if (this.state.configured === false) {
      recordServiceStartResult('no-webhook')
      return false
    }

    try {
      return ensureServiceRunning(this.state.intervalMinutes, () => this.renderBgButton())
    } catch (error) {
      logger.error('ensureServiceRunning failed: ' + ((error && error.message) || error))
      return false
    }
  },

  // Called after every maybeStartWorker(), and the single place that decides what the last start
  // attempt means. It always reads a *fresh* result: the paths that skip start() are exactly the
  // paths where the service is already running or a gate recorded its own marker, so a stale 3 from
  // a previous session can never reach the retry ladder.
  //
  // 3 (No Permission) right after a grant is the case worth retrying, and it can arrive from either
  // direction — the dialog being answered, or the config finally showing up minutes later and
  // unblocking a worker whose permission was granted long before. Centralising it here is what
  // stops the second one from silently ending on "Enable background send" for a permission the user
  // has already given.
  settleWorker() {
    if (!isServiceRunning() && !this.state.retryInFlight && getLastServiceStartResult() === 3) {
      this.retryStartAfterGrant(GRANT_RETRY_ATTEMPTS)
      return
    }
    this.renderBgButton()
  },

  scheduleAlarm() {
    try {
      recordAlarm(scheduleSendAlarm(this.state.intervalMinutes))
    } catch (error) {
      logger.error('scheduleSendAlarm failed: ' + ((error && error.message) || error))
    }
  },

  // ---------------------------------------------------------------------------
  // Permission
  // ---------------------------------------------------------------------------

  // What the background-send button does, which depends on what is currently blocking it.
  onBgButton() {
    if (isServiceRunning()) return
    if (this.state.needsRestart) return this.restartApp()
    // Nothing to enable yet: the config pull is what will unblock this, so nudge it along rather
    // than raising a permission dialog for a worker that still could not start.
    if (!this.state.configKnown) return this.pullConfig(true)
    this.requestPermission()
  },

  requestPermission() {
    this.setBgButtonText(getText('bgAsking'))

    const answered = () => {
      // The dialog's own reported code is never believed — this firmware reports 0 ("not
      // authorized") for a grant the user has just accepted. So the only thing consulted here is
      // what happens when the worker is actually asked to start, and even that only when the config
      // gate allows it: on a first launch this runs before the phone has ever been reached, and
      // starting a worker on the default interval is exactly what that gate prevents.
      this.maybeStartWorker()
      this.settleWorker()
    }

    try {
      requestBgServicePermission(answered)
    } catch (error) {
      logger.error('requestBgServicePermission failed: ' + ((error && error.message) || error))
      answered()
    }
  },

  // See GRANT_RETRY_ATTEMPTS. Only reached when start() said 3, which means the grant exists but is
  // not in effect for this running app yet.
  retryStartAfterGrant(attemptsLeft) {
    this.state.retryInFlight = true
    this.setBgButtonText(getText('bgStarting'))

    const give_up = () => {
      this.state.retryInFlight = false
      // Only now is "reopen the app" the honest instruction. Saying it any earlier would send the
      // user off to restart for a grant that was about to take effect on its own.
      this.state.needsRestart = !isServiceRunning()
      this.renderBgButton()
    }

    if (attemptsLeft <= 0 || typeof setTimeout !== 'function') return give_up()

    setTimeout(() => {
      this.maybeStartWorker()
      if (isServiceRunning()) {
        this.state.retryInFlight = false
        this.state.needsRestart = false
        this.renderBgButton()
        return
      }
      this.retryStartAfterGrant(attemptsLeft - 1)
    }, GRANT_RETRY_DELAY_MS)
  },

  // Closes the mini program so the user can reopen it, which is what actually puts a fresh grant
  // into effect. There is no API that restarts an app in place — `launchApp` navigates rather than
  // relaunching the process — so this makes the honest version of "reopen the app" one tap instead
  // of a swipe and a hunt for the icon.
  restartApp() {
    try {
      exit()
    } catch (error) {
      logger.error('exit failed: ' + ((error && error.message) || error))
    }
  },

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  build() {
    createWidget(widget.TEXT, Styles.TITLE_TEXT_STYLE)

    // Every button's `text` comes from getText() here rather than from the layout files. Those hold
    // the English string as a shape reference — it is what the box was sized around — but the label
    // the user reads is always the translated one.
    //
    // The primary action, created before its status lines so it sits at the top of the screen's
    // reading order as well as its layout.
    createWidget(widget.BUTTON, {
      ...Styles.SEND_BUTTON_STYLE,
      text: getText('sendNow'),
      click_func: () => this.runSend(),
    })

    // Seeded from the persisted status rather than from blanks, so the screen is already truthful
    // in the first frame — before the config pull below has had a chance to come back.
    const status = getSendStatus()
    this.state.screenWidth = screenWidth(Styles.SEND_ROW_MAX_WIDTH)
    this.state.sendDot = createWidget(widget.FILL_RECT, {
      ...Styles.SEND_DOT_STYLE,
      color: sendStatusColor(status),
    })
    this.state.sendTimeText = createWidget(widget.TEXT, { ...Styles.SEND_TIME_TEXT_STYLE, text: '' })
    this.state.sendNoteText = createWidget(widget.TEXT, {
      ...Styles.SEND_NOTE_TEXT_STYLE,
      text: describeSendNote(status),
    })
    // Both widgets exist now, so the pair can be placed for its actual contents.
    this.layoutSendRow(describeSendTime(status), sendStatusColor(status))

    const config = readConfig()
    this.state.intervalMinutes = config.intervalMinutes
    this.state.configured = config.configured
    this.state.configKnown = config.known

    this.state.configText = createWidget(widget.TEXT, { ...Styles.CONFIG_TEXT_STYLE, text: '' })
    createWidget(widget.BUTTON, {
      ...Styles.CONFIG_BUTTON_STYLE,
      text: getText('refreshConfig'),
      click_func: () => this.pullConfig(true),
    })
    // Created hidden, and shown only once something actually needs the user. Whether it is needed
    // is not known yet at this point: it depends on the config pull below, which takes a second or
    // two, so a button created visible flashed up on every open and then vanished — asking for
    // attention on the way to concluding it had nothing to ask.
    //
    // The reverse of the old default. Nothing here decides it stays hidden; renderBgButton() brings
    // it back the moment there is a blocking state to name.
    this.state.bgButton = createWidget(widget.BUTTON, {
      ...Styles.BG_BUTTON_STYLE,
      text: getText('bgEnable'),
      click_func: () => this.onBgButton(),
    })
    this.state.bgButton.setProperty(prop.VISIBLE, false)

    this.renderConfig()
    this.scheduleAlarm()

    // Every open, so a config change made on the phone reaches the watch without the user having to
    // remember to tap anything, and so a first launch reaches a usable state on its own.
    //
    // It goes *before* the worker is started, and that ordering is the whole point. Starting the
    // worker opens the service's own BLE connection and puts a payload on the wire immediately —
    // and `@zos/ble` is the single physical link the whole app shares, so the two requests fought
    // over one handshake. See app.js's header: this is the same collision that once turned "Send
    // now" into an indefinite hang.
    //
    // What made it so hard to see is that the automatic pull is deliberately silent about failing
    // (an out-of-range phone must not put an error on screen every open). So every open, the pull
    // lost the race and said nothing, the watch never learned about the sends the phone had
    // recorded, and a manual Refresh minutes later — with the radio long since free — worked
    // perfectly. The worker now starts from pullConfig()'s settle path instead, once the radio is
    // free again.
    this.pullConfig(false)

    this.promptForPermissionOnce()
  },

  // The first-launch permission dialog: raised once, ever, and deferred out of build() — see
  // defer(). Recorded as spent before it goes up, so a dialog the user swipes away without
  // answering does not come back on every subsequent open. After that the button is the only way to
  // raise it, which is the whole reason the button is always on screen.
  promptForPermissionOnce() {
    if (hasPromptedForPermission() || isServiceRunning()) return
    recordPermissionPrompted()
    defer(() => {
      try {
        this.requestPermission()
      } catch (error) {
        logger.error('first-launch permission prompt failed: ' + ((error && error.message) || error))
      }
    })
  },
})
