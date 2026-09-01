import { createWidget, widget, prop } from '@zos/ui'
import { SCROLL_MODE_FREE, setScrollMode } from '@zos/page'
import { exit } from '@zos/router'
import { log as Logger } from '@zos/utils'
import { getPackageInfo } from '@zos/app'
import * as ble from '@zos/ble'
import * as Styles from 'zosLoader:./index.[pf].layout.js'
import { MessageBuilder } from '../shared/message'
import { readSensors } from '../app-service/sensors'
import { readConfig, writeConfig } from '../shared/config-storage'
import { scheduleSyncAlarm } from '../shared/alarm'
import {
  getAlarm,
  getBackgroundSummary,
  getLastPermissionQuery,
  getLastPermissionRequest,
  getLastServiceStartResult,
  getSyncStatus,
  getServiceTrace,
  hasPromptedForPermission,
  recordAlarm,
  recordBackgroundSummary,
  recordPermissionPrompted,
  recordServiceStartResult,
  recordSyncResult,
} from '../shared/sync-status'
import { ensureServiceRunning, isServiceRunning, requestBgServicePermission } from '../shared/service-boot'
import { formatDateTime } from '../shared/format-time'
import {
  DEFAULT_INTERVAL_MINUTES,
  MESSAGE_METHOD_GET_CONFIG,
  MESSAGE_METHOD_SYNC,
  SERVICE_STAGE_OK,
} from '../shared/constants'

const logger = Logger.getLogger('hass-sync-page')

const COLOR_OK = 0x2ecc71
const COLOR_FAIL = 0xe74c3c
const COLOR_WARN = 0xf39c12
const COLOR_NEUTRAL = 0x999999

const MAX_ERROR_CHARS = 46

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

