import { MessageBuilder } from '../shared/message-side'
import { formatForZepp2Hass } from './format'
import {
  DEFAULT_INTERVAL_MINUTES,
  MESSAGE_METHOD_SYNC,
  SETTINGS_KEY_INTERVAL_MINUTES,
  SETTINGS_KEY_WEBHOOK_URL,
} from '../shared/constants'

const messageBuilder = new MessageBuilder()
// `Logger` and `settings` are injected as ambient globals into the app-side context.
const logger = Logger.getLogger('hass-sync-app-side')

function getWebhookUrl() {
  return settings.settingsStorage.getItem(SETTINGS_KEY_WEBHOOK_URL) || ''
}

function getIntervalMinutes() {
  const raw = settings.settingsStorage.getItem(SETTINGS_KEY_INTERVAL_MINUTES)
  const parsed = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MINUTES
}

async function syncToWebhook(payload) {
  const url = getWebhookUrl()
  if (!url) {
    logger.error('no webhook URL configured')
    return { ok: false, error: 'webhook URL not configured — set it in the app settings' }
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
      return { ok: true }
    }
    return { ok: false, error: `webhook responded with status ${status}` }
  } catch (error) {
    logger.error('fetch() threw: ' + ((error && error.message) || error))
    return { ok: false, error: String((error && error.message) || error) }
  }
}

AppSideService({
  onInit() {
    logger.log('app-side onInit')
    messageBuilder.listen(() => {})

    messageBuilder.on('request', (ctx) => {
      const request = messageBuilder.buf2Json(ctx.request.payload)
      logger.log('received request, method=' + request.method)

      if (request.method !== MESSAGE_METHOD_SYNC) return

      syncToWebhook(request.payload).then((result) => {
        const data = { ...result, intervalMinutes: getIntervalMinutes() }
        logger.log('responding to SYNC: ' + JSON.stringify(data))
        ctx.response({ data })
      })
    })
  },

  onRun() {},
  onDestroy() {},
})
