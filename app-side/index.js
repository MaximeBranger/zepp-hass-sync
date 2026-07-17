import { MessageBuilder } from '../shared/message-side'
import { formatForZepp2Hass } from './format'
import {
  MESSAGE_METHOD_SET_INTERVAL,
  MESSAGE_METHOD_SYNC,
  SETTINGS_KEY_INTERVAL_MINUTES,
  SETTINGS_KEY_LAST_SYNC_ERROR,
  SETTINGS_KEY_LAST_SYNC_OK,
  SETTINGS_KEY_LAST_SYNC_TIME,
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
  return clampIntervalMinutes(settings.settingsStorage.getItem(SETTINGS_KEY_INTERVAL_MINUTES))
}

function recordSyncResult({ ok, error }) {
  settings.settingsStorage.setItem(SETTINGS_KEY_LAST_SYNC_OK, String(!!ok))
  settings.settingsStorage.setItem(SETTINGS_KEY_LAST_SYNC_ERROR, error || '')
  settings.settingsStorage.setItem(SETTINGS_KEY_LAST_SYNC_TIME, String(Math.floor(Date.now() / 1000)))
}

async function syncToWebhook(payload) {
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

      if (request.method === MESSAGE_METHOD_SYNC) {
        syncToWebhook(request.payload).then((result) => {
          recordSyncResult(result)
          const data = { ...result, intervalMinutes: getIntervalMinutes() }
          logger.log('responding to SYNC: ' + JSON.stringify(data))
          ctx.response({ data })
        })
        return
      }

      if (request.method === MESSAGE_METHOD_SET_INTERVAL) {
        const intervalMinutes = clampIntervalMinutes(request.payload && request.payload.intervalMinutes)
        settings.settingsStorage.setItem(SETTINGS_KEY_INTERVAL_MINUTES, String(intervalMinutes))
        const data = { ok: true, intervalMinutes }
        logger.log('responding to SET_INTERVAL: ' + JSON.stringify(data))
        ctx.response({ data })
      }
    })
  },

  onRun() {},
  onDestroy() {},
})
