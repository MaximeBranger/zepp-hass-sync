import { MessageBuilder } from '../shared/message-side'
import { formatForZepp2Hass } from './format'
import {
  MESSAGE_METHOD_GET_CONFIG,
  MESSAGE_METHOD_SERVICE_REPORT,
  MESSAGE_METHOD_SEND,
  MESSAGE_SOURCE_SERVICE,
  SERVICE_STAGE_OK,
  SETTINGS_KEY_LAST_TRIGGER,
  isUnattendedTrigger,
  SETTINGS_KEY_BG_ALARM_SEND_COUNT,
  SETTINGS_KEY_BG_SEND_COUNT,
  SETTINGS_KEY_SEND_INTERVAL_MINUTES,
  SETTINGS_KEY_LAST_BG_SEND_TIME,
  SETTINGS_KEY_LAST_SERVICE_HELLO,
  SETTINGS_KEY_SERVICE_DETAIL,
  SETTINGS_KEY_SERVICE_REPORT_TIME,
  SETTINGS_KEY_SERVICE_STAGE,
  SETTINGS_KEY_SERVICE_TIMER_MODE,
  SETTINGS_KEY_LAST_SEND_ERROR,
  SETTINGS_KEY_LAST_SEND_OK,
  SETTINGS_KEY_LAST_SEND_TIME,
  SETTINGS_KEY_WEBHOOK_URL,
  clampIntervalMinutes,
} from '../shared/constants'

const messageBuilder = new MessageBuilder()
// `Logger` and `settings` are injected as ambient globals into the app-side context.
const logger = Logger.getLogger('hass-sync-app-side')

function getWebhookUrl() {
  return settings.settingsStorage.getItem(SETTINGS_KEY_WEBHOOK_URL) || ''
}

function getIntervalMinutes() {
  return clampIntervalMinutes(settings.settingsStorage.getItem(SETTINGS_KEY_SEND_INTERVAL_MINUTES))
}

function now() {
  return Math.floor(Date.now() / 1000)
}

function readNumber(key) {
  const raw = parseInt(settings.settingsStorage.getItem(key), 10)
  return Number.isFinite(raw) ? raw : 0
}

function recordSendResult({ ok, error }) {
  settings.settingsStorage.setItem(SETTINGS_KEY_LAST_SEND_OK, String(!!ok))
  settings.settingsStorage.setItem(SETTINGS_KEY_LAST_SEND_ERROR, error || '')
  settings.settingsStorage.setItem(SETTINGS_KEY_LAST_SEND_TIME, String(now()))
}

// The phone is where the background service's own history lives — see the constants' comment for
// why it can't live on the watch. Counted, not just timestamped: a count that climbs is the proof
// that the service is looping rather than having run once.
function recordBackgroundSend(trigger) {
  settings.settingsStorage.setItem(SETTINGS_KEY_LAST_BG_SEND_TIME, String(now()))
  settings.settingsStorage.setItem(SETTINGS_KEY_BG_SEND_COUNT, String(readNumber(SETTINGS_KEY_BG_SEND_COUNT) + 1))
  // The count that answers whether background send works at all. The total above rises whenever the
  // app is opened, since opening it starts the service; only this one rises on its own.
  settings.settingsStorage.setItem(SETTINGS_KEY_LAST_TRIGGER, String(trigger || '?'))
  if (isUnattendedTrigger(trigger)) {
    settings.settingsStorage.setItem(SETTINGS_KEY_BG_ALARM_SEND_COUNT, String(readNumber(SETTINGS_KEY_BG_ALARM_SEND_COUNT) + 1))
  }
}

// Any message from the background service is proof it ran this cycle, and carries the timer mode its
// VM offers. Recorded on *arrival*, so it survives a reply that never finds its way back to the
// watch — a distinction that cost several rounds of debugging to notice.
function recordServiceContact(timerMode) {
  settings.settingsStorage.setItem(SETTINGS_KEY_LAST_SERVICE_HELLO, String(now()))
  if (timerMode) settings.settingsStorage.setItem(SETTINGS_KEY_SERVICE_TIMER_MODE, String(timerMode))
}

function recordServiceReport({ stage, detail }) {
  settings.settingsStorage.setItem(SETTINGS_KEY_SERVICE_STAGE, String(stage || ''))
  settings.settingsStorage.setItem(SETTINGS_KEY_SERVICE_DETAIL, String(detail || ''))
  settings.settingsStorage.setItem(SETTINGS_KEY_SERVICE_REPORT_TIME, String(now()))
}

