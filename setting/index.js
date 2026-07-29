import { gettext } from 'i18n'
import { formatDateTime } from '../shared/format-time'
import {
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  INTERVAL_STEP_MINUTES,
  SETTINGS_KEY_INTERVAL_MINUTES,
  SETTINGS_KEY_LAST_SYNC_ERROR,
  SETTINGS_KEY_LAST_SYNC_OK,
  SETTINGS_KEY_LAST_SYNC_TIME,
  SETTINGS_KEY_WEBHOOK_URL,
  clampIntervalMinutes,
} from '../shared/constants'

const STATUS_COLOR_OK = '#3ac569'
const STATUS_COLOR_FAILED = '#e5533d'
const STATUS_COLOR_NEVER = '#8a8a8a'

function buildStatus(settingsStorage) {
  const lastSyncTime = parseInt(settingsStorage.getItem(SETTINGS_KEY_LAST_SYNC_TIME), 10)
  if (!lastSyncTime) {
    return { text: gettext('statusNeverSynced'), color: STATUS_COLOR_NEVER }
  }

  const when = formatDateTime(lastSyncTime)
  const ok = settingsStorage.getItem(SETTINGS_KEY_LAST_SYNC_OK) === 'true'
  if (ok) {
    return { text: `${gettext('statusOk')} — ${when}`, color: STATUS_COLOR_OK }
  }

  const error = settingsStorage.getItem(SETTINGS_KEY_LAST_SYNC_ERROR) || ''
  return { text: `${gettext('statusFailed')}: ${error} (${when})`, color: STATUS_COLOR_FAILED }
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
    const status = buildStatus(settingsStorage)

    return View({ style: { padding: '12px 20px' } }, [
      Section(
        {
          title: gettext('webhookSectionTitle'),
          description: gettext('webhookSectionDescription'),
        },
        [
          TextInput({
            label: gettext('webhookUrlLabel'),
            placeholder: gettext('webhookUrlPlaceholder'),
            value: webhookUrl,
            onChange: (value) => this.setWebhookUrl(value),
          }),
        ],
      ),
      Section(
        {
          title: gettext('intervalSectionTitle'),
          description: gettext('intervalSectionDescription'),
        },
        [
          Slider({
            label: `${intervalMinutes} ${gettext('intervalUnit')}`,
            min: MIN_INTERVAL_MINUTES,
            max: MAX_INTERVAL_MINUTES,
            step: INTERVAL_STEP_MINUTES,
            value: intervalMinutes,
            onChange: (value) => this.setIntervalMinutes(value),
          }),
        ],
      ),
      Section(
        {
          title: gettext('statusSectionTitle'),
        },
        [
          Text(
            {
              style: { color: status.color },
            },
            status.text,
          ),
        ],
      ),
    ])
  },
})
