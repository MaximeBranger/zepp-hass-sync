import { gettext } from 'i18n'
import { formatDateTime } from '../shared/format-time'
import {
  SETTINGS_KEY_INTERVAL_MINUTES,
  SETTINGS_KEY_LAST_SYNC_ERROR,
  SETTINGS_KEY_LAST_SYNC_OK,
  SETTINGS_KEY_LAST_SYNC_TIME,
  SETTINGS_KEY_WEBHOOK_URL,
  clampIntervalMinutes,
} from '../shared/constants'

const GROUP_STYLE = {
  padding: '10px',
  marginBottom: '12px',
  border: '1px solid #eaeaea',
  borderRadius: '6px',
}

function buildStatusText(settingsStorage) {
  const lastSyncTime = parseInt(settingsStorage.getItem(SETTINGS_KEY_LAST_SYNC_TIME), 10)
  if (!lastSyncTime) {
    return gettext('statusNeverSynced')
  }

  const when = formatDateTime(lastSyncTime)
  const ok = settingsStorage.getItem(SETTINGS_KEY_LAST_SYNC_OK) === 'true'
  if (ok) {
    return `${gettext('statusOk')} — ${when}`
  }

  const error = settingsStorage.getItem(SETTINGS_KEY_LAST_SYNC_ERROR) || ''
  return `${gettext('statusFailed')}: ${error} (${when})`
}

AppSettingsPage({
  state: {
    props: {},
  },

  setWebhookUrl(value) {
    this.state.props.settingsStorage.setItem(SETTINGS_KEY_WEBHOOK_URL, value)
  },

  setIntervalMinutes(value) {
    const minutes = clampIntervalMinutes(value)
    this.state.props.settingsStorage.setItem(SETTINGS_KEY_INTERVAL_MINUTES, String(minutes))
  },

  build(props) {
    this.state.props = props
    const settingsStorage = props.settingsStorage
    const webhookUrl = settingsStorage.getItem(SETTINGS_KEY_WEBHOOK_URL) || ''
    const intervalMinutes = clampIntervalMinutes(settingsStorage.getItem(SETTINGS_KEY_INTERVAL_MINUTES))
    const statusText = buildStatusText(settingsStorage)

    return View(
      {
        style: {
          padding: '12px 20px',
        },
      },
      [
        View({ style: GROUP_STYLE }, [
          TextInput({
            label: gettext('webhookUrlLabel'),
            placeholder: gettext('webhookUrlPlaceholder'),
            value: webhookUrl,
            onChange: (value) => this.setWebhookUrl(value),
          }),
        ]),
        View({ style: GROUP_STYLE }, [
          TextInput({
            label: gettext('intervalLabel'),
            value: String(intervalMinutes),
            onChange: (value) => this.setIntervalMinutes(value),
          }),
        ]),
        View({ style: { ...GROUP_STYLE, marginBottom: 0 } }, [
          TextInput({
            label: gettext('statusLabel'),
            value: statusText,
            disabled: true,
          }),
        ]),
      ],
    )
  },
})