function describeStatus(status) {
  if (status.ok === null) return { text: 'Never synced', color: COLOR_NEUTRAL }
  if (status.configured === false) return { text: 'Webhook not configured', color: COLOR_WARN }
  if (status.ok) return { text: 'OK', color: COLOR_OK }
  return { text: `Failed: ${truncate(status.error)}`, color: COLOR_FAIL }
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
    bgButton: null,
    bootDiagnosticText: null,
    serviceDiagnosticText: null,
    serviceWasResident: null,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    configKnown: false,
    configured: null,
    configRequestInFlight: false,
    pullAgain: false,
    syncInFlight: false,
    // Set once start() has come back with 3 after the retries above have been exhausted, which is
    // the only state where restarting the app is genuinely the user's next step.
    needsRestart: false,
    retryInFlight: false,
  },

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  renderStatus(status) {
    const { text, color } = describeStatus(status)
    this.state.statusText.setProperty(prop.MORE, { text, color })
    this.state.lastSyncText.setProperty(prop.MORE, {
      text: status.time ? `Last: ${formatDateTime(status.time)}` : 'Last: never',
    })
    this.renderDiagnostics()
  },

  renderInterval() {
    this.state.intervalText.setProperty(prop.MORE, {
      text: this.state.configKnown ? `Every ${this.state.intervalMinutes} min` : 'Interval: unknown',
    })
  },

  // The background-sync button, which is also the status line for whatever is blocking the worker.
  // Every branch here is a state a real device has been observed in, and each names the user's next
  // action rather than the internal failure — "Set webhook on phone" rather than `configured:false`.
  //
  // It disappears entirely once the worker is running: there is nothing left to do, and a permanent
  // amber "Background sync: on" is a button that asks for attention it doesn't need. Hidden rather
  // than never created, because it has to be able to come back — an OS eviction, a webhook cleared
  // on the phone, or a permission revoked in system settings all put the app back into a state with
  // an action to offer, and the next render brings it straight back.
  renderBgButton() {
    if (isServiceRunning()) {
      this.state.bgButton.setProperty(prop.VISIBLE, false)
      return
    }

    let text
    if (this.state.needsRestart) text = 'Granted — tap to restart'
    else if (!this.state.configKnown) text = 'Waiting for phone…'
    else if (this.state.configured === false) text = 'Set webhook on phone'
    else text = 'Enable background sync'

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
    if (interactive) this.state.intervalText.setProperty(prop.MORE, { text: 'refreshing…' })

    const settle = (failure) => {
      this.state.configRequestInFlight = false
      // Only an interactive pull says anything about failing. The automatic one runs on every open
      // and would otherwise put an error on screen every time the phone is simply out of range.
      if (failure && interactive) {
        this.state.intervalText.setProperty(prop.MORE, { text: failure })
      } else {
        this.renderInterval()
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
        if (!result || !result.ok || !result.intervalMinutes) return settle('phone sent no config')
        recordBackgroundSummary(result.background)
        this.applyConfig(result)
        settle()
      })
      .catch((error) => {
        logger.error('GET_CONFIG failed: ' + ((error && error.message) || error))
        // The cached config stands. An unreachable phone must never un-know a config that was
        // pulled successfully before, or background sync would stop the first time the watch went
        // out of Bluetooth range.
        this.renderBgButton()
        settle('refresh failed')
      })
  },

  // Adopts a config the phone reported, from either a GET_CONFIG pull or a SYNC reply — both carry
  // the same two fields, and there is no reason for the free one to be ignored.
  //
  // Nothing here restarts the service directly. maybeStartWorker() hands the interval to
  // ensureServiceRunning(), which leaves a service already keeping that pace alone and replaces one
  // that isn't. Deciding here instead is what made every "Sync now" tap with a mismatched interval
  // restart the service and reset its tick counter.
  applyConfig(result) {
    if (!result || !result.intervalMinutes) return

    const previousInterval = this.state.intervalMinutes
    writeConfig({ intervalMinutes: result.intervalMinutes, configured: result.configured })

    const config = readConfig()
    this.state.intervalMinutes = config.intervalMinutes
    this.state.configured = config.configured
    this.state.configKnown = config.known

    this.renderInterval()
    // Only on an actual pace change. The alarm's period *is* the sync interval, so it has to follow
    // — but re-setting it on every reply would cancel and recreate both alarms on every sync, for
    // nothing. build() already re-sets them once per app open, which is what heals a lost one.
    if (config.intervalMinutes !== previousInterval) this.scheduleAlarm()
    this.maybeStartWorker()
    this.settleWorker()
  },

  // ---------------------------------------------------------------------------
  // Manual sync
  // ---------------------------------------------------------------------------

  runSync() {
    if (this.state.syncInFlight) return
    this.state.syncInFlight = true
    this.state.statusText.setProperty(prop.MORE, { text: 'reading sensors...', color: COLOR_NEUTRAL })

    let payload
    try {
      payload = readSensors()
    } catch (error) {
      this.state.syncInFlight = false
      logger.error('readSensors() failed: ' + ((error && error.message) || error))
      recordSyncResult({ ok: false, error: (error && error.message) || String(error) })
      this.renderStatus(getSyncStatus())
      return
    }

    logger.log('sending payload: ' + JSON.stringify(payload))
    this.state.statusText.setProperty(prop.MORE, { text: 'sending...', color: COLOR_NEUTRAL })

    withBle((messageBuilder) => messageBuilder.request({ method: MESSAGE_METHOD_SYNC, payload }, { timeout: 15000 }))
      .then((result) => {
        this.state.syncInFlight = false
        logger.log('got response: ' + JSON.stringify(result))
        recordSyncResult({ ok: result && result.ok, error: result && result.error, configured: result && result.configured })
        // The phone is where the background service's history lives, so this reply is the watch's
        // only way to learn it. Cached before rendering so the next app open can show it without
        // another round trip.
        recordBackgroundSummary(result && result.background)
        this.applyConfig(result)
        this.renderStatus(getSyncStatus())
      })
      .catch((error) => {
        this.state.syncInFlight = false
        logger.error('request failed: ' + ((error && error.message) || error))
        recordSyncResult({ ok: false, error: `BLE request failed: ${(error && error.message) || error}` })
        this.renderStatus(getSyncStatus())
      })
  },

  // ---------------------------------------------------------------------------
  // Background worker
  // ---------------------------------------------------------------------------

  // Starts the background service, but only once there is something real to start it with. Returns
  // true when the worker is up or has just been started.
  //
  // The two gates are the point. Before them, the app started a worker on the *default* interval
  // the moment it opened — so a watch whose user had configured 60 minutes synced every 5 until the
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
      return ensureServiceRunning(this.state.intervalMinutes, () => {
        this.renderBgButton()
        this.renderDiagnostics()
      })
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
  // stops the second one from silently ending on "Enable background sync" for a permission the user
  // has already given.
  settleWorker() {
    if (!isServiceRunning() && !this.state.retryInFlight && getLastServiceStartResult() === 3) {
      this.retryStartAfterGrant(GRANT_RETRY_ATTEMPTS)
      return
    }
    this.renderBgButton()
    this.renderDiagnostics()
  },

  scheduleAlarm() {
    try {
      recordAlarm(scheduleSyncAlarm(this.state.intervalMinutes))
    } catch (error) {
      logger.error('scheduleSyncAlarm failed: ' + ((error && error.message) || error))
    }
  },

  // ---------------------------------------------------------------------------
  // Permission
  // ---------------------------------------------------------------------------

  // What the background-sync button does, which depends on what is currently blocking it.
  onBgButton() {
    if (isServiceRunning()) return
    if (this.state.needsRestart) return this.restartApp()
    // Nothing to enable yet: the config pull is what will unblock this, so nudge it along rather
    // than raising a permission dialog for a worker that still could not start.
    if (!this.state.configKnown) return this.pullConfig(true)
    this.requestPermission()
  },

  requestPermission() {
    this.setBgButtonText('Asking...')

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
    this.setBgButtonText('Starting…')

    const give_up = () => {
      this.state.retryInFlight = false
      // Only now is "reopen the app" the honest instruction. Saying it any earlier would send the
      // user off to restart for a grant that was about to take effect on its own.
      this.state.needsRestart = !isServiceRunning()
      this.renderBgButton()
      this.renderDiagnostics()
    }

    if (attemptsLeft <= 0 || typeof setTimeout !== 'function') return give_up()

    setTimeout(() => {
      this.maybeStartWorker()
      if (isServiceRunning()) {
        this.state.retryInFlight = false
        this.state.needsRestart = false
        this.renderBgButton()
        this.renderDiagnostics()
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

    const config = readConfig()
    this.state.intervalMinutes = config.intervalMinutes
    this.state.configured = config.configured
    this.state.configKnown = config.known

    this.state.intervalText = createWidget(widget.TEXT, { ...Styles.INTERVAL_TEXT_STYLE, text: '' })
    createWidget(widget.BUTTON, { ...Styles.REFRESH_BUTTON_STYLE, click_func: () => this.pullConfig(true) })
    createWidget(widget.BUTTON, { ...Styles.SYNC_BUTTON_STYLE, click_func: () => this.runSync() })
    this.state.bgButton = createWidget(widget.BUTTON, {
      ...Styles.BG_BUTTON_STYLE,
      click_func: () => this.onBgButton(),
    })

    this.state.bootDiagnosticText = createWidget(widget.TEXT, { ...Styles.BOOT_DIAGNOSTIC_TEXT_STYLE, text: '' })
    this.state.serviceDiagnosticText = createWidget(widget.TEXT, { ...Styles.DIAGNOSTIC_TEXT_STYLE, text: '' })

    // Sampled before the service is touched, since afterwards it would always say "running". `0` is
    // the healthy answer: the service ends itself as soon as its sync completes, so between runs
    // there is nothing resident. A `1` here means a previous run was still going when you opened the
    // app — normally just a slow round trip, but a persistent `1` is a stuck one holding the slot,
    // and the alarm cannot start anything while it does.
    this.state.serviceWasResident = isServiceRunning()

    this.renderInterval()
    this.scheduleAlarm()
    this.maybeStartWorker()
    this.settleWorker()

    // Every open, so a config change made on the phone reaches the watch without the user having to
    // remember to tap anything, and so a first launch reaches a usable state on its own.
    this.pullConfig(false)

    this.promptForPermissionOnce()

    // Last, once every widget exists, so the page's scrollable extent is measured with the
    // diagnostics included — they are the reason this is here. Both blocks sit below the bottom of
    // the display, because they are too long to fit above it without being clipped (see the layout
    // files). Scrolling is what reaches them, and on a round watch it is also what makes them
    // legible: it lifts each block into the middle of the screen, where the full width is available
    // rather than the narrow chord near the bezel.
    //
    // Best-effort. A firmware that refuses this leaves the page exactly as usable as before for
    // everything above the fold, which is all of the actual controls.
    try {
      setScrollMode({ mode: SCROLL_MODE_FREE })
    } catch (error) {
      logger.error('setScrollMode failed: ' + ((error && error.message) || error))
    }
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

  // Renders two diagnostic blocks on screen rather than in a log, because the Zepp log viewer only
  // streams while the mini-program is in the foreground, which is not when background behaviour is
  // interesting. Re-runnable: it updates the widgets build() created rather than creating new ones,
  // so calling it again doesn't stack text on top of itself.
  //
  // Boot block — how far getting the service started got:
  //   `q:`   queryPermission for device:os.bg_service. 0 = not authorized, 1 = unknown permission,
  //          2 = authorized. After a dialog, the user's answer on that same scale.
  //   `r:`   what requestPermission *returned*. 0 = a dialog is up and its callback will fire,
  //          1 = nothing could be requested, 2 = already authorized. `?` until a dialog has been
  //          raised at least once.
  //   `st:`  start()'s return for the background service — 0 (or `true`) is success per the API
  //          docs. `no-config` means the phone has never been reached, so the pace is unknown and
  //          nothing was started; `no-webhook` means the phone has no webhook URL, so there is
  //          nothing to sync to; `needs-permission` means it's waiting for the button; `3` means a
  //          granted permission isn't in effect yet; `threw:...` means start() itself failed. Stale
  //          on an open that correctly left a healthy service alone: it is the last start's result,
  //          not this open's.
  //   `run:` whether the service was still resident when this app open began — sampled before the
  //          page touches it. `0` is the healthy value: the service ends itself once its sync is
  //          done, so between runs nothing is resident. A persistent `1` is a run stuck mid-sync,
  //          which blocks every alarm from starting anything until the system reclaims it.
  //   `al:`  the alarm that wakes the service, as `<id>/<cancelled>`. The id is 0 if it could not be
  //          set, which means nothing will sync in the background at all. The second number is how
  //          many stale alarms were swept before arming it, and it is the leak detector: `set()`
  //          adds an alarm rather than replacing one, so a number that climbs means the sweep is
  //          failing and alarms are accumulating — the fault that once buried this watch under a
  //          backlog. A rising *id* alone is normal: the system hands out fresh ids and never
  //          reuses them.
  //   `wd:`  the service's own breadcrumb, `<runs>/<done>:<last>` — see shared/constants.js. Counts
  //          only alarm-woken runs. `runs` bumps as the very first thing onInit does, so it records
  //          the wake-up itself; `done` bumps once the payload has been handed to the BLE stack.
  //          Both climbing together is what working looks like. `runs` climbing alone means each run
  //          is being killed before it can even send, which is how the 600ms cap was identified in
  //          the first place — `wd:10/0` across ten wake-ups.
  //
  //          `last` names what the most recent completed run reached: `sent`, `sensors` if reading
  //          them threw, `ble:...` if the send itself threw. A killed run leaves no code at all, so
  //          a stale `last` beside a climbing `runs` is itself the signature of being cut short.
  //
  //          Note what `sent` does *not* claim: the run never waits for a reply, so it cannot know
  //          whether the phone accepted the data. `a:` is the number that confirms that half, and
  //          the two are meant to be read together — `wd:` says the watch did its part, `a:` says
  //          the phone saw it.
  //
  //          Written with `@zos/fs`, which is only documented to work in that context while the
  //          screen is off — which is when an alarm fires, and it has been observed working there.
  //          A stubborn `0/0` could still in principle mean the write itself is failing.
  //
  // Service block — what the background service has actually done. All of it comes from the *phone*,
  // because the service cannot write watch-side storage at all (see app-service/index.js's header).
  // It is as fresh as the service's last message, no fresher; Refresh and Sync both update it.
  //   `hi:`  when the service last reached the phone at all — a sync, or its per-minute heartbeat.
  //   `bg:`  when a background sync last reached the phone.
  //   `n:`   how many syncs the service has delivered in total, and `a:` how many of those the
  //          repeating alarm caused rather than the app being opened. **`a:` is the number that says
  //          whether background sync works** — opening the app delivers a sync too, so the total
  //          climbs either way and proves nothing on its own. The trigger of the most recent one
  //          follows it: `wd` means the alarm fired, `page` means you opened the app.
  //   `t:`   which timer primitive the service's VM claims: `T` setTimeout, `I` setInterval only,
  //          `-` neither. Diagnostic only — the platform documents timers as non-functional there
  //          whatever this reports, which is why `T` was so misleading for so long.
  //   `e:`   the last stage the service reported: `sensors` reading them threw, `sync` the data was
  //          read but its round trip failed. Shown only when it is not `ok` — the full error text is
  //          on the phone's Settings screen, which has room for it.
  renderDiagnostics() {
    let bootText
    let serviceText
    try {
      const code = (value) => (value === null || value === undefined ? '?' : value)
      const at = (time) => (time ? formatDateTime(time).slice(-5) : 'never')
      const background = getBackgroundSummary()
      const alarm = getAlarm()

      const trace = getServiceTrace()
      bootText =
        `q:${code(getLastPermissionQuery())} r:${code(getLastPermissionRequest())} ` +
        `st:${code(getLastServiceStartResult())} run:${code(this.state.serviceWasResident === null ? null : this.state.serviceWasResident ? 1 : 0)} ` +
        `al:${code(alarm.id)}/${code(alarm.cancelled)} ` +
        `wd:${trace.runs}/${trace.done}${trace.last ? ':' + trace.last : ''}`
      const stage = background.stage && background.stage !== SERVICE_STAGE_OK ? ` e:${background.stage}` : ''
      const timer = background.timerMode ? ` t:${background.timerMode}` : ''
      serviceText =
        `hi:${at(background.helloTime)} bg:${at(background.lastTime)} ` +
        `n:${background.count}/a:${background.alarmCount}${background.trigger ? ':' + background.trigger : ''}` +
        `${timer}${stage}`
    } catch (error) {
      bootText = 'diag unavailable'
      serviceText = ''
      logger.error('renderDiagnostics failed: ' + ((error && error.message) || error))
    }

    this.state.bootDiagnosticText.setProperty(prop.MORE, { text: bootText })
    this.state.serviceDiagnosticText.setProperty(prop.MORE, { text: serviceText })
  },
})