// Attached to every SEND response so the watch face can show the background service's state without
// reading any watch-side storage — the round trip it already makes carries the answer back.
//
// `sendOk/sendTime/sendError` are the phone's record of the last send it handled from either side,
// and they are what the watch face's status line is actually built from. The watch cannot observe a
// background send on its own: the service that performs one has no access to watch-side storage, so
// nothing on the watch changes when it succeeds. Sending the outcome back here is the only path.
function backgroundSummary() {
  return {
    sendOk: settings.settingsStorage.getItem(SETTINGS_KEY_LAST_SEND_OK) === 'true',
    sendTime: readNumber(SETTINGS_KEY_LAST_SEND_TIME),
    sendError: settings.settingsStorage.getItem(SETTINGS_KEY_LAST_SEND_ERROR) || '',
    helloTime: readNumber(SETTINGS_KEY_LAST_SERVICE_HELLO),
    lastTime: readNumber(SETTINGS_KEY_LAST_BG_SEND_TIME),
    count: readNumber(SETTINGS_KEY_BG_SEND_COUNT),
    alarmCount: readNumber(SETTINGS_KEY_BG_ALARM_SEND_COUNT),
    trigger: settings.settingsStorage.getItem(SETTINGS_KEY_LAST_TRIGGER) || '',
    stage: settings.settingsStorage.getItem(SETTINGS_KEY_SERVICE_STAGE) || '',
    timerMode: settings.settingsStorage.getItem(SETTINGS_KEY_SERVICE_TIMER_MODE) || '',
    detail: settings.settingsStorage.getItem(SETTINGS_KEY_SERVICE_DETAIL) || '',
  }
}

async function sendToWebhook(payload) {
  const url = getWebhookUrl()
  if (!url) {
    logger.error('no webhook URL configured')
    return { ok: false, configured: false, error: 'webhook URL not configured — set it in the app settings' }
  }

  const body = formatForZepp2Hass(payload)
  logger.log('calling fetch() -> ' + url + ' body=' + JSON.stringify(body))
  try {
    const response = await fetch({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    logger.log('fetch() resolved: ' + JSON.stringify(response))
    const status = response && response.status
    if (status >= 200 && status < 300) {
      return { ok: true, configured: true }
    }
    return { ok: false, configured: true, error: `webhook responded with status ${status}` }
  } catch (error) {
    logger.error('fetch() threw: ' + ((error && error.message) || error))
    return { ok: false, configured: true, error: String((error && error.message) || error) }
  }
}

AppSideService({
  onInit() {
    logger.log('app-side onInit')
    messageBuilder.listen(() => {})

    messageBuilder.on('request', (ctx) => {
      const request = messageBuilder.buf2Json(ctx.request.payload)
      logger.log('received request, method=' + request.method)

      // Proof of life from the background service, sent before it touches a sensor. Answered with
      // the interval so the service can pace itself from this alone, without reading any watch-side
      // storage — see the constants' comment on SETTINGS_KEY_LAST_SERVICE_HELLO.
      // How the background service reports what it is doing and what failed — it has no watch-side
      // storage to write to. Answered immediately and cheaply: the service is often mid-failure when
      // it sends one, and must not be made to wait.
      if (request.method === MESSAGE_METHOD_SERVICE_REPORT) {
        const { stage, detail, timerMode } = request.payload || {}
        recordServiceContact(timerMode)
        // Only when a stage is actually named. Recording an empty one would erase the error left by
        // a failed send — the one thing the watch face needs most at exactly that moment.
        if (stage) recordServiceReport({ stage, detail })
        logger.log('service report: stage=' + stage + ' detail=' + detail)
        ctx.response({ data: { ok: true, intervalMinutes: getIntervalMinutes() } })
        return
      }

      if (request.method === MESSAGE_METHOD_SEND) {
        const fromService = request.source === MESSAGE_SOURCE_SERVICE
        // Before the webhook call, not after: this records that the service reached us, which is
        // true regardless of what Home Assistant then does with the data.
        if (fromService) recordServiceContact(request.timerMode)
        sendToWebhook(request.payload).then((result) => {
          recordSendResult(result)
          // Counted on delivery, not on webhook success: the question this answers is whether the
          // service is running and reaching the phone, which a webhook misconfiguration must not
          // mask.
          if (fromService) {
            recordBackgroundSend(request.trigger)
            recordServiceReport({ stage: SERVICE_STAGE_OK, detail: result.error || '' })
          }
          const data = { ...result, intervalMinutes: getIntervalMinutes(), background: backgroundSummary() }
          logger.log('responding to SEND: ' + JSON.stringify(data))
          ctx.response({ data })
        })
        return
      }

      // Pull only, and cheap: no sensors are read and no health data moves. The watch asks this on
      // every open and whenever the user taps Refresh, so it must stay a plain settings read.
      //
      // It carries the background summary too, which means refreshing the config also refreshes the
      // diagnostics — previously the only way to see them was to send a full sensor payload.
      if (request.method === MESSAGE_METHOD_GET_CONFIG) {
        const data = {
          ok: true,
          intervalMinutes: getIntervalMinutes(),
          configured: !!getWebhookUrl(),
          background: backgroundSummary(),
        }
        logger.log('responding to GET_CONFIG: ' + JSON.stringify(data))
        ctx.response({ data })
      }
    })
  },

  onRun() {},
  onDestroy() {},
})
