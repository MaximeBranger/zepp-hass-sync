import { MessageBuilder } from '../shared/message-side'
import {
  DEFAULT_INTERVAL_MINUTES,
  MESSAGE_METHOD_GET_SETTINGS,
  MESSAGE_METHOD_SYNC,
  SETTINGS_KEY_INTERVAL_MINUTES,
  SETTINGS_KEY_WEBHOOK_URL,
} from '../shared/constants'

const messageBuilder = new MessageBuilder()

// `settings` is injected as an ambient global into the app-side context by the
// Zepp OS runtime (same convention as `settings/index.js`'s `props.settingsStorage`).
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
    return { ok: false, error: 'webhook URL not configured' }
  }

  try {
    const response = await fetch({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const status = response && response.status
    if (status >= 200 && status < 300) {
      return { ok: true }
    }
    return { ok: false, error: `webhook responded with status ${status}` }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
  }
}

AppSideService({
  onInit() {
    messageBuilder.listen(() => {})

    messageBuilder.on('request', (ctx) => {
      const request = messageBuilder.buf2Json(ctx.request.payload)

      if (request.method === MESSAGE_METHOD_GET_SETTINGS) {
        ctx.response({
          data: {
            webhookUrl: getWebhookUrl(),
            intervalMinutes: getIntervalMinutes(),
          },
        })
        return
      }

      if (request.method === MESSAGE_METHOD_SYNC) {
        syncToWebhook(request.payload).then((result) => {
          ctx.response({
            data: {
              ok: result.ok,
              error: result.error,
              intervalMinutes: getIntervalMinutes(),
            },
          })
        })
      }
    })
  },

  onRun() {},
  onDestroy() {},
})
